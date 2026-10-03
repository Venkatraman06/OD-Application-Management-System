using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;
using OnlineOD.Services;
using System.Security.Claims;

namespace OnlineOD.Controllers
{
    [Route("api/Faculty")]
    [ApiController]
    public class StaffController : ControllerBase
    {
        private readonly IStaffService _staffService;
        private readonly IOdApplyService _odService;
        private readonly IHodService _hodService;
        private readonly EmailService _emailService;
        private readonly EmailQueue _emailQueue;
        private readonly IJwtTokenService _jwtTokenService;

        public StaffController(IStaffService staffService, IOdApplyService odService,
             IHodService hodService, EmailService emailService, EmailQueue emailQueue,
             IJwtTokenService jwtTokenService)
        {
            _staffService = staffService;
            _odService = odService;
            _hodService = hodService;
            _emailService = emailService;
            _emailQueue = emailQueue;
            _jwtTokenService = jwtTokenService;
        }

        [Authorize(Roles = "Admin")]
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var staffs = await _staffService.GetAllStaffAsync();
            var list = staffs.Select(s => new
            {
                staffId = s.StaffId,
                name = s.Name,
                rollNumber = s.RollNumber,
                department = s.Department,
                section = s.Section,
                year = s.Year,
                category = s.Category ?? "UG",
                email = s.Email,
                isActive = s.IsActive,
                signatureUrl = s.DigitalSignature
            });
            return Ok(list);
        }

        [Authorize(Roles = "Staff,Admin")]
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId != id)
                    return StatusCode(403, new { message = "You are not authorized to view another staff member's profile." });
            }

            var staff = await _staffService.GetStaffByIdAsync(id);
            if (staff == null) return NotFound();
            if (User.IsInRole("Staff") && !staff.IsActive)
                return StatusCode(403, new { message = "Your staff account has been deactivated." });

            return Ok(new
            {
                staffId = staff.StaffId,
                name = staff.Name,
                rollNumber = staff.RollNumber,
                department = staff.Department,
                section = staff.Section,
                year = staff.Year,
                category = staff.Category ?? "UG",
                email = staff.Email,
                isActive = staff.IsActive,
                signatureUrl = staff.DigitalSignature
            });
        }

        [Authorize(Roles = "Admin")]
        [HttpPost]
        public async Task<IActionResult> AddStaff([FromBody] Staff staff)
        {
            if (staff != null && string.IsNullOrWhiteSpace(staff.Category)) staff.Category = "UG";
            var added = await _staffService.AddStaffAsync(staff);
            return Ok(new
            {
                staffId = added.StaffId,
                name = added.Name,
                rollNumber = added.RollNumber,
                department = added.Department,
                section = added.Section,
                year = added.Year,
                category = added.Category ?? "UG",
                email = added.Email,
                isActive = added.IsActive,
                signatureUrl = added.DigitalSignature
            });
        }

        [Authorize(Roles = "Staff,Admin")]
        [HttpPut]
        public async Task<IActionResult> UpdateStaff([FromBody] UpdateStaffDto dto)
        {
            if (dto == null) return BadRequest("Staff data is required.");

            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId != dto.StaffId)
                    return StatusCode(403, new { message = "You are not authorized to update another staff member's profile." });

                // Load the existing record to lock institutional/identity fields
                var existing = await _staffService.GetStaffByIdAsync(authStaffId);
                if (existing == null) return NotFound();

                // Staff may only update personal contact fields — identity and assignment fields are locked
                var safeStaff = new Staff
                {
                    StaffId      = existing.StaffId,        // Locked
                    RollNumber   = existing.RollNumber,     // Locked
                    Department   = existing.Department,     // Locked
                    Section      = existing.Section,        // Locked
                    Year         = existing.Year,           // Locked
                    Category     = existing.Category,       // Locked
                    IsActive     = existing.IsActive,       // Locked
                    DigitalSignature = existing.DigitalSignature, // Preserved — only Admin can change via UploadSignature
                    Name         = !string.IsNullOrWhiteSpace(dto.Name)  ? dto.Name.Trim()  : existing.Name,
                    Email        = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim() : existing.Email,
                    Password     = !string.IsNullOrWhiteSpace(dto.Password) ? dto.Password : existing.Password
                };

                var updated = await _staffService.UpdateStaffAsync(safeStaff);
                return Ok(new
                {
                    staffId = updated.StaffId,
                    name = updated.Name,
                    rollNumber = updated.RollNumber,
                    department = updated.Department,
                    section = updated.Section,
                    year = updated.Year,
                    category = updated.Category ?? "UG",
                    email = updated.Email,
                    isActive = updated.IsActive,
                    signatureUrl = updated.DigitalSignature
                });
            }
            else
            {
                // Admin — full update (blank password means "keep existing")
                var existingStaffForAdmin = await _staffService.GetStaffByIdAsync(dto.StaffId);
                if (existingStaffForAdmin == null) return NotFound();

                var staffEntity = new Staff
                {
                    StaffId = dto.StaffId,
                    Name = dto.Name,
                    RollNumber = dto.RollNumber,
                    Department = dto.Department,
                    Section = dto.Section,
                    Year = dto.Year ?? existingStaffForAdmin.Year,
                    Category = string.IsNullOrWhiteSpace(dto.Category) ? (existingStaffForAdmin.Category ?? "UG") : dto.Category.Trim().ToUpper(),
                    Email = dto.Email,
                    Password = string.IsNullOrWhiteSpace(dto.Password) ? existingStaffForAdmin.Password : dto.Password,
                    IsActive = dto.IsActive,
                    // Preserve existing signature — signature is only changed via the dedicated UploadSignature endpoint
                    DigitalSignature = existingStaffForAdmin.DigitalSignature
                };

                var updated = await _staffService.UpdateStaffAsync(staffEntity);
                if (updated == null) return NotFound();
                return Ok(new
                {
                    staffId = updated.StaffId,
                    name = updated.Name,
                    rollNumber = updated.RollNumber,
                    department = updated.Department,
                    section = updated.Section,
                    year = updated.Year,
                    category = updated.Category ?? "UG",
                    email = updated.Email,
                    isActive = updated.IsActive,
                    signatureUrl = updated.DigitalSignature
                });
            }
        }

        [Authorize(Roles = "Admin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStaff(int id)
        {
            var result = await _staffService.DeleteStaffAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }

        // GET /api/Faculty/ByDepartmentSection?department=CS&section=B
        // Finds the class staff assigned to a specific Department + Section
        // (the same routing rule used for PendingODs). Used by the printed
        // OD report to show the actual class staff's name in the Staff
        // Signature line, instead of just the department name.
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("ByDepartmentSection")]
        public async Task<IActionResult> GetByDepartmentSection([FromQuery] string department, [FromQuery] string? section = null)
        {
            if (string.IsNullOrWhiteSpace(department))
                return BadRequest("department is required");

            var allStaff = await _staffService.GetAllStaffAsync();
            var dept = department.Trim().ToLower();
            var sec = (section ?? "").Trim().ToLower();

            var match = allStaff.FirstOrDefault(s =>
                (s.Department ?? "").Trim().ToLower() == dept &&
                (string.IsNullOrEmpty(sec)
                    ? string.IsNullOrEmpty(s.Section)
                    : NormalizeSection(s.Section) == NormalizeSection(sec)));

            // Fall back to any staff in the department if no exact section match
            match ??= allStaff.FirstOrDefault(s => (s.Department ?? "").Trim().ToLower() == dept);

            if (match == null) return NotFound();

            return Ok(new { name = match.Name, department = match.Department, section = match.Section, signatureUrl = match.DigitalSignature });
        }

        // POST /api/Faculty/{id}/UploadSignature
        // Admin-only: upload/replace the digital signature image for a specific staff member.
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

            // Validate MIME type
            var allowedMimes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml" };
            if (!allowedMimes.Contains(signature.ContentType.ToLowerInvariant()))
                return BadRequest(new { message = "Invalid file content type. Only image files are accepted." });

            if (signature.Length > 5 * 1024 * 1024)
                return BadRequest(new { message = "Signature file size must not exceed 5MB." });

            var staff = await _staffService.GetStaffByIdAsync(id);
            if (staff == null) return NotFound(new { message = "Staff member not found." });

            var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "signatures");
            Directory.CreateDirectory(uploadsDir);

            // Delete old signature file if it exists
            if (!string.IsNullOrEmpty(staff.DigitalSignature))
            {
                var oldPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", staff.DigitalSignature.TrimStart('/'));
                if (System.IO.File.Exists(oldPath))
                    System.IO.File.Delete(oldPath);
            }

            var fileName = $"staff_{id}_{Guid.NewGuid()}{ext}";
            var filePath = Path.Combine(uploadsDir, fileName);
            using var stream = System.IO.File.Create(filePath);
            await signature.CopyToAsync(stream);

            staff.DigitalSignature = $"/uploads/signatures/{fileName}";
            await _staffService.UpdateStaffAsync(staff);

            return Ok(new { message = "Signature uploaded successfully.", signatureUrl = staff.DigitalSignature });
        }

        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] StaffLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.Name) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("Username and Password are required");

            var staff = await _staffService.LoginAsync(dto.Name, dto.Password);
            if (staff == null)
                return Unauthorized("Invalid username or password");

            if (!staff.IsActive)
                return StatusCode(403, new { message = "Your account has been deactivated. Please contact the administrator." });

            var token = _jwtTokenService.GenerateStaffToken(staff);

            return Ok(new
            {
                facultyId = staff.StaffId,
                name = staff.Name,
                rollNumber = staff.RollNumber,
                department = staff.Department,
                section = staff.Section,
                year = staff.Year,
                category = staff.Category ?? "UG",
                token = token
            });
        }

        // GET /api/Faculty/PendingODs/{department}?section=B
        // The optional section filter restricts results to only the OD
        // requests from students in that exact class section — this is what
        // makes a Section-B student's request visible only to Section-B
        // staff instead of every staff member in the department.
        [Authorize(Roles = "Staff,Admin")]
        [HttpGet("PendingODs/{department}")]
        public async Task<IActionResult> GetPendingODs(string department, [FromQuery] string? section = null)
        {
            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                // Strictly enforce staff member's actual assigned department and section
                department = authStaff.Department ?? "";
                section = authStaff.Section;
            }

            var ods = await _odService.GetByDepartmentAsync(department, section);
            var withCerts = await _odService.AttachCertificatesAsync(ods);
            return Ok(withCerts);
        }

        // Approve/Reject by faculty — then email HOD with clickable buttons.
        // Authenticated Staff ID extracted from JWT ClaimTypes.NameIdentifier.
        [Authorize(Roles = "Staff")]
        [HttpPut("Approve/{odId}")]
        public async Task<IActionResult> Approve(int odId, [FromQuery] string status, [FromQuery] int? staffId = null)
        {
            if (string.IsNullOrEmpty(status))
                return BadRequest("Status is required");

            if (status != "Approved" && status != "Rejected")
                return BadRequest("Status must be Approved or Rejected");

            var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
            {
                return Unauthorized(new { message = "Invalid or missing staff authentication token." });
            }

            // Per-request active check — blocks deactivated Staff who still hold a valid JWT
            var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
            if (authStaff == null || !authStaff.IsActive)
                return StatusCode(403, new { message = "Your staff account has been deactivated." });

            // Block approve/reject once the OD is already ongoing (today falls
            // within its From/To range) — the decision window is meant to
            // close once the OD has actually started, not just once it ends.
            var existing = await _odService.GetOdApplyByIdAsync(odId);
            if (existing == null) return NotFound("OD request not found");
            if (IsOdOngoing(existing.FromDate, existing.ToDate))
                return BadRequest("This OD is already ongoing and can no longer be approved or rejected.");

            OdApply? od;
            try
            {
                od = await _odService.ApproveByStaffAsync(odId, status, authStaffId);
            }
            catch (InvalidOperationException ex)
            {
                // Thrown when this staff has no students from their own
                // section on this OD — nothing for them to decide.
                return BadRequest(ex.Message);
            }
            if (od == null) return NotFound("OD request not found");

            // Tracks whether the HOD notification email actually went out, and
            // why not if it didn't — this used to be swallowed silently, so
            // staff had no way of knowing the HOD was never notified.
            string emailStatus = "not_applicable";
            string emailDetail = null;

            // Only notify HOD once the OD's OVERALL FacultyStatus has actually
            // become "Approved" — for a multi-section group OD, that only
            // happens after EVERY involved section has made its own decision,
            // not just this one staff's own section.
            if (od.FacultyStatus == "Approved")
            {
                try
                {
                    var hods = await _hodService.GetAllHodAsync();
                    var hod = hods.FirstOrDefault(h =>
                        h.Department != null &&
                        h.Department.Trim().ToLower() == (od.department ?? "").Trim().ToLower());

                    if (hod == null)
                    {
                        emailStatus = "failed";
                        emailDetail = $"No HOD record found for department '{od.department}'. " +
                                      "Check that a HOD exists with this exact department name.";
                        Console.WriteLine($"[Email] HOD notify skipped — {emailDetail}");
                    }
                    else if (string.IsNullOrWhiteSpace(hod.Email))
                    {
                        emailStatus = "failed";
                        emailDetail = $"HOD '{hod.Name}' (department '{hod.Department}') has no Email set on their account.";
                        Console.WriteLine($"[Email] HOD notify skipped — {emailDetail}");
                    }
                    else
                    {
                        _emailQueue.Enqueue(new EmailJob
                        {
                            Type = "Approval",
                            ToEmail = hod.Email,
                            HodName = hod.Name,
                            StudentName = od.StudentName ?? "",
                            RegisterNumber = od.registerNumber ?? "",
                            EventName = od.Event ?? "",
                            Department = od.department ?? "",
                            FromDate = od.FromDate ?? "",
                            ToDate = od.ToDate ?? "",
                            OdId = od.OdId,
                            IsGroup = od.IsGroupOd,
                            GroupName = od.GroupName ?? "",
                            RegisterNumbers = od.RegisterNumbers ?? "",
                            CollegeIndustry = od.CollegeIndustry ?? "",
                            StartTime = od.StartTime,
                            EndTime = od.EndTime
                        });
                        emailStatus = "queued";
                    }
                }
                catch (Exception ex)
                {
                    emailStatus = "failed";
                    // Include the inner exception too — SMTP auth/connection
                    // failures (e.g. a revoked Gmail app password) usually put
                    // the real reason there, not in ex.Message.
                    emailDetail = ex.InnerException != null
                        ? $"{ex.Message} | Inner: {ex.InnerException.Message}"
                        : ex.Message;
                    Console.WriteLine($"[Email] HOD notify FAILED — {emailDetail}");
                }
            }

            return Ok(new
            {
                od.OdId,
                od.FacultyStatus,
                od.HodStatus,
                emailStatus,
                emailDetail
            });
        }

        // True while today falls within the OD's own From/To date range —
        // used to lock out approve/reject once the OD has actually started.
        // True once today is on/after the OD's own FromDate — covers an OD
        // currently in progress AND one whose dates are already fully over.
        private static bool IsOdOngoing(string? fromDateRaw, string? toDateRaw)
        {
            if (!DateTime.TryParse(fromDateRaw, out var from))
                return false;
            var today = DateTime.Today;
            return today >= from.Date;
        }

        // Helper to normalize section strings ("Section A", "Class A", "Sec A", "A" -> "a")
        private static string NormalizeSection(string? sec)
        {
            if (string.IsNullOrWhiteSpace(sec)) return "";
            var s = sec.Trim().ToLower();
            if (s.StartsWith("section ")) s = s.Substring(8).Trim();
            else if (s.StartsWith("class ")) s = s.Substring(6).Trim();
            else if (s.StartsWith("sec ")) s = s.Substring(4).Trim();
            return s;
        }
    }
}