using Microsoft.AspNetCore.Mvc;
using OnlineOD.Models;
using OnlineOD.Service;
using OnlineOD.Services;
using System.Linq;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EmailApproveController : ControllerBase
    {
        private readonly IOdApplyService _odService;
        private readonly EmailService _emailService;
        private readonly IHodService _hodService;
        private readonly IConfiguration _config;

        public EmailApproveController(IOdApplyService odService, EmailService emailService, IHodService hodService, IConfiguration config)
        {
            _odService = odService;
            _emailService = emailService;
            _hodService = hodService;
            _config = config;
        }

        // GET /api/EmailApprove?odId=5&action=Approved&role=faculty&staffId=3&token=xyz
        [HttpGet]
        public async Task<ContentResult> Handle(
            [FromQuery] int odId,
            [FromQuery] string action,
            [FromQuery] string token,
            [FromQuery] string role = "faculty",
            [FromQuery] int staffId = 0)
        {
            // Resolve the frontend portal URL once — read from Render env var
            // EmailSettings__PortalBaseUrl; falls back to the production Vercel URL.
            var portalUrl = Environment.GetEnvironmentVariable("EmailSettings__PortalBaseUrl")
                         ?? _config["EmailSettings:PortalBaseUrl"]
                         ?? "https://od-application-management-system.vercel.app";

            // ── Validate token ─────────────────────────────────────────────
            if (!_emailService.ValidateToken(odId, action, token))
                return Content(Page("❌ Invalid or expired link.",
                    "This link is not valid or has already been used.", false, portalUrl), "text/html");

            if (action != "Approved" && action != "Rejected")
                return Content(Page("❌ Unknown action.", "", false, portalUrl), "text/html");

            // ── Lock: once faculty/HOD has already made a decision, the same
            // (or the other) email link can no longer change it. This stops
            // someone re-clicking Approve after Reject (or vice versa), or the
            // same link being used twice.
            var existingOd = await _odService.GetOdApplyByIdAsync(odId);
            if (existingOd == null)
                return Content(Page("❌ Not found.", "This OD request no longer exists.", false, portalUrl), "text/html");

            var currentStatus = role == "hod" ? existingOd.HodStatus : existingOd.FacultyStatus;
            if (!string.IsNullOrEmpty(currentStatus) && currentStatus != "Pending")
            {
                var roleLabelLocked = role == "hod" ? "HOD" : "Faculty";
                return Content(Page("⚠️ Already decided.",
                    $"OD #{odId} has already been <b>{currentStatus}</b> by {roleLabelLocked}. " +
                    "This decision cannot be changed.", false, portalUrl), "text/html");
            }

            // ── Lock: once the OD is already ongoing or in the past (today is
            // on/after FromDate), the one-click email link can no longer approve
            // or reject it either — same rule enforced on the staff/HOD
            // webpages, so this can't be used to bypass that restriction.
            if (IsOdOngoing(existingOd.FromDate, existingOd.ToDate))
            {
                return Content(Page("⚠️ OD decision window closed.",
                    $"OD #{odId} is already in progress or has passed (its decision window has closed). " +
                    "It can no longer be approved or rejected.", false, portalUrl), "text/html");
            }

            // ── Apply the status update ────────────────────────────────────
            if (role == "hod")
            {
                await _odService.UpdateHodStatusAsync(odId, action);
            }
            else
            {
                if (staffId <= 0)
                {
                    return Content(Page("❌ Outdated link.",
                        "This approval link is missing staff information and can't be used. " +
                        "Please ask the student to resubmit the OD, or use the staff dashboard instead.",
                        false, portalUrl), "text/html");
                }

                OdApply? od;
                try
                {
                    od = await _odService.ApproveByStaffAsync(odId, action, staffId);
                }
                catch (InvalidOperationException ex)
                {
                    return Content(Page("❌ Not your section.", ex.Message, false, portalUrl), "text/html");
                }

                // When the OD's OVERALL FacultyStatus becomes "Approved" (for a
                // multi-section group OD, only once EVERY section has decided),
                // the HOD must be notified — same as StaffController.Approve.
                if (od != null && od.FacultyStatus == "Approved")
                {
                    try
                    {
                        var hods = await _hodService.GetAllHodAsync();
                        var hod = hods.FirstOrDefault(h =>
                            h.Department != null &&
                            h.Department.Trim().ToLower() == (od.department ?? "").Trim().ToLower());

                        if (hod != null && !string.IsNullOrWhiteSpace(hod.Email))
                        {
                            await _emailService.SendOdApprovalEmailAsync(
                                toEmail: hod.Email,
                                hodName: hod.Name,
                                studentName: od.StudentName ?? "",
                                registerNumber: od.registerNumber ?? "",
                                eventName: od.Event ?? "",
                                department: od.department ?? "",
                                fromDate: od.FromDate ?? "",
                                toDate: od.ToDate ?? "",
                                odId: od.OdId,
                                isGroup: od.IsGroupOd,
                                groupName: od.GroupName ?? ""
                            );
                            Console.WriteLine($"[Email] HOD notify sent to {hod.Email} for OD #{od.OdId} (via email-approve link)");
                        }
                        else
                        {
                            Console.WriteLine($"[Email] HOD notify skipped (via email-approve link) — " +
                                (hod == null
                                    ? $"No HOD record found for department '{od.department}'."
                                    : $"HOD '{hod.Name}' has no Email set."));
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"[Email] HOD notify FAILED (via email-approve link) — {ex.Message}");
                    }
                }
            }

            var roleLabel = role == "hod" ? "HOD" : "Faculty";
            var actionLabel = action == "Approved" ? "approved ✓" : "rejected ✕";
            var color = action == "Approved" ? "#10b981" : "#ef4444";

            return Content(Page(
                $"<span style='color:{color}'>{action}</span>",
                $"OD #{odId} has been <b style='color:{color}'>{actionLabel}</b> by {roleLabel}.<br>" +
                $"The student's status page will reflect this immediately.",
                true, portalUrl), "text/html");
        }

        // True once today is on/after the OD's own FromDate — covers an OD
        // currently in progress AND one whose dates are already fully over.
        // Used to lock out approve/reject once the decision window has
        // begun or passed with no action taken.
        private static bool IsOdOngoing(string? fromDateRaw, string? toDateRaw)
        {
            if (!DateTime.TryParse(fromDateRaw, out var from))
                return false;
            var today = DateTime.Today;
            return today >= from.Date;
        }

        // ── Simple confirmation HTML page ──────────────────────────────────
        // portalUrl is the Vercel frontend URL read from EmailSettings:PortalBaseUrl,
        // so the Visit Portal button links to the actual login page, not the Render backend.
        private static string Page(string heading, string body, bool success, string portalUrl) => $@"
<!DOCTYPE html>
<html lang='en'>
<head>
  <meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <title>OD {heading}</title>
  <style>
    * {{ margin:0;padding:0;box-sizing:border-box; }}
    body {{
      font-family:Arial,sans-serif;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;background:#f3f4f6;
    }}
    .card {{
      background:#fff;border-radius:16px;padding:48px 40px;
      max-width:440px;width:90%;text-align:center;
      box-shadow:0 4px 24px rgba(0,0,0,.08);
      border:1px solid #e5e7eb;
    }}
    .icon {{ font-size:56px;margin-bottom:16px; }}
    h2 {{ font-size:22px;color:#111827;margin-bottom:12px; }}
    p  {{ color:#6b7280;font-size:15px;line-height:1.6; }}
    .portal-btn {{
      display:inline-block;
      margin-top:24px;
      padding:12px 28px;
      background:#6366f1;
      color:#ffffff;
      text-decoration:none;
      border-radius:8px;
      font-weight:700;
      font-size:14px;
      transition:opacity 0.2s;
    }}
    .portal-btn:hover {{ opacity:0.9; }}
    .brand {{
      margin-top:24px;font-size:12px;color:#9ca3af;
      border-top:1px solid #f3f4f6;padding-top:16px;
    }}
  </style>
</head>
<body>
  <div class='card'>
    <div class='icon'>{(success ? "✅" : "❌")}</div>
    <h2>{heading}</h2>
    <p>{body}</p>
    <a href='{portalUrl}' class='portal-btn'>🔗 Visit Portal / Login</a>
    <div class='brand'>OD Application — Nandha Arts &amp; Science College</div>
  </div>
</body>
</html>";
    }
}