using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Services;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AdminController : ControllerBase
    {
        private readonly EmailService _emailService;
        private readonly ApplicationDbContext _context;

        public AdminController(EmailService emailService, ApplicationDbContext context)
        {
            _emailService = emailService;
            _context = context;
        }

        // POST /api/Admin/ContactAdmin
        // Body: { registerNumber, dob, password, role, message }
        // Saves the request to the ContactAdminRequests table (so it shows up
        // on the admin page) AND emails the admin as a heads-up notification.
        // Previously this only sent the email and never touched the database,
        // which is why requests never appeared on the admin page even though
        // the student saw "request sent" successfully.
        [HttpPost("ContactAdmin")]
        public async Task<IActionResult> ContactAdmin([FromBody] ContactAdminDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.RegisterNumber))
                return BadRequest(new { message = "Register/Staff number is required." });

            if (string.IsNullOrWhiteSpace(dto.Message))
                return BadRequest(new { message = "Please describe your issue in the report box." });

            try
            {
                var request = new ContactAdminRequest
                {
                    RegisterNumber = dto.RegisterNumber,
                    Dob = dto.Dob,
                    Role = dto.Role,
                    Message = dto.Message,
                    IsResolved = false,
                    CreatedAt = DateTime.UtcNow
                };

                _context.ContactAdminRequests.Add(request);
                await _context.SaveChangesAsync();

                try
                {
                    await _emailService.SendContactAdminEmailAsync(
                        dto.RegisterNumber, dto.Dob, dto.Password, dto.Role, dto.Message);
                }
                catch (Exception emailEx)
                {
                    // The request is already saved and will show on the admin page —
                    // don't fail the whole request just because the notification email
                    // couldn't be sent (e.g. SMTP misconfigured).
                    Console.WriteLine($"ContactAdmin email failed: {emailEx.Message}");
                }

                return Ok(new { message = "Your request has been sent to the admin." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Could not send your request. Please try again later.", detail = ex.Message });
            }
        }

        // GET /api/Admin/ContactRequests
        [HttpGet("ContactRequests")]
        public async Task<IActionResult> GetContactRequests()
        {
            var requests = await _context.ContactAdminRequests
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new
                {
                    id = r.Id,
                    registerNumber = r.RegisterNumber,
                    dob = r.Dob,
                    role = r.Role,
                    message = r.Message,
                    isResolved = r.IsResolved,
                    submittedDate = r.CreatedAt
                })
                .ToListAsync();

            return Ok(requests);
        }

        // PUT /api/Admin/ContactRequests/{id}/Resolve
        [HttpPut("ContactRequests/{id}/Resolve")]
        public async Task<IActionResult> ResolveContactRequest(int id)
        {
            var request = await _context.ContactAdminRequests.FindAsync(id);
            if (request == null) return NotFound(new { message = "Request not found." });

            request.IsResolved = true;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Marked as resolved." });
        }

        // DELETE /api/Admin/ContactRequests/{id}
        [HttpDelete("ContactRequests/{id}")]
        public async Task<IActionResult> DeleteContactRequest(int id)
        {
            var request = await _context.ContactAdminRequests.FindAsync(id);
            if (request == null) return NotFound(new { message = "Request not found." });

            _context.ContactAdminRequests.Remove(request);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Request deleted." });
        }
    }
}