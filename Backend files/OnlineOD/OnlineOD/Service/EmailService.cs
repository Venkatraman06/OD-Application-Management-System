using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace OnlineOD.Services
{
    public class EmailService
    {
        private readonly IConfiguration _config;
        private static readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

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
            var resendApiKey = Environment.GetEnvironmentVariable("EmailSettings__ResendApiKey")
                            ?? Environment.GetEnvironmentVariable("RESEND_API_KEY")
                            ?? _config["EmailSettings:ResendApiKey"];

            var senderEmail = Environment.GetEnvironmentVariable("EmailSettings__SenderEmail")
                           ?? _config["EmailSettings:SenderEmail"]
                           ?? "onboarding@resend.dev";

            var senderName = Environment.GetEnvironmentVariable("EmailSettings__SenderName")
                          ?? _config["EmailSettings:SenderName"]
                          ?? "OD Application";

            bool hasResendKey = !string.IsNullOrWhiteSpace(resendApiKey);
            Console.WriteLine($"[EmailService] Resend API key configured: {hasResendKey}");

            if (hasResendKey)
            {
                await SendViaResendAsync(resendApiKey!.Trim(), senderName, senderEmail, toEmail, subject, htmlBody);
            }
            else
            {
                Console.WriteLine("[EmailService] Falling back to SMTP because no Resend API key was found in configuration.");
                await SendViaSmtpAsync(senderName, senderEmail, toEmail, toName, subject, htmlBody);
            }
        }

        private async Task SendViaResendAsync(string apiKey, string senderName, string senderEmail, string toEmail, string subject, string htmlBody)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.resend.com/emails");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

            var fromAddress = !string.IsNullOrWhiteSpace(senderName)
                ? $"{senderName} <{senderEmail}>"
                : senderEmail;

            var payload = new
            {
                from = fromAddress,
                to = new[] { toEmail },
                subject = subject,
                html = htmlBody
            };

            var json = JsonSerializer.Serialize(payload);
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request);
            var responseBody = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[EmailService] Resend response: HTTP {(int)response.StatusCode} OK. Email sent successfully to {toEmail}.");
            }
            else
            {
                Console.WriteLine($"[EmailService] Resend response: HTTP {(int)response.StatusCode} ({response.ReasonPhrase})");
                Console.WriteLine($"[EmailService] Resend error details: {responseBody}");
                throw new InvalidOperationException($"[Resend API Error] HTTP {(int)response.StatusCode}: {responseBody}");
            }
        }

        private async Task SendViaSmtpAsync(string senderName, string senderEmail, string toEmail, string toName, string subject, string htmlBody)
        {
            var senderPassword = Environment.GetEnvironmentVariable("EmailSettings__SenderPassword")
                              ?? _config["EmailSettings:SenderPassword"];

            var host = Environment.GetEnvironmentVariable("EmailSettings__SmtpHost")
                    ?? _config["EmailSettings:SmtpHost"]
                    ?? "smtp.gmail.com";

            var portStr = Environment.GetEnvironmentVariable("EmailSettings__SmtpPort")
                       ?? _config["EmailSettings:SmtpPort"];
            int port = int.TryParse(portStr, out var parsedPort) ? parsedPort : 587;

            var securityStr = Environment.GetEnvironmentVariable("EmailSettings__SecureSocketOptions")
                           ?? Environment.GetEnvironmentVariable("EmailSettings__SmtpSecurity")
                           ?? _config["EmailSettings:SecureSocketOptions"]
                           ?? _config["EmailSettings:SmtpSecurity"];

            SecureSocketOptions security;
            if (Enum.TryParse<SecureSocketOptions>(securityStr, true, out var parsedSecurity))
            {
                security = parsedSecurity;
            }
            else if (port == 465)
            {
                security = SecureSocketOptions.SslOnConnect;
            }
            else if (port == 587)
            {
                security = SecureSocketOptions.StartTls;
            }
            else
            {
                security = SecureSocketOptions.Auto;
            }

            var timeoutStr = Environment.GetEnvironmentVariable("EmailSettings__TimeoutSeconds")
                          ?? _config["EmailSettings:TimeoutSeconds"];
            int timeoutSeconds = int.TryParse(timeoutStr, out var parsedTimeout) ? parsedTimeout : 30;

            Console.WriteLine($"[EmailService] SMTP configuration selected -> Host: {host}, Port: {port}, Security: {security}, Timeout: {timeoutSeconds}s");

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(senderName, senderEmail));
            message.To.Add(new MailboxAddress(toName, toEmail));
            message.Subject = subject;
            message.Body = new TextPart("html") { Text = htmlBody };

            using var smtp = new SmtpClient();
            smtp.Timeout = timeoutSeconds * 1000;
            smtp.CheckCertificateRevocation = false;

            try
            {
                Console.WriteLine($"[EmailService] [SMTP Step 1/3] Connecting to {host}:{port} using {security} (timeout: {timeoutSeconds}s)...");
                await smtp.ConnectAsync(host, port, security);
                Console.WriteLine($"[EmailService] [SMTP Step 1/3] Connected successfully to {host}:{port}.");

                if (!string.IsNullOrEmpty(senderEmail) && !string.IsNullOrEmpty(senderPassword))
                {
                    Console.WriteLine($"[EmailService] [SMTP Step 2/3] Authenticating as {senderEmail}...");
                    await smtp.AuthenticateAsync(senderEmail, senderPassword);
                    Console.WriteLine($"[EmailService] [SMTP Step 2/3] Authenticated successfully as {senderEmail}.");
                }
                else
                {
                    Console.WriteLine("[EmailService] [SMTP Step 2/3] Authentication skipped (empty sender credentials).");
                }

                Console.WriteLine($"[EmailService] [SMTP Step 3/3] Sending email to {toEmail} (Subject: {subject})...");
                await smtp.SendAsync(message);
                Console.WriteLine($"[EmailService] [SMTP Step 3/3] Email sent successfully to {toEmail} via SMTP.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[EmailService] SMTP send failure -> Type: {ex.GetType().FullName}, Message: {ex.Message}");
                throw;
            }
            finally
            {
                if (smtp.IsConnected)
                {
                    try
                    {
                        await smtp.DisconnectAsync(true);
                    }
                    catch (Exception discEx)
                    {
                        Console.WriteLine($"[EmailService] SMTP disconnect notice: {discEx.Message}");
                    }
                }
            }
        }

        // ── Approve/Reject button block ───────────────────────────────────────
        // staffId is embedded for role=="faculty" links only — it's what lets
        // EmailApproveController know WHICH staff clicked, so it can decide
        // only that staff's own section's members on a multi-section group OD.
        private string ActionButtons(int odId, string role, int staffId = 0)
        {
            var baseUrl = Environment.GetEnvironmentVariable("EmailSettings__AppBaseUrl")
                       ?? _config["EmailSettings:AppBaseUrl"]
                       ?? "https://od-application-backend.onrender.com";

            var portalBaseUrl = Environment.GetEnvironmentVariable("EmailSettings__PortalBaseUrl")
                             ?? _config["EmailSettings:PortalBaseUrl"]
                             ?? "https://od-application-management-system-q7.vercel.app";

            var approveToken = GenerateToken(odId, "Approved");
            var rejectToken = GenerateToken(odId, "Rejected");
            var staffIdParam = role == "faculty" ? $"&staffId={staffId}" : "";
            var approveUrl = $"{baseUrl.TrimEnd('/')}/api/EmailApprove?odId={odId}&action=Approved&role={role}{staffIdParam}&token={approveToken}";
            var rejectUrl = $"{baseUrl.TrimEnd('/')}/api/EmailApprove?odId={odId}&action=Rejected&role={role}{staffIdParam}&token={rejectToken}";
            var portalUrl = portalBaseUrl.TrimEnd('/');

            return $@"
            <div style='text-align:center;margin:24px 0'>
                <a href='{approveUrl}'
                   style='display:inline-block;padding:12px 28px;background:#10b981;color:white;
                          border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
                          margin-right:10px;margin-bottom:8px;letter-spacing:0.5px'>
                    ✓ Approve
                </a>
                <a href='{rejectUrl}'
                   style='display:inline-block;padding:12px 28px;background:#ef4444;color:white;
                          border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
                          margin-right:10px;margin-bottom:8px;letter-spacing:0.5px'>
                    ✕ Reject
                </a>
                <a href='{portalUrl}'
                   style='display:inline-block;padding:12px 28px;background:#6366f1;color:white;
                          border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;
                          margin-bottom:8px;letter-spacing:0.5px'>
                    🔗 Visit Portal
                </a>
            </div>
            <p style='color:#9ca3af;font-size:12px;text-align:center'>
                Clicking Approve or Reject updates the status instantly — no login required.<br>
                Click <b>Visit Portal</b> to log in to the OD Application System.
            </p>";
        }

        // ── OD details table rows ─────────────────────────────────────────────
        private string OdRows(string studentName, string registerNumber,
                              string department, string eventName,
                              string fromDate, string toDate,
                              bool isGroup = false, string groupName = "",
                              string registerNumbers = "", string collegeIndustry = "",
                              string startTime = "", string endTime = "")
        {
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

            var startTimeRow = string.IsNullOrWhiteSpace(startTime)
                ? ""
                : $"<tr><td style='padding:6px 0;color:#6b7280'>Start Time</td><td style='color:#111827'>{startTime}</td></tr>";

            var endTimeRow = string.IsNullOrWhiteSpace(endTime)
                ? ""
                : $"<tr><td style='padding:6px 0;color:#6b7280'>End Time</td><td style='color:#111827'>{endTime}</td></tr>";

            return $@"
            <table style='width:100%;border-collapse:collapse;font-size:14px'>
                <tr><td style='padding:6px 0;color:#6b7280;width:140px'>Student Name</td><td style='color:#111827'><b>{studentName}</b></td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Register Number</td><td style='color:#111827'>{registerNumber}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Department</td><td style='color:#111827'>{department}</td></tr>
                {collegeRow}
                <tr><td style='padding:6px 0;color:#6b7280'>Event</td><td style='color:#111827'>{eventName}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>From Date</td><td style='color:#111827'>{fromDate}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>To Date</td><td style='color:#111827'>{toDate}</td></tr>
                {startTimeRow}
                {endTimeRow}
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
                    <div style='background:#f9fafb;border:1px solid #e5e5eb;border-radius:10px;
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
            string collegeIndustry = "",
            string startTime = "",
            string endTime = "")
        {
            var subjectTag = isGroup ? "[Group OD]" : "";
            var intro = isGroup
                ? "A <b>Group OD</b> request has been submitted and requires your approval."
                : "A student has submitted a new OD request that requires your approval.";

            var rows = OdRows(studentName, registerNumber, department, eventName, fromDate, toDate, isGroup, groupName, registerNumbers, collegeIndustry, startTime, endTime);
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
            string collegeIndustry = "",
            string startTime = "",
            string endTime = "")
        {
            var subjectTag = isGroup ? "[Group OD] " : "";
            var intro = isGroup
                ? "A <b>Group OD</b> request has been <b style='color:#10b981'>approved by Faculty</b> and is waiting for your final approval."
                : "A student OD request has been <b style='color:#10b981'>approved by Faculty</b> and is waiting for your final approval.";

            var rows = OdRows(studentName, registerNumber, department, eventName, fromDate, toDate, isGroup, groupName, registerNumbers, collegeIndustry, startTime, endTime);
            var buttons = ActionButtons(odId, "hod");
            var body = Wrap(hodName, intro, rows, buttons, isGroup);

            await SendAsync(toEmail, hodName,
                $"{subjectTag}OD Approval Required — {studentName} ({registerNumber})", body);
        }

        // ── 3. "Contact Admin" form on the login page ─────────────────────────
        public async Task SendContactAdminEmailAsync(
            string registerNumber, string dob, string password, string role, string message)
        {
            var adminEmail = _config["EmailSettings:AdminEmail"] ?? _config["EmailSettings:SenderEmail"];

            var rows = $@"
            <table style='width:100%;border-collapse:collapse;font-size:14px'>
                <tr><td style='padding:6px 0;color:#6b7280;width:160px'>Role</td><td style='color:#111827'><b>{role}</b></td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Register / Staff No.</td><td style='color:#111827'>{registerNumber}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Date of Birth</td><td style='color:#111827'>{dob}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280'>Password (as entered)</td><td style='color:#111827'>{password}</td></tr>
                <tr><td style='padding:6px 0;color:#6b7280;vertical-align:top'>Message / Report</td><td style='color:#111827;white-space:pre-wrap'>{message}</td></tr>
            </table>";

            var intro = "A user submitted the <b>Contact Admin</b> form from the login page. " +
                        "They may need account creation, a password reset, or help with the issue below.";

            var body = Wrap("Admin", intro, rows, "");

            await SendAsync(adminEmail, "Admin",
                $"Contact Admin — {role} ({registerNumber})", body);
        }

        // ── 4. Forgot Password verification code ─────────────────────────────
        public async Task SendPasswordResetCodeAsync(string toEmail, string toName, string code)
        {
            var content = $@"
            <div style='text-align:center;padding:10px 0;'>
                <p style='color:#374151;font-size:15px;margin-bottom:16px;'>
                    You recently requested to reset your password for the <b>OD Application Management System</b>.
                </p>
                <p style='color:#6b7280;font-size:14px;margin-bottom:8px;'>
                    Use the verification code below to complete your password reset:
                </p>
                <div style='display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#eef2ff,#e0e7ff);border:2px dashed #6366f1;border-radius:12px;margin:16px 0;'>
                    <span style='font-family:monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:#4f46e5;'>{code}</span>
                </div>
                <p style='color:#ef4444;font-size:13px;font-weight:600;margin-top:12px;'>
                    ⏳ This code expires in 10 minutes.
                </p>
                <p style='color:#9ca3af;font-size:12px;margin-top:20px;border-top:1px solid #f3f4f6;padding-top:14px;'>
                    If you did not request a password reset, please ignore this email or contact the administrator immediately.
                </p>
            </div>";

            var body = Wrap(toName, "Password Reset Request", content, "");

            await SendAsync(toEmail, toName, "Your Password Reset Verification Code — OD Application", body);
        }
    }
}