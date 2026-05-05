using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;

namespace OnlineOD.Services
{
    public class EmailService
    {
        private readonly IConfiguration _config;

        public EmailService(IConfiguration config)
        {
            _config = config;
        }

        public async Task SendOdApprovalEmailAsync(
            string toEmail,
            string hodName,
            string studentName,
            string registerNumber,
            string eventName,
            string department,
            string fromDate,
            string toDate)
        {
            var senderEmail = _config["EmailSettings:SenderEmail"];
            var senderPassword = _config["EmailSettings:SenderPassword"];
            var senderName = _config["EmailSettings:SenderName"];

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(senderName, senderEmail));
            message.To.Add(new MailboxAddress(hodName, toEmail));
            message.Subject = $"OD Approval Required — {studentName} ({registerNumber})";

            message.Body = new TextPart("html")
            {
                Text = $@"
                <div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden'>
                    <div style='background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center'>
                        <h1 style='color:white;margin:0;font-size:22px'>OD Application</h1>
                        <p style='color:#e0e7ff;margin:6px 0 0'>On Duty Management System</p>
                    </div>
                    <div style='padding:28px'>
                        <p style='font-size:16px;color:#111827'>Dear <b>{hodName}</b>,</p>
                        <p style='color:#374151'>A student OD request has been <b style='color:#10b981'>approved by Faculty</b> and is waiting for your final approval.</p>

                        <div style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0'>
                            <h3 style='margin:0 0 14px;color:#6366f1;font-size:15px'>OD Request Details</h3>
                            <table style='width:100%;border-collapse:collapse;font-size:14px'>
                                <tr><td style='padding:6px 0;color:#6b7280;width:140px'>Student Name</td><td style='color:#111827'><b>{studentName}</b></td></tr>
                                <tr><td style='padding:6px 0;color:#6b7280'>Register Number</td><td style='color:#111827'>{registerNumber}</td></tr>
                                <tr><td style='padding:6px 0;color:#6b7280'>Department</td><td style='color:#111827'>{department}</td></tr>
                                <tr><td style='padding:6px 0;color:#6b7280'>Event</td><td style='color:#111827'>{eventName}</td></tr>
                                <tr><td style='padding:6px 0;color:#6b7280'>From Date</td><td style='color:#111827'>{fromDate}</td></tr>
                                <tr><td style='padding:6px 0;color:#6b7280'>To Date</td><td style='color:#111827'>{toDate}</td></tr>
                            </table>
                        </div>

                        <p style='color:#374151'>Please log in to the OD Application to approve or reject this request.</p>
                        <p style='color:#9ca3af;font-size:13px;margin-top:24px'>This is an automated notification from OD Application.</p>
                    </div>
                </div>"
            };


            using var smtp = new SmtpClient();
            await smtp.ConnectAsync("smtp.gmail.com", 587, SecureSocketOptions.StartTls);
            await smtp.AuthenticateAsync(senderEmail, senderPassword);
            await smtp.SendAsync(message);
            await smtp.DisconnectAsync(true);
        }
        public async Task SendOdSubmissionEmailAsync(
    string toEmail,
    string staffName,
    string studentName,
    string registerNumber,
    string eventName,
    string department,
    string fromDate,
    string toDate)
        {
            var senderEmail = _config["EmailSettings:SenderEmail"];
            var senderPassword = _config["EmailSettings:SenderPassword"];
            var senderName = _config["EmailSettings:SenderName"];

            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(senderName, senderEmail));
            message.To.Add(new MailboxAddress(staffName, toEmail));
            message.Subject = $"New OD Request — {studentName} ({registerNumber})";

            message.Body = new TextPart("html")
            {
                Text = $@"
        <div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden'>
            <div style='background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px;text-align:center'>
                <h1 style='color:white;margin:0;font-size:22px'>OD Application</h1>
                <p style='color:#e0e7ff;margin:6px 0 0'>On Duty Management System</p>
            </div>
            <div style='padding:28px'>
                <p style='font-size:16px;color:#111827'>Dear <b>{staffName}</b>,</p>
                <p style='color:#374151'>A student has submitted a new OD request that requires your approval.</p>

                <div style='background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:20px 0'>
                    <h3 style='margin:0 0 14px;color:#6366f1;font-size:15px'>OD Request Details</h3>
                    <table style='width:100%;border-collapse:collapse;font-size:14px'>
                        <tr><td style='padding:6px 0;color:#6b7280;width:140px'>Student Name</td><td style='color:#111827'><b>{studentName}</b></td></tr>
                        <tr><td style='padding:6px 0;color:#6b7280'>Register Number</td><td style='color:#111827'>{registerNumber}</td></tr>
                        <tr><td style='padding:6px 0;color:#6b7280'>Department</td><td style='color:#111827'>{department}</td></tr>
                        <tr><td style='padding:6px 0;color:#6b7280'>Event</td><td style='color:#111827'>{eventName}</td></tr>
                        <tr><td style='padding:6px 0;color:#6b7280'>From Date</td><td style='color:#111827'>{fromDate}</td></tr>
                        <tr><td style='padding:6px 0;color:#6b7280'>To Date</td><td style='color:#111827'>{toDate}</td></tr>
                    </table>
                </div>

                <p style='color:#374151'>Please log in to the OD Application to approve or reject this request.</p>
                <p style='color:#9ca3af;font-size:13px;margin-top:24px'>This is an automated notification from OD Application.</p>
            </div>
        </div>"
            };

            using var smtp = new SmtpClient();
            await smtp.ConnectAsync("smtp.gmail.com", 587, SecureSocketOptions.StartTls);
            await smtp.AuthenticateAsync(senderEmail, senderPassword);
            await smtp.SendAsync(message);
            await smtp.DisconnectAsync(true);
        }
    }
}