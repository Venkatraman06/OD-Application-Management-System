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
            var list = hods.Select(h => new
            {
                hodId = h.HodId,
                name = h.Name,
                rollNumber = h.RollNumber,
                department = h.Department,
                category = h.Category ?? "UG",
                email = h.Email,
                isActive = h.IsActive,
                signatureUrl = h.DigitalSignature
            });
            return Ok(list);
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
            if (hod == null) return NotFound();
            if (User.IsInRole("HOD") && !hod.IsActive)
                return StatusCode(403, new { message = "HOD account not found or deactivated." });

            return Ok(new
            {
                hodId = hod.HodId,
                name = hod.Name,
                rollNumber = hod.RollNumber,
                department = hod.Department,
                category = hod.Category ?? "UG",
                email = hod.Email,
                isActive = hod.IsActive,
                signatureUrl = hod.DigitalSignature
            });
        }


        //this will add the hod details to the database
        [Authorize(Roles = "Admin")]
        [HttpPost]
        public async Task<IActionResult> AddHod([FromBody] HodDto dto)
        {
            if (dto == null) return BadRequest("HOD data is required");
            var cat = string.IsNullOrWhiteSpace(dto.Category) ? "UG" : dto.Category.Trim().ToUpper();
            var hod = new Hod
            {
                Name = dto.Name,
                RollNumber = dto.RollNumber,
                Department = dto.Department,
                Category = cat,
                Email = dto.Email,
                Password = dto.Password ?? string.Empty
            };
            var added = await _hodService.AddHodAsync(hod);
            return Ok(new
            {
                hodId = added.HodId,
                name = added.Name,
                rollNumber = added.RollNumber,
                department = added.Department,
                category = added.Category ?? "UG",
                email = added.Email,
                isActive = added.IsActive,
                signatureUrl = added.DigitalSignature
            });
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
                    DigitalSignature = existing.DigitalSignature, // Preserved — only Admin can change via UploadSignature
                    Name       = !string.IsNullOrWhiteSpace(dto.Name)  ? dto.Name.Trim()  : existing.Name,
                    Email      = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim() : existing.Email,
                    Password   = !string.IsNullOrWhiteSpace(dto.Password) ? dto.Password : existing.Password
                };

                var updated = await _hodService.UpdateHodAsync(safeHod);
                return Ok(new
                {
                    hodId = updated.HodId,
                    name = updated.Name,
                    rollNumber = updated.RollNumber,
                    department = updated.Department,
                    email = updated.Email,
                    isActive = updated.IsActive,
                    signatureUrl = updated.DigitalSignature
                });
            }
            else
            {
                // Admin — full update (blank password means "keep existing")
                var existingHodForAdmin = await _hodService.GetHodByIdAsync(dto.HodId);
                if (existingHodForAdmin == null) return NotFound();
                var hod = new Hod
                {
                    HodId = dto.HodId,
                    Name = dto.Name,
                    RollNumber = dto.RollNumber,
                    Department = dto.Department,
                    Category = string.IsNullOrWhiteSpace(dto.Category) ? (existingHodForAdmin.Category ?? "UG") : dto.Category.Trim().ToUpper(),
                    Email = dto.Email,
                    // If Admin left password blank, keep the existing hash by passing it through unchanged.
                    // HodService only re-hashes when the value differs from the stored hash.
                    Password = string.IsNullOrWhiteSpace(dto.Password) ? existingHodForAdmin.Password : dto.Password,
                    // Preserve existing signature — signature is only changed via the dedicated UploadSignature endpoint
                    DigitalSignature = existingHodForAdmin.DigitalSignature
                };
                var updated = await _hodService.UpdateHodAsync(hod);
                if (updated == null) return NotFound();
                return Ok(new
                {
                    hodId = updated.HodId,
                    name = updated.Name,
                    rollNumber = updated.RollNumber,
                    department = updated.Department,
                    email = updated.Email,
                    isActive = updated.IsActive,
                    signatureUrl = updated.DigitalSignature
                });
            }
        }


        // this will delete the hod details from the database
        [Authorize(Roles = "Admin")]
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
                category = hod.Category ?? "UG",
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

        // GET /api/Hod/ByDepartment?department=CS
        // Finds the HOD assigned to a specific Department. Used by the printed
        // OD report to show the actual HOD's name in the HOD Signature line.
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("ByDepartment")]
        public async Task<IActionResult> GetByDepartment([FromQuery] string department)
        {
            if (string.IsNullOrWhiteSpace(department))
                return BadRequest("department is required");

            var allHods = await _hodService.GetAllHodAsync();
            var dept = department.Trim().ToLower();

            var match = allHods.FirstOrDefault(h => (h.Department ?? "").Trim().ToLower() == dept && h.IsActive);
            if (match == null) return NotFound();

            return Ok(new { name = match.Name, department = match.Department, rollNumber = match.RollNumber, signatureUrl = match.DigitalSignature });
        }

        // POST /api/Hod/{id}/UploadSignature
        // Admin-only: upload/replace the digital signature image for a specific HOD.
        [Authorize(Roles = "Admin")]
        [HttpPost("{id}/UploadSignature")]
        public async Task<IActionResult> UploadSignature(int id, IFormFile signature)
        {
            if (signature == null || signature.Length == 0)
                return BadRequest(new { message = "Signature image file is required." });

            var ext = Path.GetExtension(signature.FileName).ToLowerInvariant();
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg" };
            if (!allowedExtensions.Contains(ext))
                return BadRequest(new { message = "Invalid file type. Allowed formats: JPG, PNG, GIF, WEBP, SVG." });

            var allowedMimes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml" };
            if (!allowedMimes.Contains(signature.ContentType.ToLowerInvariant()))
                return BadRequest(new { message = "Invalid file content type. Only image files are accepted." });

            if (signature.Length > 5 * 1024 * 1024)
                return BadRequest(new { message = "Signature file size must not exceed 5MB." });

            var hod = await _hodService.GetHodByIdAsync(id);
            if (hod == null) return NotFound(new { message = "HOD not found." });

            var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "signatures");
            Directory.CreateDirectory(uploadsDir);

            // Delete old signature file if it exists
            if (!string.IsNullOrEmpty(hod.DigitalSignature))
            {
                var oldPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", hod.DigitalSignature.TrimStart('/'));
                if (System.IO.File.Exists(oldPath))
                    System.IO.File.Delete(oldPath);
            }

            var fileName = $"hod_{id}_{Guid.NewGuid()}{ext}";
            var filePath = Path.Combine(uploadsDir, fileName);
            using var stream = System.IO.File.Create(filePath);
            await signature.CopyToAsync(stream);

            hod.DigitalSignature = $"/uploads/signatures/{fileName}";
            await _hodService.UpdateHodAsync(hod);

            return Ok(new { message = "Signature uploaded successfully.", signatureUrl = hod.DigitalSignature });
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