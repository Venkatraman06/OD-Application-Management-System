using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using System.Security.Cryptography;
using System.Text;

namespace OnlineOD.Services
{
    public class EmailService
    {
        private readonly IConfiguration _config;

        public EmailService(IConfiguration config)
        {
            _config = config;
        }

        // ── Token helper (HMAC-SHA256, URL-safe base64) ──────────────────────
        private string GenerateToken(int odId, string action)
        {
            var secret = _config["EmailSettings:TokenSecret"] ?? "nasc-od-secret-key-2006-venkat-rp";
            var raw = $"{odId}:{action}:{secret}";
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
            return Convert.ToBase64String(bytes)
                          .Replace("+", "-").Replace("/", "_").Replace("=", "");
        }

        public bool ValidateToken(int odId, string action, string token)
            => token == GenerateToken(odId, action);

        // ── Shared send helper ────────────────────────────────────────────────
        private async Task SendAsync(string toEmail, string toName, string subject, string htmlBody)
        {
            var senderEmail = _config["EmailSettings:SenderEmail"];
            var senderPassword = _config["EmailSettings:SenderPassword"];
            var senderName = _config["EmailSettings:SenderName"];

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(senderName, senderEmail));
            message.To.Add(new MailboxAddress(toName, toEmail));
            message.Subject = subject;
            message.Body = new TextPart("html") { Text = htmlBody };

            using var smtp = new SmtpClient();
            await smtp.ConnectAsync("smtp.gmail.com", 587, SecureSocketOptions.StartTls);
            await smtp.AuthenticateAsync(senderEmail, senderPassword);
            await smtp.SendAsync(message);
            await smtp.DisconnectAsync(true);
        }

        // ── Approve/Reject button block ───────────────────────────────────────
        // staffId is embedded for role=="faculty" links only — it's what lets
        // EmailApproveController know WHICH staff clicked, so it can decide
        // only that staff's own section's members on a multi-section group OD.
        private string ActionButtons(int odId, string role, int staffId = 0)
        {
            var baseUrl = _config["EmailSettings:AppBaseUrl"] ?? "http://localhost:5088";
            var approveToken = GenerateToken(odId, "Approved");
            var rejectToken = GenerateToken(odId, "Rejected");
            var staffIdParam = role == "faculty" ? $"&staffId={staffId}" : "";
            var approveUrl = $"{baseUrl}/api/EmailApprove?odId={odId}&action=Approved&role={role}{staffIdParam}&token={approveToken}";
            var rejectUrl = $"{baseUrl}/api/EmailApprove?odId={odId}&action=Rejected&role={role}{staffIdParam}&token={rejectToken}";

            return $@"
            <div style='text-align:center;margin:24px 0'>
                <a href='{approveUrl}'
                   style='display:inline-block;padding:12px 32px;background:#10b981;color:white;
                          border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
                          margin-right:12px;letter-spacing:0.5px'>
                    ✓ Approve
                </a>
                <a href='{rejectUrl}'
                   style='display:inline-block;padding:12px 32px;background:#ef4444;color:white;
                          border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
                          letter-spacing:0.5px'>
                    ✕ Reject
                </a>
            </div>
            <p style='color:#9ca3af;font-size:12px;text-align:center'>
                Clicking a button updates the status instantly — no login required.<br>
                Each link works only once.
            </p>";
        }

        // ── OD details table rows ─────────────────────────────────────────────
        private string OdRows(string studentName, string registerNumber,
                              string department, string eventName,
                              string fromDate, string toDate,
                              bool isGroup = false, string groupName = "",
                              string registerNumbers = "", string collegeIndustry = "")
        {
            // "Group Name" shows the group's label; "Members" shows the actual
            // register numbers of everyone in the group — these were being
            // conflated into one row before, so the email only ever showed
            // the group name and never who was actually in it.
            var membersFormatted = string.IsNullOrWhiteSpace(registerNumbers)
                ? ""
                : string.Join(", ", registerNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

            var groupRows = isGroup
                ? (string.IsNullOrEmpty(groupName) ? "" : $"<tr><td style='padding:6px 0;color:#6b7280;width:140px'>Group Name</td><td style='color:#111827'>{groupName}</td></tr>")
                  + (string.IsNullOrEmpty(membersFormatted) ? "" : $"<tr><td style='padding:6px 0;color:#6b7280;width:140px;vertical-align:top'>Members</td><td style='color:#111827'>{membersFormatted}</td></tr>")
                : "";

            var collegeRow = string.IsNullOrEmpty(collegeIndustry)
                ? ""
                : $"<tr><td style='padding:6px 0;color:#6b7280;width:140px'>College / Industry</td><td style='color:#111827'>{collegeIndustry}</td></tr>";

            return $@"
            <table style='width:100%;border-collapse:collapse;font-size:14px'>
                <tr><td style='padding:6px 0;color:#6b7280;width:140px'>Student Name</td><td style='color:#111827'><b>{studentName}</b></td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Register Number</td><td style='color:#111827'>{registerNumber}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Department</td><td style='color:#111827'>{department}</td></tr>
                {collegeRow}
                <tr><td style='padding:6px 0;color:#6b7280'>Event</td><td style='color:#111827'>{eventName}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>From Date</td><td style='color:#111827'>{fromDate}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>To Date</td><td style='color:#111827'>{toDate}</td></tr>
                {groupRows}
            </table>";
        }

        // ── Email wrapper shell ───────────────────────────────────────────────
        private string Wrap(string recipientName, string intro, string tableRows,
                            string actionButtons, bool isGroup = false)
        {
            var badge = isGroup
                ? "<span style='background:#6366f1;color:white;padding:2px 10px;border-radius:12px;font-size:12px;margin-left:8px'>Group OD</span>"
                : "";

            return $@"
            <div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;
                        border:1px solid #e5e7eb;border-radius:12px;overflow:hidden'>
                <div style='background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center'>
                    <h1 style='color:white;margin:0;font-size:22px'>OD Application {badge}</h1>
                    <p style='color:#e0e7ff;margin:6px 0 0'>On Duty Management System — Nandha Arts & Science College</p>
                </div>
                <div style='padding:28px'>
                    <p style='font-size:16px;color:#111827'>Dear <b>{recipientName}</b>,</p>
                    <p style='color:#374151'>{intro}</p>
                    <div style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;
                                padding:20px;margin:20px 0'>
                        <h3 style='margin:0 0 14px;color:#6366f1;font-size:15px'>OD Request Details</h3>
                        {tableRows}
                    </div>
                    {actionButtons}
                    <p style='color:#9ca3af;font-size:13px;margin-top:24px'>
                        This is an automated notification from OD Application.
                    </p>
                </div>
            </div>";
        }

        // ── 1. Faculty notification (individual or group OD) ─────────────────
        public async Task SendOdSubmissionEmailAsync(
            string toEmail, string staffName,
            string studentName, string registerNumber,
            string eventName, string department,
            string fromDate, string toDate,
            int odId,
            int staffId = 0,
            bool isGroup = false,
            string groupName = "",
            string registerNumbers = "",
            string collegeIndustry = "")
        {
            var subjectTag = isGroup ? "[Group OD]" : "";
            var intro = isGroup
                ? "A <b>Group OD</b> request has been submitted and requires your approval."
                : "A student has submitted a new OD request that requires your approval.";

            var rows = OdRows(studentName, registerNumber, department, eventName, fromDate, toDate, isGroup, groupName, registerNumbers, collegeIndustry);
            var buttons = ActionButtons(odId, "faculty", staffId);
            var body = Wrap(staffName, intro, rows, buttons, isGroup);

            await SendAsync(toEmail, staffName,
                $"New {subjectTag} OD Request — {studentName} ({registerNumber})", body);
        }

        // ── 2. HOD notification (after faculty approves) ─────────────────────
        public async Task SendOdApprovalEmailAsync(
            string toEmail, string hodName,
            string studentName, string registerNumber,
            string eventName, string department,
            string fromDate, string toDate,
            int odId,
            bool isGroup = false,
            string groupName = "",
            string registerNumbers = "",
            string collegeIndustry = "")
        {
            var subjectTag = isGroup ? "[Group OD] " : "";
            var intro = isGroup
                ? "A <b>Group OD</b> request has been <b style='color:#10b981'>approved by Faculty</b> and is waiting for your final approval."
                : "A student OD request has been <b style='color:#10b981'>approved by Faculty</b> and is waiting for your final approval.";

            var rows = OdRows(studentName, registerNumber, department, eventName, fromDate, toDate, isGroup, groupName, registerNumbers, collegeIndustry);
            var buttons = ActionButtons(odId, "hod");
            var body = Wrap(hodName, intro, rows, buttons, isGroup);

            await SendAsync(toEmail, hodName,
                $"{subjectTag}OD Approval Required — {studentName} ({registerNumber})", body);
        }
    }
}