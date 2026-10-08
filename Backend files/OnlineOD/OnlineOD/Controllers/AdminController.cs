using System.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Dtos;
using OnlineOD.Filters;
using OnlineOD.Models;
using OnlineOD.Service;
using OnlineOD.Services;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = "Admin")]
    [TypeFilter(typeof(ActiveAdminFilter))]
    public class AdminController : ControllerBase
    {
        private readonly EmailService _emailService;
        private readonly EmailQueue _emailQueue;
        private readonly ApplicationDbContext _context;
        private readonly IAdminPasswordService _passwordService;
        private readonly IJwtTokenService _jwtTokenService;

        public AdminController(
            EmailService emailService,
            EmailQueue emailQueue,
            ApplicationDbContext context,
            IAdminPasswordService passwordService,
            IJwtTokenService jwtTokenService)
        {
            _emailService = emailService;
            _emailQueue = emailQueue;
            _context = context;
            _passwordService = passwordService;
            _jwtTokenService = jwtTokenService;
        }

        // POST /api/Admin/login
        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] AdminLoginDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.AdminId) || string.IsNullOrWhiteSpace(dto.Password))
            {
                return BadRequest(new { message = "Admin ID and Password are required." });
            }

            var admin = await _context.Admins.FirstOrDefaultAsync(a => a.AdminId.ToLower() == dto.AdminId.Trim().ToLower());

            if (admin == null)
            {
                return Unauthorized(new { message = "Invalid Admin ID or password." });
            }

            if (!admin.IsActive)
            {
                return StatusCode(403, new { message = "Your administrator account has been deactivated. Please contact the system administrator." });
            }

            var isPasswordValid = _passwordService.VerifyPassword(admin, admin.PasswordHash, dto.Password);
            if (!isPasswordValid)
            {
                return Unauthorized(new { message = "Invalid Admin ID or password." });
            }

            var token = _jwtTokenService.GenerateAdminToken(admin);

            return Ok(new
            {
                adminId = admin.AdminId,
                name = admin.Name,
                email = admin.Email,
                isActive = admin.IsActive,
                role = "Admin",
                token = token
            });
        }

        // POST /api/Admin/ContactAdmin
        // Body: { registerNumber, dob, password, role, message }
        // Saves the request to the ContactAdminRequests table (so it shows up
        // on the admin page) AND emails the admin as a heads-up notification.
        // Previously this only sent the email and never touched the database,
        // which is why requests never appeared on the admin page even though
        // the student saw "request sent" successfully.
        [HttpPost("ContactAdmin")]
        [AllowAnonymous]
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
                    _emailQueue.Enqueue(new EmailJob
                    {
                        Type = "ContactAdmin",
                        RegisterNumber = dto.RegisterNumber,
                        Dob = dto.Dob,
                        Password = dto.Password,
                        Role = dto.Role,
                        Message = dto.Message
                    });
                }
                catch (Exception emailEx)
                {
                    Console.WriteLine($"ContactAdmin email enqueue failed: {emailEx.Message}");
                }

                return Ok(new { message = "Your request has been sent to the admin." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ContactAdmin save failed: {ex.Message}");
                return StatusCode(500, new { message = "Could not send your request. Please try again later." });
            }
        }

        // POST /api/Admin/RequestDemo
        // Body: { name, mobileNumber, organizationName, recipientEmail, description }
        // Sends a demo request email to the recipient with the provided details.
        [HttpPost("RequestDemo")]
        [AllowAnonymous]
        public async Task<IActionResult> RequestDemo([FromBody] RequestDemoDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { message = "Request payload is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { message = "Name is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.MobileNumber))
            {
                return BadRequest(new { message = "Mobile Number is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.OrganizationName))
            {
                return BadRequest(new { message = "Organization Name is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.RecipientEmail))
            {
                return BadRequest(new { message = "Recipient Email is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.Description))
            {
                return BadRequest(new { message = "Description is required." });
            }

            var cleanName = dto.Name.Trim();
            var cleanMobile = dto.MobileNumber.Trim();
            var cleanOrg = dto.OrganizationName.Trim();
            var cleanRecipientEmail = dto.RecipientEmail.Trim();
            var cleanDescription = dto.Description.Trim();

            if (cleanName.Length > 100)
            {
                return BadRequest(new { message = "Name cannot exceed 100 characters." });
            }

            if (cleanMobile.Length > 20)
            {
                return BadRequest(new { message = "Mobile Number cannot exceed 20 characters." });
            }

            if (cleanOrg.Length > 150)
            {
                return BadRequest(new { message = "Organization Name cannot exceed 150 characters." });
            }

            if (cleanRecipientEmail.Length > 150)
            {
                return BadRequest(new { message = "Recipient Email cannot exceed 150 characters." });
            }

            try
            {
                var emailAddr = new System.Net.Mail.MailAddress(cleanRecipientEmail);
                if (emailAddr.Address != cleanRecipientEmail || !cleanRecipientEmail.Contains('.'))
                {
                    return BadRequest(new { message = "Please provide a valid Recipient Email address." });
                }
            }
            catch
            {
                return BadRequest(new { message = "Please provide a valid Recipient Email address." });
            }

            if (cleanDescription.Length > 2000)
            {
                return BadRequest(new { message = "Description cannot exceed 2000 characters." });
            }

            try
            {
                await _emailService.SendDemoRequestEmailAsync(cleanName, cleanMobile, cleanOrg, cleanRecipientEmail, cleanDescription);
                return Ok(new { message = "Demo request sent successfully." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[AdminController] RequestDemo email failed: {ex}");
                return StatusCode(500, new { message = "Unable to send your demo request. Please check server email configuration or try again later." });
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

        // ── Admin Accounts Management ────────────────────────────────

        // GET /api/Admin/Accounts
        [HttpGet("Accounts")]
        public async Task<IActionResult> GetAccounts()
        {
            var admins = await _context.Admins
                .AsNoTracking()
                .OrderBy(a => a.Id)
                .Select(a => new AdminResponseDto
                {
                    Id = a.Id,
                    AdminId = a.AdminId,
                    Name = a.Name,
                    Email = a.Email,
                    IsActive = a.IsActive,
                    CreatedAt = a.CreatedAt,
                    UpdatedAt = a.UpdatedAt
                })
                .ToListAsync();

            return Ok(admins);
        }

        // POST /api/Admin/Accounts
        [HttpPost("Accounts")]
        public async Task<IActionResult> CreateAccount([FromBody] CreateAdminDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { message = "Admin account data is required." });
            }

            if (string.IsNullOrWhiteSpace(dto.AdminId) || string.IsNullOrWhiteSpace(dto.Password) || string.IsNullOrWhiteSpace(dto.Name))
            {
                return BadRequest(new { message = "Admin ID, Name, and Password are required." });
            }

            var cleanAdminId = dto.AdminId.Trim();
            var exists = await _context.Admins.AnyAsync(a => a.AdminId.ToLower() == cleanAdminId.ToLower());
            if (exists)
            {
                return Conflict(new { message = $"An administrator account with Admin ID '{cleanAdminId}' already exists." });
            }

            var admin = new Admin
            {
                AdminId = cleanAdminId,
                Name = dto.Name.Trim(),
                Email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim() : null,
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            admin.PasswordHash = _passwordService.HashPassword(admin, dto.Password.Trim());

            _context.Admins.Add(admin);
            await _context.SaveChangesAsync();

            var response = new AdminResponseDto
            {
                Id = admin.Id,
                AdminId = admin.AdminId,
                Name = admin.Name,
                Email = admin.Email,
                IsActive = admin.IsActive,
                CreatedAt = admin.CreatedAt,
                UpdatedAt = admin.UpdatedAt
            };

            return Ok(response);
        }

        // PUT /api/Admin/Accounts/{id}
        [HttpPut("Accounts/{id}")]
        public async Task<IActionResult> UpdateAccount(int id, [FromBody] UpdateAdminDto dto)
        {
            if (dto == null)
            {
                return BadRequest(new { message = "Update data is required." });
            }

            var admin = await _context.Admins.FindAsync(id);
            if (admin == null)
            {
                return NotFound(new { message = "Administrator account not found." });
            }

            if (!string.IsNullOrWhiteSpace(dto.Name))
            {
                admin.Name = dto.Name.Trim();
            }

            admin.Email = !string.IsNullOrWhiteSpace(dto.Email) ? dto.Email.Trim() : null;

            if (!string.IsNullOrWhiteSpace(dto.Password))
            {
                admin.PasswordHash = _passwordService.HashPassword(admin, dto.Password.Trim());
            }

            admin.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            var response = new AdminResponseDto
            {
                Id = admin.Id,
                AdminId = admin.AdminId,
                Name = admin.Name,
                Email = admin.Email,
                IsActive = admin.IsActive,
                CreatedAt = admin.CreatedAt,
                UpdatedAt = admin.UpdatedAt
            };

            return Ok(response);
        }

        // PUT /api/Admin/Accounts/{id}/ToggleStatus
        [HttpPut("Accounts/{id}/ToggleStatus")]
        public async Task<IActionResult> ToggleAccountStatus(int id)
        {
            using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var admin = await _context.Admins.FindAsync(id);
                if (admin == null)
                {
                    return NotFound(new { message = "Administrator account not found." });
                }

                // Last Active Admin Protection: If target is currently active, verify at least one other active admin exists
                if (admin.IsActive)
                {
                    var activeCount = await _context.Admins.CountAsync(a => a.IsActive);
                    if (activeCount <= 1)
                    {
                        return BadRequest(new { message = "Cannot deactivate the last active administrator account." });
                    }
                }

                admin.IsActive = !admin.IsActive;
                admin.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    message = admin.IsActive ? "Administrator account activated." : "Administrator account deactivated.",
                    isActive = admin.IsActive
                });
            }
            catch (Exception ex) when (ex is DbUpdateConcurrencyException || ex is DbUpdateException)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "A concurrent modification was detected while updating administrator status. Please refresh and try again." });
            }
        }

        // DELETE /api/Admin/Accounts/{id}
        [HttpDelete("Accounts/{id}")]
        public async Task<IActionResult> DeleteAccount(int id)
        {
            using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var admin = await _context.Admins.FindAsync(id);
                if (admin == null)
                {
                    return NotFound(new { message = "Administrator account not found." });
                }

                // Last Active Admin Protection: Cannot delete if it is the only admin, or if total admin count is 1
                var totalCount = await _context.Admins.CountAsync();
                if (totalCount <= 1)
                {
                    return BadRequest(new { message = "Cannot delete the only administrator account in the system." });
                }

                if (admin.IsActive)
                {
                    var activeCount = await _context.Admins.CountAsync(a => a.IsActive);
                    if (activeCount <= 1)
                    {
                        return BadRequest(new { message = "Cannot delete the last active administrator account." });
                    }
                }

                _context.Admins.Remove(admin);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new { message = "Administrator account deleted successfully." });
            }
            catch (Exception ex) when (ex is DbUpdateConcurrencyException || ex is DbUpdateException)
            {
                await transaction.RollbackAsync();
                return Conflict(new { message = "A concurrent modification was detected while deleting the administrator account. Please refresh and try again." });
            }
        }

        public class PromoteStudentsDto
        {
            public string Category { get; set; } = "UG";
            public int CurrentYear { get; set; }
            public int? FromYear { get; set; }
            public int? ToYear { get; set; }
        }

        // GET /api/Admin/PromoteEligibleCount?category=UG&fromYear=1
        [HttpGet("PromoteEligibleCount")]
        public async Task<IActionResult> GetPromoteEligibleCount([FromQuery] string category = "UG", [FromQuery] int? fromYear = null, [FromQuery] int currentYear = 1)
        {
            var cat = (category ?? "UG").Trim().ToUpper();
            int yr = fromYear.HasValue && fromYear.Value > 0 ? fromYear.Value : currentYear;
            var count = await _context.Students
                .CountAsync(s => s.Category.ToUpper() == cat && s.Year == yr && s.IsActive);

            return Ok(new { count, category = cat, currentYear = yr, fromYear = yr });
        }

        // POST /api/Admin/PromoteStudents
        [HttpPost("PromoteStudents")]
        public async Task<IActionResult> PromoteStudents([FromBody] PromoteStudentsDto dto)
        {
            if (dto == null) return BadRequest("Promotion parameters required.");

            var cat = (dto.Category ?? "UG").Trim().ToUpper();
            if (cat != "UG" && cat != "PG")
                return BadRequest("Category must be UG or PG.");

            int fromYr = dto.FromYear.HasValue && dto.FromYear.Value > 0 ? dto.FromYear.Value : dto.CurrentYear;
            if (fromYr < 1 || fromYr > 4)
                return BadRequest("From year must be between 1 and 4.");

            int newYear = dto.ToYear.HasValue && dto.ToYear.Value > 0 ? dto.ToYear.Value : (fromYr + 1);

            var eligibleStudents = await _context.Students
                .Where(s => s.Category.ToUpper() == cat && s.Year == fromYr && s.IsActive)
                .ToListAsync();

            if (eligibleStudents.Count == 0)
            {
                return Ok(new { count = 0, message = $"No active {cat} Year {fromYr} students found to promote." });
            }

            var todayStr = DateTime.Today.ToString("yyyy-MM-dd");

            // Look up academic configuration for the new year
            var academicSemesters = await _context.AcademicSemesters
                .Where(a => a.Category.ToUpper() == cat && a.Year == newYear)
                .ToListAsync();

            var currentSemesterConfig = academicSemesters
                .FirstOrDefault(a => string.Compare(a.StartDate, todayStr, StringComparison.OrdinalIgnoreCase) <= 0 && string.Compare(a.EndDate, todayStr, StringComparison.OrdinalIgnoreCase) >= 0);

            int fallbackSemester = (newYear - 1) * 2 + 1;
            int targetSemester = currentSemesterConfig?.Semester ?? fallbackSemester;

            foreach (var student in eligibleStudents)
            {
                student.Year = newYear;
                student.semester = targetSemester;
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                count = eligibleStudents.Count,
                category = cat,
                fromYear = fromYr,
                toYear = newYear,
                semester = targetSemester,
                message = $"Successfully promoted {eligibleStudents.Count} {cat} students from Year {fromYr} to Year {newYear}."
            });
        }
    }
}