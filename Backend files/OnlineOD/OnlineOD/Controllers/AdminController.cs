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

        // ── Admin OD Request Management ──────────────────────────────

        // GET /api/Admin/ODRequests
        // Returns all OD applications with full student, class, dates, status, and certificate data.
        [HttpGet("ODRequests")]
        public async Task<IActionResult> GetOdRequests()
        {
            var ods = await _context.OdApplies
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();

            var studentRegs = ods
                .Select(o => (o.registerNumber ?? "").Trim().ToLower())
                .Where(r => !string.IsNullOrEmpty(r))
                .Distinct()
                .ToList();

            var studentList = await _context.Students
                .Where(s => studentRegs.Contains((s.RegisterNumber ?? "").ToLower()))
                .ToListAsync();

            var students = new Dictionary<string, Student>();
            foreach (var s in studentList)
            {
                var key = (s.RegisterNumber ?? "").Trim().ToLower();
                if (!string.IsNullOrEmpty(key) && !students.ContainsKey(key))
                {
                    students[key] = s;
                }
            }

            var odIds = ods.Select(o => o.OdId).ToList();
            var certs = await _context.OdCertificates
                .Where(c => odIds.Contains(c.OdId))
                .ToListAsync();
            var certsByOd = certs.GroupBy(c => c.OdId).ToDictionary(g => g.Key, g => g.ToList());

            var result = ods.Select(o =>
            {
                var regKey = (o.registerNumber ?? "").Trim().ToLower();
                students.TryGetValue(regKey, out var student);

                certsByOd.TryGetValue(o.OdId, out var odCerts);
                string certStatus = !string.IsNullOrWhiteSpace(o.WinningStatus)
                    ? o.WinningStatus
                    : (odCerts != null && odCerts.Any(c => !string.IsNullOrWhiteSpace(c.WinningStatus))
                        ? string.Join(", ", odCerts.Where(c => !string.IsNullOrWhiteSpace(c.WinningStatus)).Select(c => c.WinningStatus).Distinct())
                        : (!string.IsNullOrWhiteSpace(o.CertificatePhotoUrl) || (odCerts != null && odCerts.Count > 0) ? "Submitted" : "Not Submitted"));

                return new
                {
                    odId = o.OdId,
                    studentId = o.StudentId,
                    studentName = o.StudentName,
                    registerNumber = o.registerNumber,
                    department = o.department,
                    section = o.Section ?? student?.Section,
                    year = student?.Year,
                    semester = student?.semester,
                    eventName = o.Event,
                    competitionType = o.CompetitionType,
                    reason = o.Reason,
                    collegeName = o.CollegeIndustry,
                    fromDate = o.FromDate,
                    toDate = o.ToDate,
                    startTime = o.StartTime,
                    endTime = o.EndTime,
                    numberOfDays = o.NumberOfDays,
                    appliedDate = o.AppliedDate,
                    facultyStatus = o.FacultyStatus,
                    hodStatus = o.HodStatus,
                    isGroupOd = o.IsGroupOd,
                    groupName = o.GroupName,
                    registerNumbers = o.RegisterNumbers,
                    facultyApprovedRegisterNumbers = o.FacultyApprovedRegisterNumbers,
                    facultyRejectedRegisterNumbers = o.FacultyRejectedRegisterNumbers,
                    hodApprovedRegisterNumbers = o.HodApprovedRegisterNumbers,
                    certificationStatus = certStatus,
                    certificateVerified = o.CertificateVerified,
                    certificatePhotoUrl = o.CertificatePhotoUrl
                };
            }).ToList();

            return Ok(result);
        }

        // GET /api/Admin/Certificates
        // Returns both Pending Certificates (completed ODs without submitted certificates)
        // and Submitted Certificates (completed or uploaded certificates with in-page viewable info).
        [HttpGet("Certificates")]
        public async Task<IActionResult> GetCertificates()
        {
            var today = DateTime.Today;

            var allOds = await _context.OdApplies
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();

            var allCerts = await _context.OdCertificates
                .OrderByDescending(c => c.UploadedDate)
                .ToListAsync();

            var studentList = await _context.Students.ToListAsync();
            var studentsByReg = studentList
                .Where(s => !string.IsNullOrEmpty(s.RegisterNumber))
                .GroupBy(s => s.RegisterNumber.Trim().ToLower())
                .ToDictionary(g => g.Key, g => g.First());

            var odsById = allOds.ToDictionary(o => o.OdId, o => o);
            var pending = new List<AdminPendingCertDto>();
            var submitted = new List<AdminSubmittedCertDto>();
            var processedSubmittedKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1. Process all submitted certificates from OdCertificates table
            foreach (var cert in allCerts)
            {
                if (string.IsNullOrWhiteSpace(cert.CertificatePhotoUrl)) continue;

                odsById.TryGetValue(cert.OdId, out var od);
                var regKey = (cert.RegisterNumber ?? "").Trim().ToLower();
                studentsByReg.TryGetValue(regKey, out var student);

                string studentName = student?.Name ?? "";
                if (string.IsNullOrWhiteSpace(studentName) && od != null && (od.registerNumber ?? "").Trim().ToLower() == regKey)
                {
                    studentName = od.StudentName ?? "";
                }

                processedSubmittedKeys.Add($"{cert.OdId}_{regKey}");

                submitted.Add(new AdminSubmittedCertDto
                {
                    CertId = cert.Id,
                    OdId = cert.OdId,
                    StudentId = student?.StudentId ?? (od?.StudentId ?? 0),
                    StudentName = !string.IsNullOrWhiteSpace(studentName) ? studentName : cert.RegisterNumber,
                    RegisterNumber = cert.RegisterNumber,
                    Department = student?.Department ?? od?.department,
                    Section = student?.Section ?? od?.Section,
                    Year = student?.Year,
                    EventName = od?.Event ?? "",
                    CollegeName = od?.CollegeIndustry ?? "",
                    CompetitionType = od?.CompetitionType,
                    FromDate = od?.FromDate,
                    ToDate = od?.ToDate,
                    NumberOfDays = od?.NumberOfDays ?? 0,
                    IsGroupOd = od?.IsGroupOd ?? false,
                    GroupName = od?.GroupName,
                    Reason = od?.Reason,
                    WinningStatus = cert.WinningStatus,
                    CertificatePhotoUrl = cert.CertificatePhotoUrl,
                    CertificateVerified = cert.CertificateVerified,
                    UploadedDate = cert.UploadedDate
                });
            }

            // Also check if any solo OdApply has CertificatePhotoUrl without an OdCertificate row
            foreach (var od in allOds)
            {
                if (!string.IsNullOrWhiteSpace(od.CertificatePhotoUrl) && !od.IsGroupOd)
                {
                    var regKey = (od.registerNumber ?? "").Trim().ToLower();
                    if (!processedSubmittedKeys.Contains($"{od.OdId}_{regKey}"))
                    {
                        studentsByReg.TryGetValue(regKey, out var student);
                        processedSubmittedKeys.Add($"{od.OdId}_{regKey}");
                        submitted.Add(new AdminSubmittedCertDto
                        {
                            CertId = 0,
                            OdId = od.OdId,
                            StudentId = od.StudentId,
                            StudentName = od.StudentName ?? student?.Name ?? od.registerNumber ?? "",
                            RegisterNumber = od.registerNumber ?? "",
                            Department = od.department ?? student?.Department,
                            Section = od.Section ?? student?.Section,
                            Year = student?.Year,
                            EventName = od.Event ?? "",
                            CollegeName = od.CollegeIndustry ?? "",
                            CompetitionType = od.CompetitionType,
                            FromDate = od.FromDate,
                            ToDate = od.ToDate,
                            NumberOfDays = od.NumberOfDays,
                            IsGroupOd = false,
                            GroupName = od.GroupName,
                            Reason = od.Reason,
                            WinningStatus = od.WinningStatus,
                            CertificatePhotoUrl = od.CertificatePhotoUrl,
                            CertificateVerified = od.CertificateVerified,
                            UploadedDate = od.AppliedDate
                        });
                    }
                }
            }

            // 2. Process Pending Certificates (completed approved ODs where certificate is NOT submitted)
            var completedApprovedOds = allOds.Where(o =>
                o.HodStatus == "Approved" &&
                DateTime.TryParse(o.ToDate, out var to) &&
                to.Date < today
            ).ToList();

            foreach (var od in completedApprovedOds)
            {
                if (!od.IsGroupOd)
                {
                    var regKey = (od.registerNumber ?? "").Trim().ToLower();
                    bool hasCert = processedSubmittedKeys.Contains($"{od.OdId}_{regKey}");
                    if (!hasCert)
                    {
                        studentsByReg.TryGetValue(regKey, out var student);
                        pending.Add(new AdminPendingCertDto
                        {
                            OdId = od.OdId,
                            StudentId = od.StudentId,
                            StudentName = od.StudentName ?? student?.Name ?? od.registerNumber ?? "",
                            RegisterNumber = od.registerNumber ?? "",
                            Department = od.department ?? student?.Department,
                            Section = od.Section ?? student?.Section,
                            Year = student?.Year,
                            EventName = od.Event,
                            CollegeName = od.CollegeIndustry,
                            CompetitionType = od.CompetitionType,
                            FromDate = od.FromDate,
                            ToDate = od.ToDate,
                            NumberOfDays = od.NumberOfDays,
                            IsGroupOd = false,
                            GroupName = od.GroupName,
                            Reason = od.Reason,
                            AppliedDate = od.AppliedDate
                        });
                    }
                }
                else
                {
                    // Group OD: check EACH approved member
                    var allMembers = (od.RegisterNumbers ?? "")
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(r => r.Trim())
                        .ToList();

                    var rejected = (od.FacultyRejectedRegisterNumbers ?? "")
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(r => r.Trim().ToLower())
                        .ToHashSet();

                    var hodAppr = (od.HodApprovedRegisterNumbers ?? "")
                        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                        .Select(r => r.Trim().ToLower())
                        .ToHashSet();

                    foreach (var memberReg in allMembers)
                    {
                        var mLower = memberReg.ToLower();
                        bool isRejected = rejected.Contains(mLower) && !hodAppr.Contains(mLower);
                        if (isRejected) continue; // Rejected members did not attend OD

                        bool hasCert = processedSubmittedKeys.Contains($"{od.OdId}_{mLower}");
                        if (!hasCert)
                        {
                            studentsByReg.TryGetValue(mLower, out var student);
                            string memberName = student?.Name ?? "";
                            if (string.IsNullOrWhiteSpace(memberName) && (od.registerNumber ?? "").Trim().ToLower() == mLower)
                            {
                                memberName = od.StudentName ?? "";
                            }

                            pending.Add(new AdminPendingCertDto
                            {
                                OdId = od.OdId,
                                StudentId = student?.StudentId ?? 0,
                                StudentName = !string.IsNullOrWhiteSpace(memberName) ? memberName : memberReg,
                                RegisterNumber = memberReg,
                                Department = student?.Department ?? od.department,
                                Section = student?.Section ?? od.Section,
                                Year = student?.Year,
                                EventName = od.Event,
                                CollegeName = od.CollegeIndustry,
                                CompetitionType = od.CompetitionType,
                                FromDate = od.FromDate,
                                ToDate = od.ToDate,
                                NumberOfDays = od.NumberOfDays,
                                IsGroupOd = true,
                                GroupName = od.GroupName,
                                Reason = od.Reason,
                                AppliedDate = od.AppliedDate
                            });
                        }
                    }
                }
            }

            var certificatesResult = new AdminCertificatesResultDto
            {
                Pending = pending.OrderByDescending(p => DateTime.TryParse(p.ToDate, out var d) ? d : DateTime.MinValue).ToList(),
                Submitted = submitted.OrderByDescending(s => s.UploadedDate).ToList()
            };

            return Ok(certificatesResult);
        }

        // GET /api/Admin/ODRequests/{id}
        [HttpGet("ODRequests/{id}")]
        public async Task<IActionResult> GetOdRequestById(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return NotFound(new { message = "OD request not found." });
            return Ok(od);
        }

        // PUT /api/Admin/ODRequests/{id}
        // Updates the existing OD record in the database.
        [HttpPut("ODRequests/{id}")]
        public async Task<IActionResult> UpdateOdRequest(int id, [FromBody] AdminOdEditDto dto)
        {
            if (dto == null) return BadRequest(new { message = "Edit data is required." });

            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return NotFound(new { message = "OD request not found." });

            if (!string.IsNullOrWhiteSpace(dto.StudentName)) od.StudentName = dto.StudentName.Trim();
            if (!string.IsNullOrWhiteSpace(dto.RegisterNumber)) od.registerNumber = dto.RegisterNumber.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Department)) od.department = dto.Department.Trim();
            if (dto.Section != null) od.Section = dto.Section.Trim();
            if (!string.IsNullOrWhiteSpace(dto.FromDate)) od.FromDate = dto.FromDate.Trim();
            if (!string.IsNullOrWhiteSpace(dto.ToDate)) od.ToDate = dto.ToDate.Trim();
            if (dto.StartTime != null) od.StartTime = dto.StartTime.Trim();
            if (dto.EndTime != null) od.EndTime = dto.EndTime.Trim();
            if (dto.NumberOfDays.HasValue && dto.NumberOfDays.Value > 0) od.NumberOfDays = dto.NumberOfDays.Value;
            if (!string.IsNullOrWhiteSpace(dto.Event)) od.Event = dto.Event.Trim();
            if (dto.CompetitionType != null) od.CompetitionType = dto.CompetitionType.Trim();
            if (dto.Reason != null) od.Reason = dto.Reason.Trim();
            if (dto.CollegeIndustry != null) od.CollegeIndustry = dto.CollegeIndustry.Trim();

            if (!string.IsNullOrWhiteSpace(dto.FacultyStatus))
            {
                var newFacStatus = dto.FacultyStatus.Trim();
                if (newFacStatus == "Pending" || newFacStatus == "Approved" || newFacStatus == "Rejected")
                {
                    od.FacultyStatus = newFacStatus;
                    if (newFacStatus == "Pending" && od.IsGroupOd)
                    {
                        od.FacultyApprovedRegisterNumbers = null;
                        od.FacultyRejectedRegisterNumbers = null;
                    }
                }
            }

            if (!string.IsNullOrWhiteSpace(dto.HodStatus))
            {
                var newHodStatus = dto.HodStatus.Trim();
                if (newHodStatus == "Pending" || newHodStatus == "Approved" || newHodStatus == "Rejected")
                {
                    od.HodStatus = newHodStatus;
                    if (newHodStatus == "Pending" && od.IsGroupOd)
                    {
                        od.HodApprovedRegisterNumbers = null;
                    }
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "OD request updated successfully.", od });
        }

        // POST /api/Admin/ODRequests/{id}/UndoDecision
        // Resets the decision to Pending for both Staff and HOD so they can act on it again.
        [HttpPost("ODRequests/{id}/UndoDecision")]
        public async Task<IActionResult> UndoOdDecision(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return NotFound(new { message = "OD request not found." });

            od.FacultyStatus = "Pending";
            od.HodStatus = "Pending";

            if (od.IsGroupOd)
            {
                od.FacultyApprovedRegisterNumbers = null;
                od.FacultyRejectedRegisterNumbers = null;
                od.HodApprovedRegisterNumbers = null;
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "OD decision reset to Pending successfully.", od });
        }

        // DELETE /api/Admin/ODRequests/{id}
        // Permanently deletes the OD request and its associated certificates.
        [HttpDelete("ODRequests/{id}")]
        public async Task<IActionResult> DeleteOdRequest(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return NotFound(new { message = "OD request not found." });

            var certs = await _context.OdCertificates.Where(c => c.OdId == id).ToListAsync();
            if (certs.Count > 0)
            {
                _context.OdCertificates.RemoveRange(certs);
            }

            _context.OdApplies.Remove(od);
            await _context.SaveChangesAsync();

            return Ok(new { message = "OD request deleted successfully." });
        }

        // ── Account Activation / Deactivation ────────────────────────

        // PUT /api/Admin/Students/{id}/ToggleStatus
        [HttpPut("Students/{id}/ToggleStatus")]
        public async Task<IActionResult> ToggleStudentStatus(int id)
        {
            var student = await _context.Students.FindAsync(id);
            if (student == null) return NotFound(new { message = "Student not found." });

            student.IsActive = !student.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = student.IsActive ? "Student account activated." : "Student account deactivated.",
                isActive = student.IsActive
            });
        }

        // PUT /api/Admin/Staff/{id}/ToggleStatus
        [HttpPut("Staff/{id}/ToggleStatus")]
        public async Task<IActionResult> ToggleStaffStatus(int id)
        {
            var staff = await _context.Staffs.FindAsync(id);
            if (staff == null) return NotFound(new { message = "Staff member not found." });

            staff.IsActive = !staff.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = staff.IsActive ? "Staff account activated." : "Staff account deactivated.",
                isActive = staff.IsActive
            });
        }

        // PUT /api/Admin/Hod/{id}/ToggleStatus
        [HttpPut("Hod/{id}/ToggleStatus")]
        public async Task<IActionResult> ToggleHodStatus(int id)
        {
            var hod = await _context.Hods.FindAsync(id);
            if (hod == null) return NotFound(new { message = "HOD not found." });

            hod.IsActive = !hod.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = hod.IsActive ? "HOD account activated." : "HOD account deactivated.",
                isActive = hod.IsActive
            });
        }
    }
}