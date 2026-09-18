using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Services;
using System.Security.Cryptography;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly EmailService _emailService;

        public AuthController(ApplicationDbContext context, EmailService emailService)
        {
            _context = context;
            _emailService = emailService;
        }

        // POST /api/Auth/ForgotPassword/SendCode
        [HttpPost("ForgotPassword/SendCode")]
        public async Task<IActionResult> SendCode([FromBody] ForgotPasswordRequestDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Email))
                return BadRequest(new { message = "Email is required." });

            var email = dto.Email.Trim().ToLower();

            // Search across Student, Staff, HOD
            string userType = "";
            int userId = 0;
            string userName = "User";

            var student = await _context.Students.FirstOrDefaultAsync(s => (s.Email ?? "").ToLower() == email);
            if (student != null)
            {
                userType = "Student";
                userId = student.StudentId;
                userName = student.Name;
            }
            else
            {
                var staff = await _context.Staffs.FirstOrDefaultAsync(s => (s.Email ?? "").ToLower() == email);
                if (staff != null)
                {
                    userType = "Staff";
                    userId = staff.StaffId;
                    userName = staff.Name;
                }
                else
                {
                    var hod = await _context.Hods.FirstOrDefaultAsync(h => (h.Email ?? "").ToLower() == email);
                    if (hod != null)
                    {
                        userType = "Hod";
                        userId = hod.HodId;
                        userName = hod.Name;
                    }
                }
            }

            if (userId == 0)
            {
                // Return not found / unverified without breaking flow
                return NotFound(new { message = "No account found with this registered email address." });
            }

            // Invalidate older unused codes for this email
            var existingCodes = await _context.PasswordResetCodes
                .Where(r => r.Email == email && !r.IsUsed)
                .ToListAsync();

            foreach (var c in existingCodes)
            {
                c.IsUsed = true;
            }

            // Generate secure 6-digit numeric verification code
            var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();

            var resetRecord = new PasswordResetCode
            {
                Email = email,
                Code = code,
                UserType = userType,
                UserId = userId,
                ExpiryTime = DateTime.UtcNow.AddMinutes(10),
                IsUsed = false,
                CreatedAt = DateTime.UtcNow
            };

            _context.PasswordResetCodes.Add(resetRecord);
            await _context.SaveChangesAsync();

            try
            {
                await _emailService.SendPasswordResetCodeAsync(email, userName, code);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending password reset email: {ex.Message}");
                return StatusCode(500, new { message = "Could not send verification email. Please check server email configuration or try again." });
            }

            return Ok(new { message = "Verification code sent to your registered Gmail." });
        }

        // POST /api/Auth/ForgotPassword/VerifyCode
        [HttpPost("ForgotPassword/VerifyCode")]
        public async Task<IActionResult> VerifyCode([FromBody] VerifyCodeDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Code))
                return BadRequest(new { message = "Email and verification code are required." });

            var email = dto.Email.Trim().ToLower();
            var code = dto.Code.Trim();

            var record = await _context.PasswordResetCodes
                .Where(r => r.Email == email && !r.IsUsed)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (record == null || record.Code != code)
            {
                return BadRequest(new { message = "Invalid verification code." });
            }

            if (DateTime.UtcNow > record.ExpiryTime)
            {
                return BadRequest(new { message = "Verification code has expired. Please request a new code." });
            }

            return Ok(new { message = "Verification code is valid." });
        }

        // POST /api/Auth/ForgotPassword/ResetPassword
        [HttpPost("ForgotPassword/ResetPassword")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Code))
                return BadRequest(new { message = "Email and verification code are required." });

            if (string.IsNullOrWhiteSpace(dto.NewPassword) || string.IsNullOrWhiteSpace(dto.ConfirmPassword))
                return BadRequest(new { message = "New password and confirmation are required." });

            if (dto.NewPassword != dto.ConfirmPassword)
                return BadRequest(new { message = "New password and confirm password do not match." });

            var email = dto.Email.Trim().ToLower();
            var code = dto.Code.Trim();

            var record = await _context.PasswordResetCodes
                .Where(r => r.Email == email && !r.IsUsed)
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (record == null || record.Code != code)
            {
                return BadRequest(new { message = "Invalid verification code." });
            }

            if (DateTime.UtcNow > record.ExpiryTime)
            {
                return BadRequest(new { message = "Verification code has expired. Please request a new code." });
            }

            // Update user password
            if (record.UserType == "Student")
            {
                var student = await _context.Students.FindAsync(record.UserId);
                if (student == null) return NotFound(new { message = "Student account not found." });
                student.Password = dto.NewPassword;
            }
            else if (record.UserType == "Staff")
            {
                var staff = await _context.Staffs.FindAsync(record.UserId);
                if (staff == null) return NotFound(new { message = "Staff account not found." });
                staff.Password = dto.NewPassword;
            }
            else if (record.UserType == "Hod")
            {
                var hod = await _context.Hods.FindAsync(record.UserId);
                if (hod == null) return NotFound(new { message = "HOD account not found." });
                hod.Password = dto.NewPassword;
            }

            // Invalidate the code
            record.IsUsed = true;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Password reset successfully. You can now log in with your new password." });
        }
    }
}
