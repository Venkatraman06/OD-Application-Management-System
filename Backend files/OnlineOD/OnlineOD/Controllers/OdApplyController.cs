using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;
using OnlineOD.Services;
using System.Security.Claims;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class OdApplyController : ControllerBase
    {
        private readonly IOdApplyService _service;
        private readonly IStaffService _staffService;
        private readonly IStudentService _studentService;
        private readonly IHodService _hodService;
        private readonly EmailService _emailService;
        private readonly EmailQueue _emailQueue;

        public OdApplyController(IOdApplyService service, IStaffService staffService,
            IStudentService studentService,
            IHodService hodService,
            EmailService emailService, EmailQueue emailQueue)
        {
            _service = service;
            _staffService = staffService;
            _studentService = studentService;
            _hodService = hodService;
            _emailService = emailService;
            _emailQueue = emailQueue;
        }

        // GET /api/OdApply — all ODs
        [HttpGet]
        public async Task<IActionResult> GetAllOd()
        {
            var od = await _service.GetAllOdApplyAsync();
            return Ok(od);
        }

        // GET /api/OdApply/{odId}
        [HttpGet("{odId:int}")]
        public async Task<IActionResult> GetOdById(int odId)
        {
            var od = await _service.GetOdApplyByIdAsync(odId);
            if (od == null) return NotFound();
            return Ok(od);
        }

        // GET /api/OdApply/Student-Od/{studentId}
        // Students may only retrieve their own ODs. Staff/HOD/Admin are unrestricted.
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("Student-Od/{studentId}")]
        public async Task<IActionResult> GetByStudentId(int studentId)
        {
            if (User.IsInRole("Student"))
            {
                var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId != studentId)
                {
                    return StatusCode(403, new { message = "You are not authorized to view another student's OD applications." });
                }
            }

            var ods = await _service.GetByStudentIdAsync(studentId);
            return Ok(ods);
        }

        // ── GET /api/OdApply/ByRegister/{registerNumber}
        // Member students look up their OD status by register number.
        // Students may only retrieve ODs for their own register number (verified from DB).
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("ByRegister/{registerNumber}")]
        public async Task<IActionResult> GetByRegisterNumber(string registerNumber)
        {
            if (User.IsInRole("Student"))
            {
                var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId))
                    return Unauthorized(new { message = "Invalid or missing student authentication token." });

                var authStudent = await _studentService.GetStudentByIdAsync(authStudentId);
                if (authStudent == null)
                    return StatusCode(403, new { message = "Authenticated student not found." });

                if (string.IsNullOrWhiteSpace(authStudent.RegisterNumber) ||
                    !authStudent.RegisterNumber.Trim().Equals(registerNumber.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    return StatusCode(403, new { message = "You are not authorized to view another student's OD applications." });
                }
            }

            var all = await _service.GetAllOdApplyAsync();

            var target = registerNumber.Trim().ToLower();

            // Match ODs where this register number is the applicant OR is listed in RegisterNumbers
            var matched = all.Where(o =>
                (o.registerNumber != null &&
                 o.registerNumber.Trim().ToLower() == target)
                ||
                (o.IsGroupOd && o.RegisterNumbers != null &&
                 o.RegisterNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                  .Any(r => r.ToLower() == target))
            )
            .OrderByDescending(o => o.AppliedDate)
            .ToList();

            var withCerts = await _service.AttachCertificatesAsync(matched);
            return Ok(withCerts);
        }

        // ── NEW: GET /api/OdApply/WithCertificates
        // Fix for faculty certificates view
        [HttpGet("WithCertificates")]
        public async Task<IActionResult> GetWithCertificates()
        {
            var all = await _service.GetAllOdApplyAsync();
            var certs = all.Where(o => !string.IsNullOrEmpty(o.CertificatePhotoUrl))
                           .OrderByDescending(o => o.AppliedDate)
                           .ToList();
            return Ok(certs);
        }

        // GET /api/OdApply/CheckMissingCertificates?registerNumbers=23CS101,23CS102
        [HttpGet("CheckMissingCertificates")]
        public async Task<IActionResult> CheckMissingCertificates([FromQuery] string registerNumbers)
        {
            if (string.IsNullOrWhiteSpace(registerNumbers))
                return Ok(new List<MissingCertificateDto>());

            var regs = registerNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            var missing = await _service.GetMissingPreviousCertificatesAsync(regs);
            return Ok(missing);
        }

        // POST /api/OdApply/OD-Apply
        // Only authenticated Students may submit OD applications.
        // The authenticated Student ID and register number are resolved from JWT claims and DB,
        // overriding any caller-supplied values to prevent applying on behalf of another student.
        [Authorize(Roles = "Student")]
        [HttpPost("OD-Apply")]
        public async Task<IActionResult> CreateOdApply([FromBody] OdApplyDto dto)
        {
            if (dto == null)
                return BadRequest("OD Apply data is required");

            // Resolve the authenticated student from the JWT claim
            var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId <= 0)
                return Unauthorized(new { message = "Invalid or missing student authentication token." });

            var authStudent = await _studentService.GetStudentByIdAsync(authStudentId);
            if (authStudent == null || !authStudent.IsActive)
                return StatusCode(403, new { message = "Student account not found or deactivated." });

            // Enforce the authenticated student's identity — ignore any caller-supplied values
            dto.StudentId = authStudent.StudentId;
            dto.StudentName = authStudent.Name;
            dto.registerNumber = authStudent.RegisterNumber;
            if (string.IsNullOrWhiteSpace(dto.department)) dto.department = authStudent.Department;
            if (string.IsNullOrWhiteSpace(dto.Section)) dto.Section = authStudent.Section;

            var dateError = WorkingDaysCalendar.ValidateRange(dto.FromDate, dto.ToDate);
            if (dateError != null)
                return BadRequest(dateError);

            OdApply result;
            try
            {
                result = await _service.CreateOdApplyAsync(dto);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { message = ex.Message });
            }

            // Enqueue staff email notifications to background worker so HTTP API response completes fast (<50ms)
            string emailStatus = "queued";
            string? emailDetail = null;
            try
            {
                var involvedSections = await _service.GetInvolvedSectionsAsync(result);
                if (involvedSections.Count == 0 && !string.IsNullOrWhiteSpace(result.Section))
                    involvedSections.Add(result.Section.Trim());
                else if (involvedSections.Count == 0 && !string.IsNullOrWhiteSpace(dto.Section))
                    involvedSections.Add(dto.Section.Trim());

                var targetDept = (result.department ?? dto.department ?? "").Trim().ToLower();
                var normalizedInvolved = involvedSections.Select(NormalizeSection).Where(s => !string.IsNullOrEmpty(s)).ToHashSet(StringComparer.OrdinalIgnoreCase);

                var staffList = await _staffService.GetAllStaffAsync();
                var deptStaff = staffList.Where(s =>
                    s.Department != null &&
                    s.Department.Trim().ToLower() == targetDept &&
                    s.Section != null &&
                    normalizedInvolved.Contains(NormalizeSection(s.Section)) &&
                    !string.IsNullOrEmpty(s.Email)
                ).ToList();

                if (deptStaff.Count == 0)
                {
                    emailStatus = "failed";
                    emailDetail = involvedSections.Count == 0
                        ? "No Section was set on this OD, so no matching staff could be found."
                        : $"No staff found for department '{result.department ?? dto.department}' + section(s) '{string.Join(", ", involvedSections)}' with an Email set.";
                    Console.WriteLine($"[EmailQueue] Staff notification skipped for OD #{result.OdId}: {emailDetail}");
                }
                else
                {
                    foreach (var staff in deptStaff)
                    {
                        _emailQueue.Enqueue(new EmailJob
                        {
                            Type = "Submission",
                            ToEmail = staff.Email,
                            StaffName = staff.Name,
                            StudentName = result.StudentName ?? dto.StudentName ?? "",
                            RegisterNumber = result.registerNumber ?? dto.registerNumber ?? "",
                            EventName = result.Event ?? dto.Event ?? "",
                            Department = result.department ?? dto.department ?? "",
                            FromDate = result.FromDate ?? dto.FromDate ?? "",
                            ToDate = result.ToDate ?? dto.ToDate ?? "",
                            OdId = result.OdId,
                            StaffId = staff.StaffId,
                            IsGroup = result.IsGroupOd,
                            GroupName = result.GroupName ?? dto.GroupName ?? "",
                            RegisterNumbers = result.RegisterNumbers ?? dto.RegisterNumbers ?? "",
                            CollegeIndustry = result.CollegeIndustry ?? dto.CollegeIndustry ?? "",
                            StartTime = result.StartTime ?? dto.StartTime,
                            EndTime = result.EndTime ?? dto.EndTime
                        });
                        Console.WriteLine($"[EmailQueue] Submission email queued for OD #{result.OdId} -> {staff.Name} ({staff.Email}) [Section: {staff.Section}]");
                    }
                    emailStatus = "queued";
                }
            }
            catch (Exception ex)
            {
                emailStatus = "failed";
                emailDetail = ex.Message;
            }

            // Surface the email outcome via a response header instead of
            // changing the JSON shape, so nothing that reads `result`'s
            // fields elsewhere breaks.
            Response.Headers["X-Email-Status"] = emailStatus;
            if (!string.IsNullOrEmpty(emailDetail))
                Response.Headers["X-Email-Detail"] = emailDetail;

            return Ok(result);
        }

        // DELETE /api/OdApply/{odId}
        // Lets a student cancel/withdraw their own OD application — but only
        // while it is still Pending. Once faculty has approved or rejected
        // it, the student can no longer delete it from their side.
        // Admin may delete any OD record.
        [Authorize(Roles = "Student,Admin")]
        [HttpDelete("{odId}")]
        public async Task<IActionResult> DeleteOd(int odId)
        {
            if (User.IsInRole("Student"))
            {
                var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId <= 0)
                    return Unauthorized(new { message = "Invalid or missing student authentication token." });

                // Load the OD first so we can verify ownership before attempting deletion
                var od = await _service.GetOdApplyByIdAsync(odId);
                if (od == null) return NotFound("OD not found.");

                if (od.StudentId != authStudentId)
                    return StatusCode(403, new { message = "You are not authorized to cancel another student's OD application." });
            }

            var (success, error) = await _service.DeleteOdApplyAsync(odId);
            if (!success)
            {
                if (error == "OD not found.") return NotFound(error);
                return BadRequest(error);
            }
            return Ok(new { success = true, message = "OD application cancelled." });
        }

        // PUT /api/OdApply/{odId}/RejectMember?registerNumber=XXX&staffId=YYY
        // Authenticated Staff ID extracted from JWT ClaimTypes.NameIdentifier.
        [Authorize(Roles = "Staff")]
        [HttpPut("{odId}/RejectMember")]
        public async Task<IActionResult> RejectMember(int odId, [FromQuery] string registerNumber, [FromQuery] int? staffId = null)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
            {
                return Unauthorized(new { message = "Invalid or missing staff authentication token." });
            }

            var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
            if (authStaff == null || !authStaff.IsActive)
            {
                return StatusCode(403, new { message = "Your staff account has been deactivated." });
            }

            OdApply? od;
            try
            {
                od = await _service.RejectGroupMemberAsync(odId, registerNumber.Trim(), authStaffId);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }

        // PUT /api/OdApply/{odId}/UnrejectMember?registerNumber=XXX&staffId=YYY
        // Faculty undoing their own rejection — same section-ownership rule.
        [Authorize(Roles = "Staff")]
        [HttpPut("{odId}/UnrejectMember")]
        public async Task<IActionResult> UnrejectMember(int odId, [FromQuery] string registerNumber, [FromQuery] int? staffId = null)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
            {
                return Unauthorized(new { message = "Invalid or missing staff authentication token." });
            }

            var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
            if (authStaff == null || !authStaff.IsActive)
            {
                return StatusCode(403, new { message = "Your staff account has been deactivated." });
            }

            OdApply? od;
            try
            {
                od = await _service.UnrejectGroupMemberAsync(odId, registerNumber.Trim(), authStaffId);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(ex.Message);
            }
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }

        // PUT /api/OdApply/{odId}/HodOverrideMember?registerNumber=XXX
        // HOD approving a member that faculty rejected
        [Authorize(Roles = "HOD")]
        [HttpPut("{odId}/HodOverrideMember")]
        public async Task<IActionResult> HodOverrideMember(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

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

            var existing = await _service.GetOdApplyByIdAsync(odId);
            if (existing == null) return NotFound("OD request not found");

            var odDept = (existing.department ?? "").Trim();
            var hodDept = (authHod.Department ?? "").Trim();
            if (!string.IsNullOrEmpty(odDept) && !string.IsNullOrEmpty(hodDept) && !odDept.Equals(hodDept, StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new { message = "You are not authorized to override members outside of your department." });
            }

            var od = await _service.HodOverrideGroupMemberAsync(odId, registerNumber.Trim());
            if (od == null) return NotFound("OD request not found");
            return Ok(od);
        }


        // PUT /api/OdApply/{odId}/AlterDays
        // Staff adjusts FromDate, ToDate, and NumberOfDays on a still-Pending OD.
        [HttpPut("{odId}/AlterDays")]
        public async Task<IActionResult> AlterDays(int odId, [FromBody] AlterDaysDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.FromDate) || string.IsNullOrWhiteSpace(dto.ToDate))
                return BadRequest("FromDate and ToDate are required.");

            var dateError = WorkingDaysCalendar.ValidateRange(dto.FromDate, dto.ToDate);
            if (dateError != null)
                return BadRequest(dateError);

            // Server recomputes days; client hint is a fallback
            int days = dto.NumberOfDays ?? 1;

            var result = await _service.AlterDaysAsync(odId, dto.FromDate, dto.ToDate, days, dto.StartTime, dto.EndTime, dto.EditedBy);
            if (result == null)
                return BadRequest("OD not found or is no longer in Pending status — dates cannot be altered.");

            return Ok(new
            {
                result.OdId,
                result.FromDate,
                result.ToDate,
                result.StartTime,
                result.EndTime,
                result.NumberOfDays,
                result.IsDateEdited,
                result.DateEditedBy,
                result.OriginalFromDate,
                result.OriginalToDate,
                result.OriginalStartTime,
                result.OriginalEndTime
            });
        }

        // PUT /api/OdApply/{odId}/EditGroupOd
        // Student edits their own Group OD (dates, event, reason, members) —
        // only while it is still Pending with both faculty and HOD.
        [HttpPut("{odId}/EditGroupOd")]
        public async Task<IActionResult> EditGroupOd(int odId, [FromBody] EditGroupOdDto dto)
        {
            if (dto == null)
                return BadRequest("Edit data is required.");

            var (od, error) = await _service.EditGroupOdAsync(odId, dto);
            if (error != null)
                return BadRequest(error);

            return Ok(od);
        }

        // POST /api/OdApply/{odId}/UploadCertificate
        // Each student (identified by registerNumber) gets their own certificate
        // row for this OD — required for group ODs where multiple members each
        // upload their own certificate without overwriting each other's.
        // Only the authenticated Student (whose register number matches the OD or its member list) may upload.
        [Authorize(Roles = "Student")]
        [HttpPost("{odId}/UploadCertificate")]
        public async Task<IActionResult> UploadCertificate(int odId,
            [FromForm] string winningStatus,
            [FromForm] string registerNumber,
            IFormFile photo)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            // Resolve authenticated student and verify they are a member of this OD
            var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId <= 0)
                return Unauthorized(new { message = "Invalid or missing student authentication token." });

            var authStudent = await _studentService.GetStudentByIdAsync(authStudentId);
            if (authStudent == null)
                return StatusCode(403, new { message = "Authenticated student not found." });

            // The register number in the form must belong to the authenticated student
            if (string.IsNullOrWhiteSpace(authStudent.RegisterNumber) ||
                !authStudent.RegisterNumber.Trim().Equals(registerNumber.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return StatusCode(403, new { message = "You can only upload a certificate for your own register number." });
            }

            var od = await _service.GetOdApplyByIdAsync(odId);
            if (od == null) return NotFound();

            // Verify this student is the applicant or a listed group member of the OD
            var requestedReg = registerNumber.Trim();
            bool isMember = (od.registerNumber != null &&
                             od.registerNumber.Trim().Equals(requestedReg, StringComparison.OrdinalIgnoreCase))
                            ||
                            (od.IsGroupOd && od.RegisterNumbers != null &&
                             od.RegisterNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                                              .Any(r => r.Equals(requestedReg, StringComparison.OrdinalIgnoreCase)));

            if (!isMember)
                return StatusCode(403, new { message = "You are not a member of this OD application." });

            var existingCerts = await _service.GetCertificatesForOdAsync(odId);
            var mine = existingCerts.FirstOrDefault(c =>
                c.RegisterNumber.Equals(registerNumber.Trim(), StringComparison.OrdinalIgnoreCase));

            if (mine != null && mine.CertificateVerified)
                return BadRequest("This certificate has already been verified by staff and can no longer be changed.");

            var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
            Directory.CreateDirectory(uploadsDir);
            var fileName = $"{odId}_{registerNumber.Trim()}_{Guid.NewGuid()}{Path.GetExtension(photo.FileName)}";
            var filePath = Path.Combine(uploadsDir, fileName);
            using var stream = System.IO.File.Create(filePath);
            await photo.CopyToAsync(stream);

            var certUrl = $"/uploads/{fileName}";
            var cert = await _service.UploadMemberCertificateAsync(odId, registerNumber.Trim(), winningStatus, certUrl);

            return Ok(cert);
        }

        // GET /api/OdApply/{odId}/Certificates
        // Returns every group member's certificate for this OD (one entry per
        // register number who has uploaded so far).
        [HttpGet("{odId}/Certificates")]
        public async Task<IActionResult> GetCertificates(int odId)
        {
            var certs = await _service.GetCertificatesForOdAsync(odId);
            return Ok(certs);
        }

        // GET /api/OdApply/Analytics/{department}
        // Event/participation/win-count summary + per-student breakdown for
        // a department — shown on both the Staff and HOD dashboards.
        [HttpGet("Analytics/{department}")]
        public async Task<IActionResult> GetAnalytics(string department)
        {
            if (string.IsNullOrWhiteSpace(department))
                return BadRequest("department is required");

            var data = await _service.GetAnalyticsAsync(department);
            return Ok(data);
        }

        // GET /api/OdApply/ReportSearch
        // Dedicated search & report endpoint for the Analytics 4th Box ("OD Student / Report Search").
        // If staffId is provided, the backend enforces the staff member's assigned year and section
        // from the database — frontend-supplied year/section params are IGNORED for staff users.
        [HttpGet("ReportSearch")]
        public async Task<IActionResult> ReportSearch(
            [FromQuery] string? department = null,
            [FromQuery] string? studentName = null,
            [FromQuery] string? registerNumber = null,
            [FromQuery] string? classYearSection = null,
            [FromQuery] string? eventName = null,
            [FromQuery] string? collegeName = null,
            [FromQuery] string? odType = null,
            [FromQuery] string? certification = null,
            [FromQuery] string? startDate = null,
            [FromQuery] string? endDate = null,
            [FromQuery] int? year = null,
            [FromQuery] string? section = null,
            [FromQuery] int? staffId = null)
        {
            // If staffId is provided, enforce the staff member's actual assigned year/section.
            // This prevents manipulation of year/section query params from the frontend.
            if (staffId.HasValue && staffId.Value > 0)
            {
                var staff = await _staffService.GetStaffByIdAsync(staffId.Value);
                if (staff != null)
                {
                    year = staff.Year;
                    section = staff.Section;
                }
            }

            var results = await _service.SearchOdReportsAsync(
                department, studentName, registerNumber, classYearSection, eventName, collegeName, odType, certification, startDate, endDate, year, section);
            return Ok(results);
        }

        // GET /api/OdApply/ReportExportExcel
        // Generates and downloads a real Microsoft Excel (.xlsx) workbook for the Analytics 4th Box.
        // If staffId is provided, the backend enforces the staff member's actual assigned year/section.
        [HttpGet("ReportExportExcel")]
        public async Task<IActionResult> ReportExportExcel(
            [FromQuery] string? department = null,
            [FromQuery] string? studentName = null,
            [FromQuery] string? registerNumber = null,
            [FromQuery] string? classYearSection = null,
            [FromQuery] string? eventName = null,
            [FromQuery] string? collegeName = null,
            [FromQuery] string? odType = null,
            [FromQuery] string? certification = null,
            [FromQuery] string? startDate = null,
            [FromQuery] string? endDate = null,
            [FromQuery] int? year = null,
            [FromQuery] string? section = null,
            [FromQuery] int? staffId = null)
        {
            // If staffId is provided, enforce the staff member's actual assigned year/section.
            if (staffId.HasValue && staffId.Value > 0)
            {
                var staff = await _staffService.GetStaffByIdAsync(staffId.Value);
                if (staff != null)
                {
                    year = staff.Year;
                    section = staff.Section;
                }
            }

            var excelBytes = await _service.GenerateOdReportExcelAsync(
                department, studentName, registerNumber, classYearSection, eventName, collegeName, odType, certification, startDate, endDate, year, section);

            var deptSanitized = string.IsNullOrWhiteSpace(department) ? "All" : department.Trim().Replace(" ", "_");
            var fileName = $"OD_Report_{deptSanitized}_{DateTime.Now:yyyyMMdd_HHmmss}.xlsx";

            return File(excelBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", fileName);
        }

        // PUT /api/OdApply/{odId}/VerifyCertificate?registerNumber=XXX
        // Staff verifies ONE specific member's certificate — once verified,
        // that student (and only that student) can no longer replace it.
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpPut("{odId}/VerifyCertificate")]
        public async Task<IActionResult> VerifyCertificate(int odId, [FromQuery] string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber))
                return BadRequest("registerNumber is required");

            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _hodService.GetHodByIdAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "Your HOD account has been deactivated." });
            }

            var cert = await _service.VerifyMemberCertificateAsync(odId, registerNumber.Trim());
            if (cert == null) return NotFound("Certificate not found for this student on this OD");

            return Ok(cert);
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