using Microsoft.AspNetCore.Mvc;
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

        public EmailApproveController(IOdApplyService odService, EmailService emailService, IHodService hodService)
        {
            _odService = odService;
            _emailService = emailService;
            _hodService = hodService;
        }

        // GET /api/EmailApprove?odId=5&action=Approved&role=faculty&token=xyz
        [HttpGet]
        public async Task<ContentResult> Handle(
            [FromQuery] int odId,
            [FromQuery] string action,
            [FromQuery] string token,
            [FromQuery] string role = "faculty")
        {
            // ── Validate token ─────────────────────────────────────────────
            if (!_emailService.ValidateToken(odId, action, token))
                return Content(Page("❌ Invalid or expired link.",
                    "This link is not valid or has already been used.", false), "text/html");

            if (action != "Approved" && action != "Rejected")
                return Content(Page("❌ Unknown action.", "", false), "text/html");

            // ── Lock: once faculty/HOD has already made a decision, the same
            // (or the other) email link can no longer change it. This stops
            // someone re-clicking Approve after Reject (or vice versa), or the
            // same link being used twice.
            var existingOd = await _odService.GetOdApplyByIdAsync(odId);
            if (existingOd == null)
                return Content(Page("❌ Not found.", "This OD request no longer exists.", false), "text/html");

            var currentStatus = role == "hod" ? existingOd.HodStatus : existingOd.FacultyStatus;
            if (!string.IsNullOrEmpty(currentStatus) && currentStatus != "Pending")
            {
                var roleLabelLocked = role == "hod" ? "HOD" : "Faculty";
                return Content(Page("⚠️ Already decided.",
                    $"OD #{odId} has already been <b>{currentStatus}</b> by {roleLabelLocked}. " +
                    "This decision cannot be changed.", false), "text/html");
            }

            // ── Apply the status update ────────────────────────────────────
            if (role == "hod")
            {
                await _odService.UpdateHodStatusAsync(odId, action);
            }
            else
            {
                var od = await _odService.UpdateFacultyStatusAsync(odId, action);

                // When faculty approves via the email link (this endpoint),
                // the HOD must be notified too — same as when faculty approves
                // from the staff webpage (see StaffController.Approve).
                // Without this block, approving from the email silently never
                // emailed the HOD at all.
                if (od != null && action == "Approved")
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
                true), "text/html");
        }

        // ── Simple confirmation HTML page ──────────────────────────────────
        private static string Page(string heading, string body, bool success) => $@"
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
    .brand {{
      margin-top:32px;font-size:12px;color:#9ca3af;
      border-top:1px solid #f3f4f6;padding-top:16px;
    }}
  </style>
</head>
<body>
  <div class='card'>
    <div class='icon'>{(success ? "✅" : "❌")}</div>
    <h2>{heading}</h2>
    <p>{body}</p>
    <div class='brand'>OD Application — Nandha Arts &amp; Science College</div>
  </div>
</body>
</html>";
    }
}