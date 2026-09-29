using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;
using System.Security.Claims;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class HodController : ControllerBase
    {
        private readonly IHodService _hodService;
        private readonly IOdApplyService _odService;
        private readonly IJwtTokenService _jwtTokenService;

        //dependancy injection of services
        public HodController(IHodService hodService, IOdApplyService odService, IJwtTokenService jwtTokenService)
        {
            _hodService = hodService;
            _odService = odService;
            _jwtTokenService = jwtTokenService;
        }


        //this will get all the hod details from my database
        [Authorize(Roles = "Admin")]
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var hods = await _hodService.GetAllHodAsync();
            return Ok(hods);
        }


        //this will get the hod details by id from the database
        [Authorize(Roles = "HOD,Admin")]
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId != id)
                    return StatusCode(403, new { message = "You are not authorized to view another HOD's profile." });
            }

            var hod = await _hodService.GetHodByIdAsync(id);
            return Ok(hod);
        }


        //this will add the hod details to the database
        [HttpPost]
        public async Task<IActionResult> AddHod([FromBody] HodDto dto)
        {
            if (dto == null) return BadRequest("HOD data is required");
            var hod = new Hod
            {
                Name = dto.Name,
                RollNumber = dto.RollNumber,
                Department = dto.Department,
                Email = dto.Email,
                Password = dto.Password ?? string.Empty
            };
            var added = await _hodService.AddHodAsync(hod);
            return Ok(added);
        }


        //this will update the hod details in the database
        [Authorize(Roles = "HOD,Admin")]
        [HttpPut]
        public async Task<IActionResult> UpdateHod([FromBody] HodDto dto)
        {
            if (dto == null) return BadRequest("HOD data is required");

            if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId != dto.HodId)
                    return StatusCode(403, new { message = "You are not authorized to update another HOD's profile." });

                var existing = await _hodService.GetHodByIdAsync(authHodId);
                if (existing == null) return NotFound();

                // HOD may only update personal profile fields — identity and department assignment fields are locked
                var safeHod = new Hod
                {
                    HodId      = existing.HodId,        // Locked
                    RollNumber = existing.RollNumber,   // Locked
                    Department = existing.Department,   // Locked
                    IsActive   = existing.IsActive,     // Locked
                    Name       = !string.IsNullOrWhiteSpace(dto.Name)  ? dto.Name.Trim()  : existing.Name,
                    Email      = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim() : existing.Email,
                    Password   = !string.IsNullOrWhiteSpace(dto.Password) ? dto.Password : existing.Password
                };

                var updated = await _hodService.UpdateHodAsync(safeHod);
                return Ok(updated);
            }
            else
            {
                // Admin — full update
                var hod = new Hod
                {
                    HodId = dto.HodId,
                    Name = dto.Name,
                    RollNumber = dto.RollNumber,
                    Department = dto.Department,
                    Email = dto.Email,
                    Password = dto.Password ?? string.Empty
                };
                var updated = await _hodService.UpdateHodAsync(hod);
                if (updated == null) return NotFound();
                return Ok(updated);
            }
        }


        // this will delete the hod details from the database
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteHod(int id)
        {
            var result = await _hodService.DeleteHodAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }


        // this will login the hod by checking the login credentials with database and return 
        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] StaffLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.Name) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("Username and Password are required");

            var hod = await _hodService.LoginAsync(dto.Name, dto.Password);
            if (hod == null)
                return Unauthorized("Invalid username or password");

            if (!hod.IsActive)
                return StatusCode(403, new { message = "Your account has been deactivated. Please contact the administrator." });

            var token = _jwtTokenService.GenerateHodToken(hod);

            return Ok(new
            {
                hodId = hod.HodId,
                name = hod.Name,
                rollNumber = hod.RollNumber,
                department = hod.Department,
                token = token
            });
        }


        // this will get all the OD requests that are approved by the faculty for a specific department
        [Authorize(Roles = "HOD,Admin")]
        [HttpGet("ApprovedByFaculty/{department}")]
        public async Task<IActionResult> GetApprovedByFaculty(string department)
        {
            if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _hodService.GetHodByIdAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                var hodDept = (authHod.Department ?? "").Trim();
                var requestedDept = (department ?? "").Trim();
                if (!string.IsNullOrEmpty(requestedDept) && !string.IsNullOrEmpty(hodDept) &&
                    !requestedDept.Equals(hodDept, StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(403, new { message = "You are not authorized to view OD applications outside of your department." });
                }
            }

            var ods = await _odService.GetApprovedByFacultyAsync(department);
            var withCerts = await _odService.AttachCertificatesAsync(ods);
            return Ok(withCerts);
        }


        // this will update the HOD approval status of the OD request and return the updated OD request details
        [Authorize(Roles = "HOD")]
        [HttpPut("FinalApprove/{odId}")]
        public async Task<IActionResult> FinalApprove(int odId, [FromQuery] string status)
        {
            if (string.IsNullOrEmpty(status))
                return BadRequest("Status is required");

            if (status != "Approved" && status != "Rejected")
                return BadRequest("Status must be Approved or Rejected");

            var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
            {
                return Unauthorized(new { message = "Invalid or missing HOD authentication token." });
            }

            var authHod = await _hodService.GetHodByIdAsync(authHodId);
            if (authHod == null || !authHod.IsActive)
            {
                return StatusCode(403, new { message = "HOD account not found or deactivated." });
            }

            // Block approve/reject once the OD is already ongoing (today falls
            // within its From/To range) — same rule enforced on the staff side.
            var existing = await _odService.GetOdApplyByIdAsync(odId);
            if (existing == null) return NotFound("OD request not found");

            var odDept = (existing.department ?? "").Trim();
            var hodDept = (authHod.Department ?? "").Trim();
            if (!string.IsNullOrEmpty(odDept) && !string.IsNullOrEmpty(hodDept) && !odDept.Equals(hodDept, StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new { message = "You are not authorized to approve OD applications outside of your department." });
            }

            if (IsOdOngoing(existing.FromDate, existing.ToDate))
                return BadRequest("This OD is already ongoing and can no longer be approved or rejected.");

            var od = await _odService.UpdateHodStatusAsync(odId, status);
            if (od == null) return NotFound("OD request not found");

            return Ok(od);
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
    }
}