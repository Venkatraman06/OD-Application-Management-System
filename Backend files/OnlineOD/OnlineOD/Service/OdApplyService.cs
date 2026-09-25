using OnlineOD.Data;
using OnlineOD.Models;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Dtos;
using System;

namespace OnlineOD.Service
{
    public class OdApplyService : IOdApplyService
    {
        private readonly ApplicationDbContext _context;

        public OdApplyService(ApplicationDbContext context)
        {
            _context = context;
        }

        // Get all OD applications
        public async Task<List<OdApply>> GetAllOdApplyAsync()
        {
            return await _context.OdApplies.ToListAsync();
        }

        // Get OD application by ID
        public async Task<OdApply?> GetOdApplyByIdAsync(int id)
        {
            return await _context.OdApplies.FindAsync(id);
        }

        // Get OD applications by student ID
        public async Task<List<OdApply>> GetByStudentIdAsync(int studentId)
        {
            return await _context.OdApplies
                .Where(o => o.StudentId == studentId)
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
        }

        // Get OD applications by department
        // Section filtering (when provided) determines visibility PER STAFF:
        // - Solo OD: matches the single applicant's own Section, as before.
        // - Group OD: matches if ANY member's ACTUAL current Section (looked
        //   up from the Students table) equals the target — not just the
        //   Section of whichever student originally created the group. This
        //   is what makes a mixed Section-A + Section-B group visible to
        //   BOTH class staffs instead of only the applicant's own staff.
        public async Task<List<OdApply>> GetByDepartmentAsync(string department, string? section = null)
        {
            // Returns every OD for this department regardless of status —
            // the frontend tabs (Pending / No Action / Accepted / Rejected)
            // split them client-side using facultyStatus + isOngoing. Only
            // filtering by FacultyStatus == "Pending" here would make an OD
            // vanish from every tab the instant it's approved or rejected,
            // since it would never come back from this endpoint again.
            var deptOds = await _context.OdApplies
                .Where(o => o.department == department)
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();

            if (string.IsNullOrWhiteSpace(section))
                return deptOds;

            var target = section.Trim().ToLower();

            var allRegNumbers = deptOds
                .Where(o => o.IsGroupOd)
                .SelectMany(o => ParseList(o.RegisterNumbers))
                .Select(r => r.ToLower())
                .Distinct()
                .ToList();

            var studentSections = allRegNumbers.Count == 0
                ? new Dictionary<string, string>()
                : await _context.Students
                    .Where(s => allRegNumbers.Contains(s.RegisterNumber.ToLower()))
                    .ToDictionaryAsync(s => s.RegisterNumber.ToLower(), s => s.Section ?? "");

            return deptOds.Where(o =>
            {
                if (!o.IsGroupOd)
                    return o.Section != null && o.Section.Trim().ToLower() == target;

                return ParseList(o.RegisterNumbers).Any(reg =>
                    studentSections.TryGetValue(reg.ToLower(), out var sec) &&
                    sec.Trim().ToLower() == target);
            }).ToList();
        }

        public async Task<List<string>> GetInvolvedSectionsAsync(OdApply od)
        {
            if (!od.IsGroupOd)
            {
                return string.IsNullOrWhiteSpace(od.Section)
                    ? new List<string>()
                    : new List<string> { od.Section.Trim() };
            }

            var regs = ParseList(od.RegisterNumbers).Select(r => r.ToLower()).ToHashSet();
            if (regs.Count == 0) return new List<string>();

            var sections = await _context.Students
                .Where(s => regs.Contains(s.RegisterNumber.ToLower()))
                .Select(s => s.Section)
                .ToListAsync();

            return sections
                .Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        // Analytics report — every uploaded certificate in this department,
        // joined with its OD (for event/dates) and the student record (for
        // name/section), then bucketed into win-status counts and an
        // event-wise participation count for the charts, plus the full
        // per-student breakdown table.
        public async Task<AnalyticsSummaryDto> GetAnalyticsAsync(string department)
        {
            var deptLower = department.Trim().ToLower();

            // Every OD application on file for the department, regardless of
            // status — used for TotalOdApplications and for the per-company
            // OD counts (how many students went, whether or not they later
            // submitted a certificate).
            var allDeptOds = await _context.OdApplies
                .Where(o => o.department != null && o.department.Trim().ToLower() == deptLower)
                .ToListAsync();

            var joined = await (
                from c in _context.OdCertificates
                join o in _context.OdApplies on c.OdId equals o.OdId
                where o.department != null
                      && o.department.Trim().ToLower() == deptLower
                      && !string.IsNullOrEmpty(c.CertificatePhotoUrl)
                select new { c, o }
            ).ToListAsync();

            var regNumbers = joined.Select(x => x.c.RegisterNumber.ToLower()).Distinct().ToList();
            var studentInfo = regNumbers.Count == 0
                ? new Dictionary<string, (string Name, string Section)>()
                : (await _context.Students
                    .Where(s => regNumbers.Contains(s.RegisterNumber.ToLower()))
                    .ToListAsync())
                    .GroupBy(s => s.RegisterNumber.ToLower())
                    .ToDictionary(g => g.Key, g => (Name: g.First().Name ?? "", Section: g.First().Section ?? ""));

            var students = new List<AnalyticsStudentEntryDto>();
            int participated = 0, first = 0, second = 0, third = 0, other = 0;

            foreach (var x in joined)
            {
                var regLower = x.c.RegisterNumber.ToLower();
                studentInfo.TryGetValue(regLower, out var info);

                var name = !string.IsNullOrEmpty(info.Name)
                    ? info.Name
                    : (regLower == (x.o.registerNumber ?? "").ToLower() ? x.o.StudentName : x.c.RegisterNumber) ?? x.c.RegisterNumber;
                var section = info.Section ?? "";

                var status = (x.c.WinningStatus ?? "").Trim();
                switch (status)
                {
                    case "1st Prize": first++; break;
                    case "2nd Prize": second++; break;
                    case "3rd Prize": third++; break;
                    case "Participated": participated++; break;
                    default: other++; break;
                }

                students.Add(new AnalyticsStudentEntryDto
                {
                    StudentName = name,
                    RegisterNumber = x.c.RegisterNumber,
                    Section = section,
                    Event = x.o.Event ?? "",
                    CollegeIndustry = x.o.CollegeIndustry ?? "",
                    WinningStatus = string.IsNullOrEmpty(status) ? "Not Specified" : status,
                    FromDate = x.o.FromDate ?? "",
                    ToDate = x.o.ToDate ?? "",
                    CertificateVerified = x.c.CertificateVerified
                });
            }

            var eventCounts = joined
                .GroupBy(x => string.IsNullOrWhiteSpace(x.o.Event) ? "Unspecified" : x.o.Event!.Trim())
                .Select(g => new AnalyticsEventCountDto
                {
                    Event = g.Key,
                    Count = g.Select(x => x.c.RegisterNumber.ToLower()).Distinct().Count()
                })
                .OrderByDescending(e => e.Count)
                .ToList();

            // OD count per company/college: distinct students from ALL OD
            // applications for that company, not just certificate-linked
            // ones — group ODs count once per member so headcount is right.
            var odCountByCompany = allDeptOds
                .GroupBy(o => string.IsNullOrWhiteSpace(o.CollegeIndustry) ? "Unspecified" : o.CollegeIndustry!.Trim())
                .ToDictionary(
                    g => g.Key,
                    g => g.Sum(o => o.IsGroupOd
                        ? Math.Max(ParseList(o.RegisterNumbers).Count, 1)
                        : 1));

            // Certificate count per company/college: distinct students who
            // actually submitted a certificate for that company.
            var certCountByCompany = joined
                .GroupBy(x => string.IsNullOrWhiteSpace(x.o.CollegeIndustry) ? "Unspecified" : x.o.CollegeIndustry!.Trim())
                .ToDictionary(
                    g => g.Key,
                    g => g.Select(x => x.c.RegisterNumber.ToLower()).Distinct().Count());

            var companyCounts = odCountByCompany.Keys
                .Union(certCountByCompany.Keys)
                .Select(company => new AnalyticsCompanyCountDto
                {
                    CollegeIndustry = company,
                    OdCount = odCountByCompany.TryGetValue(company, out var odc) ? odc : 0,
                    CertificateCount = certCountByCompany.TryGetValue(company, out var cc) ? cc : 0
                })
                .OrderByDescending(c => c.OdCount)
                .ToList();

            return new AnalyticsSummaryDto
            {
                TotalEvents = eventCounts.Count,
                TotalParticipants = regNumbers.Count,
                TotalCertificates = joined.Count,
                TotalOdApplications = allDeptOds.Count,
                ParticipatedCount = participated,
                FirstPrizeCount = first,
                SecondPrizeCount = second,
                ThirdPrizeCount = third,
                OtherCount = other,
                EventCounts = eventCounts,
                CompanyCounts = companyCounts,
                Students = students.OrderByDescending(s => s.FromDate).ToList()
            };
        }

        // Get OD applications approved by faculty for a department
        public async Task<List<OdApply>> GetApprovedByFacultyAsync(string department)
        {
            return await _context.OdApplies
                .Where(o => o.department == department && o.FacultyStatus == "Approved")
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
        }

        // Get OD applications approved by HOD for a department

        public async Task<OdApply> CreateOdApplyAsync(OdApplyDto dto)
        {
            var applicant = await _context.Students.FindAsync(dto.StudentId);
            if (applicant != null && !applicant.IsActive)
            {
                throw new InvalidOperationException($"The student with register number {applicant.RegisterNumber} has been deactivated by their class advisor and cannot apply for OD.");
            }

            if (dto.IsGroupOd && !string.IsNullOrWhiteSpace(dto.RegisterNumbers))
            {
                var memberRegs = dto.RegisterNumbers
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(r => r.ToUpper())
                    .ToList();

                if (memberRegs.Count > 0)
                {
                    var allStudents = await _context.Students.ToListAsync();
                    var deactivated = allStudents
                        .FirstOrDefault(s => memberRegs.Contains(s.RegisterNumber.ToUpper()) && !s.IsActive);

                    if (deactivated != null)
                    {
                        throw new InvalidOperationException($"The student with register number {deactivated.RegisterNumber} has been deactivated by their class advisor and cannot be added to the Group OD.");
                    }
                }
            }



            var od = new OdApply
            {
                StudentId = dto.StudentId,
                StudentName = dto.StudentName,
                registerNumber = dto.registerNumber,
                department = dto.department,
                Section = dto.Section,
                FromDate = dto.FromDate,
                ToDate = dto.ToDate,
                StartTime = dto.StartTime,
                EndTime = dto.EndTime,
                NumberOfDays = WorkingDaysCalendar.CountWorkingDays(dto.FromDate, dto.ToDate) is int wd && wd > 0 ? wd : dto.NumberOfDays,
                Event = dto.Event,
                CompetitionType = dto.CompetitionType,
                Reason = dto.Reason,
                CollegeIndustry = dto.CollegeIndustry,
                AppliedDate = DateTime.Now,
                FacultyStatus = "Pending",
                HodStatus = "Pending",
                IsGroupOd = dto.IsGroupOd,
                GroupName = dto.GroupName,
                RegisterNumbers = dto.RegisterNumbers
            };

            _context.OdApplies.Add(od);
            await _context.SaveChangesAsync();
            return od;
        }

        // Section-aware faculty decision. A group OD can include students
        // from multiple class sections (e.g. Section A + Section B) — each
        // section's staff can only decide on the members from THEIR OWN
        // section, and the OD's overall FacultyStatus only becomes
        // "Approved"/"Rejected" once every involved section has decided.
        // Throws InvalidOperationException if the given staff has no
        // students from their own section on this OD (nothing for them to
        // decide) — the controller turns this into a clear 400 response.
        public async Task<OdApply?> ApproveByStaffAsync(int odId, string status, int staffId)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            // Solo OD: single applicant, single decision — unchanged behavior.
            if (!od.IsGroupOd)
            {
                od.FacultyStatus = status;
                await _context.SaveChangesAsync();
                return od;
            }

            var staff = await _context.Staffs.FindAsync(staffId);
            var staffSection = (staff?.Section ?? "").Trim().ToLower();

            var allMembers = ParseList(od.RegisterNumbers);
            var memberRegsLower = allMembers.Select(r => r.ToLower()).ToList();

            var studentSections = memberRegsLower.Count == 0
                ? new Dictionary<string, string>()
                : await _context.Students
                    .Where(s => memberRegsLower.Contains(s.RegisterNumber.ToLower()))
                    .ToDictionaryAsync(s => s.RegisterNumber.ToLower(), s => (s.Section ?? "").Trim().ToLower());

            var myMembers = allMembers.Where(reg =>
                studentSections.TryGetValue(reg.ToLower(), out var sec) && sec == staffSection
            ).ToList();

            if (myMembers.Count == 0)
                throw new InvalidOperationException("You have no students from your own class section on this OD.");

            var approved = ParseList(od.FacultyApprovedRegisterNumbers);
            var rejected = ParseList(od.FacultyRejectedRegisterNumbers);

            foreach (var reg in myMembers)
            {
                approved.RemoveAll(r => r.Equals(reg, StringComparison.OrdinalIgnoreCase));
                rejected.RemoveAll(r => r.Equals(reg, StringComparison.OrdinalIgnoreCase));
                if (status == "Approved") approved.Add(reg);
                else rejected.Add(reg);
            }

            od.FacultyApprovedRegisterNumbers = JoinList(approved);
            od.FacultyRejectedRegisterNumbers = JoinList(rejected);

            var decidedCount = approved.Select(r => r.ToLower())
                .Union(rejected.Select(r => r.ToLower()))
                .Distinct()
                .Count();

            if (decidedCount >= allMembers.Count)
            {
                // Only if every single member across every section ended up
                // rejected does the whole OD get marked Rejected — otherwise
                // it proceeds to HOD with the rejected members flagged
                // individually (same as the existing single-section behavior).
                od.FacultyStatus = rejected.Count >= allMembers.Count ? "Rejected" : "Approved";
            }
            else
            {
                // Still waiting on at least one other section's staff to decide.
                od.FacultyStatus = "Pending";
            }

            await _context.SaveChangesAsync();
            return od;
        }

        public async Task<OdApply?> UpdateHodStatusAsync(int odId, string status)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;
            od.HodStatus = status;
            await _context.SaveChangesAsync();
            return od;
        }

        // Delete an OD application by ID

        public async Task<(bool success, string? error)> DeleteOdApplyAsync(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return (false, "OD not found.");

            // Students can only withdraw an OD while it is still pending —
            // once any staff (faculty) has acted on it, it can no longer be
            // cancelled from the student side.
            if (!string.Equals(od.FacultyStatus, "Pending", StringComparison.OrdinalIgnoreCase))
                return (false, "This OD has already been reviewed by staff and can no longer be cancelled.");

            _context.OdApplies.Remove(od);
            await _context.SaveChangesAsync();
            return (true, null);
        }

        // In OdApplyService.cs
        // In OdApplyService.cs
        public async Task UpdateCertificateAsync(OdApply od)
        {
            _context.OdApplies.Update(od);
            await _context.SaveChangesAsync();
        }

        // ── Per-member certificates (group OD safe) ──
        // Each (OdId, RegisterNumber) pair gets its own row, so one group
        // member uploading/replacing their certificate never touches another
        // member's certificate on the same OD.

        public async Task<OdCertificate> UploadMemberCertificateAsync(int odId, string registerNumber, string? winningStatus, string certUrl)
        {
            var reg = registerNumber.Trim();
            var existing = await _context.OdCertificates
                .FirstOrDefaultAsync(c => c.OdId == odId && c.RegisterNumber.ToLower() == reg.ToLower());

            if (existing != null)
            {
                existing.WinningStatus = winningStatus;
                existing.CertificatePhotoUrl = certUrl;
                existing.UploadedDate = DateTime.Now;
                await _context.SaveChangesAsync();
                return existing;
            }

            var cert = new OdCertificate
            {
                OdId = odId,
                RegisterNumber = reg,
                WinningStatus = winningStatus,
                CertificatePhotoUrl = certUrl
            };
            _context.OdCertificates.Add(cert);
            await _context.SaveChangesAsync();
            return cert;
        }

        public async Task<List<OdCertificate>> GetCertificatesForOdAsync(int odId)
        {
            return await _context.OdCertificates
                .Where(c => c.OdId == odId)
                .ToListAsync();
        }

        public async Task<OdCertificate?> VerifyMemberCertificateAsync(int odId, string registerNumber)
        {
            var reg = registerNumber.Trim();
            var cert = await _context.OdCertificates
                .FirstOrDefaultAsync(c => c.OdId == odId && c.RegisterNumber.ToLower() == reg.ToLower());
            if (cert == null) return null;

            cert.CertificateVerified = true;
            await _context.SaveChangesAsync();
            return cert;
        }

        // Bulk-attaches each OD's per-member certificates in one extra query
        // (instead of one query per OD), then maps to the response DTO.
        public async Task<List<OdWithCertificatesDto>> AttachCertificatesAsync(List<OdApply> ods)
        {
            var odIds = ods.Select(o => o.OdId).ToList();
            var allCerts = await _context.OdCertificates
                .Where(c => odIds.Contains(c.OdId))
                .ToListAsync();
            var certsByOd = allCerts.GroupBy(c => c.OdId).ToDictionary(g => g.Key, g => g.ToList());

            var studentIds = ods.Select(o => o.StudentId).Distinct().ToList();
            var studentYears = await _context.Students
                .Where(s => studentIds.Contains(s.StudentId))
                .ToDictionaryAsync(s => s.StudentId, s => s.Year);

            return ods.Select(od => new OdWithCertificatesDto
            {
                OdId = od.OdId,
                StudentId = od.StudentId,
                StudentName = od.StudentName,
                registerNumber = od.registerNumber,
                department = od.department,
                Section = od.Section,
                FromDate = od.FromDate,
                ToDate = od.ToDate,
                StartTime = od.StartTime,
                EndTime = od.EndTime,
                NumberOfDays = od.NumberOfDays,
                Event = od.Event,
                CompetitionType = od.CompetitionType,
                Reason = od.Reason,
                CollegeIndustry = od.CollegeIndustry,
                Year = studentYears.TryGetValue(od.StudentId, out var yr) ? yr : (int?)null,
                AppliedDate = od.AppliedDate,
                FacultyStatus = od.FacultyStatus,
                HodStatus = od.HodStatus,
                IsGroupOd = od.IsGroupOd,
                GroupName = od.GroupName,
                RegisterNumbers = od.RegisterNumbers,
                FacultyRejectedRegisterNumbers = od.FacultyRejectedRegisterNumbers,
                FacultyApprovedRegisterNumbers = od.FacultyApprovedRegisterNumbers,
                HodApprovedRegisterNumbers = od.HodApprovedRegisterNumbers,
                WinningStatus = od.WinningStatus,
                CertificatePhotoUrl = od.CertificatePhotoUrl,
                CertificateVerified = od.CertificateVerified,
                IsOngoing = IsOdOngoing(od.FromDate, od.ToDate),
                IsDateEdited = od.IsDateEdited,
                DateEditedBy = od.DateEditedBy,
                OriginalFromDate = od.OriginalFromDate,
                OriginalToDate = od.OriginalToDate,
                OriginalStartTime = od.OriginalStartTime,
                OriginalEndTime = od.OriginalEndTime,
                Certificates = certsByOd.TryGetValue(od.OdId, out var list) ? list : new List<OdCertificate>()
            }).ToList();
        }

        // True once today is on/after the OD's own FromDate — covers an OD
        // currently in progress AND one whose dates are already fully over.
        // Mirrors the same rule enforced in HodController/StaffController
        // when blocking approve/reject once the decision window has begun
        // or passed with no action taken.
        private static bool IsOdOngoing(string? fromDateRaw, string? toDateRaw)
        {
            if (!DateTime.TryParse(fromDateRaw, out var from))
                return false;
            var today = DateTime.Today;
            return today >= from.Date;
        }

        // ── Group member per-register-number status ──

        private static List<string> ParseList(string? csv) =>
            (csv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                       .Select(r => r.Trim())
                       .Where(r => r.Length > 0)
                       .ToList();

        private static string JoinList(List<string> list) => string.Join(",", list);

        // Confirms the given student's ACTUAL current Section (looked up from
        // the Students table) matches this staff's own Section — used to stop
        // a Section-B staff from rejecting/unrejecting a Section-A member on
        // a shared group OD, and vice versa.
        private async Task<bool> IsMemberInStaffSectionAsync(string registerNumber, int staffId)
        {
            var staff = await _context.Staffs.FindAsync(staffId);
            if (staff == null) return false;
            var staffSection = (staff.Section ?? "").Trim().ToLower();

            var student = await _context.Students
                .FirstOrDefaultAsync(s => s.RegisterNumber.ToLower() == registerNumber.ToLower());
            var studentSection = (student?.Section ?? "").Trim().ToLower();

            return studentSection == staffSection;
        }

        public async Task<OdApply?> RejectGroupMemberAsync(int odId, string registerNumber, int staffId)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            if (!await IsMemberInStaffSectionAsync(registerNumber, staffId))
                throw new InvalidOperationException("This student is not in your class section — only their own class staff can reject them.");

            var rejected = ParseList(od.FacultyRejectedRegisterNumbers);
            if (!rejected.Any(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase)))
                rejected.Add(registerNumber);
            od.FacultyRejectedRegisterNumbers = JoinList(rejected);

            // If HOD had previously overridden this member, clear that override
            // since faculty is now actively re-rejecting it
            var hodApproved = ParseList(od.HodApprovedRegisterNumbers);
            hodApproved.RemoveAll(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase));
            od.HodApprovedRegisterNumbers = JoinList(hodApproved);

            // Also clear any prior approval for this member — a re-reject
            // should always win over a stale approval from earlier.
            var approved = ParseList(od.FacultyApprovedRegisterNumbers);
            approved.RemoveAll(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase));
            od.FacultyApprovedRegisterNumbers = JoinList(approved);

            await _context.SaveChangesAsync();
            return od;
        }

        public async Task<OdApply?> UnrejectGroupMemberAsync(int odId, string registerNumber, int staffId)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            if (!await IsMemberInStaffSectionAsync(registerNumber, staffId))
                throw new InvalidOperationException("This student is not in your class section — only their own class staff can undo their rejection.");

            var rejected = ParseList(od.FacultyRejectedRegisterNumbers);
            rejected.RemoveAll(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase));
            od.FacultyRejectedRegisterNumbers = JoinList(rejected);

            await _context.SaveChangesAsync();
            return od;
        }

        public async Task<OdApply?> HodOverrideGroupMemberAsync(int odId, string registerNumber)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            var hodApproved = ParseList(od.HodApprovedRegisterNumbers);
            if (!hodApproved.Any(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase)))
                hodApproved.Add(registerNumber);
            od.HodApprovedRegisterNumbers = JoinList(hodApproved);

            await _context.SaveChangesAsync();
            return od;
        }


        public async Task<OdApply?> AlterDaysAsync(int odId, string fromDate, string toDate, int numberOfDays, string? startTime = null, string? endTime = null, string? editedBy = null)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            // Allow altering while not yet fully approved by HOD
            if (string.Equals(od.HodStatus, "Approved", StringComparison.OrdinalIgnoreCase))
                return null;

            // Recompute days server-side to stay consistent — count only
            // published college working days, not raw calendar days.
            int computedDays = WorkingDaysCalendar.CountWorkingDays(fromDate, toDate);
            if (computedDays <= 0)
                computedDays = numberOfDays;

            // Save original date & time on first alteration
            if (!od.IsDateEdited)
            {
                od.OriginalFromDate = od.FromDate;
                od.OriginalToDate = od.ToDate;
                od.OriginalStartTime = od.StartTime;
                od.OriginalEndTime = od.EndTime;
            }

            od.IsDateEdited = true;
            od.DateEditedBy = !string.IsNullOrWhiteSpace(editedBy) ? editedBy : (string.Equals(od.FacultyStatus, "Approved", StringComparison.OrdinalIgnoreCase) ? "HOD" : "Staff");

            od.FromDate = fromDate;
            od.ToDate = toDate;
            od.StartTime = startTime;
            od.EndTime = endTime;
            od.NumberOfDays = computedDays;

            await _context.SaveChangesAsync();
            return od;
        }

        // Student edits their own Group OD — only while nobody (faculty or
        // HOD) has made a decision on it yet.
        public async Task<(OdApply? od, string? error)> EditGroupOdAsync(int odId, EditGroupOdDto dto)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return (null, "OD not found.");

            // Approved applications cannot be edited (blocked once approved by either Faculty or HOD)
            if (string.Equals(od.FacultyStatus, "Approved", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(od.HodStatus, "Approved", StringComparison.OrdinalIgnoreCase))
            {
                return (null, "This OD has already been approved and cannot be edited.");
            }

            if (string.IsNullOrWhiteSpace(dto.FromDate) || string.IsNullOrWhiteSpace(dto.ToDate))
                return (null, "From Date and To Date are required.");

            var dateError = WorkingDaysCalendar.ValidateRange(dto.FromDate, dto.ToDate);
            if (dateError != null)
                return (null, dateError);

            List<string> memberList = new();
            if (od.IsGroupOd)
            {
                memberList = (dto.RegisterNumbers ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(r => r.ToUpperInvariant())
                    .Distinct()
                    .ToList();

                if (memberList.Count < 2)
                    return (null, "A Group OD needs at least 2 members.");

                var allStudents = await _context.Students.ToListAsync();
                var validRegNumbers = allStudents
                    .Select(s => s.RegisterNumber.ToUpper())
                    .ToList();
                var invalidMembers = memberList.Where(r => !validRegNumbers.Contains(r)).ToList();
                if (invalidMembers.Count > 0)
                    return (null, $"No user found for: {string.Join(", ", invalidMembers)}");

                var deactivated = allStudents
                    .FirstOrDefault(s => memberList.Contains(s.RegisterNumber.ToUpper()) && !s.IsActive);
                if (deactivated != null)
                    return (null, $"The student with register number {deactivated.RegisterNumber} has been deactivated by their class advisor and cannot be added to the Group OD.");
            }

            int computedDays = WorkingDaysCalendar.CountWorkingDays(dto.FromDate, dto.ToDate);
            if (computedDays <= 0)
                computedDays = dto.NumberOfDays;

            od.FromDate = dto.FromDate;
            od.ToDate = dto.ToDate;
            if (!string.IsNullOrWhiteSpace(dto.StartTime)) od.StartTime = dto.StartTime;
            if (!string.IsNullOrWhiteSpace(dto.EndTime)) od.EndTime = dto.EndTime;
            od.NumberOfDays = computedDays;
            if (!string.IsNullOrWhiteSpace(dto.Event)) od.Event = dto.Event;
            if (!string.IsNullOrWhiteSpace(dto.CompetitionType)) od.CompetitionType = dto.CompetitionType;
            if (!string.IsNullOrWhiteSpace(dto.Reason)) od.Reason = dto.Reason;
            if (!string.IsNullOrWhiteSpace(dto.CollegeIndustry)) od.CollegeIndustry = dto.CollegeIndustry;

            if (od.IsGroupOd)
            {
                if (!string.IsNullOrWhiteSpace(dto.GroupName)) od.GroupName = dto.GroupName;
                if (memberList.Count > 0) od.RegisterNumbers = string.Join(",", memberList);
            }

            // Reset status back to Pending when edited so staff & HOD can re-evaluate
            od.FacultyStatus = "Pending";
            od.HodStatus = "Pending";
            od.FacultyRejectedRegisterNumbers = null;
            od.HodApprovedRegisterNumbers = null;

            await _context.SaveChangesAsync();
            return (od, null);
        }

        // ── Analytics OD Student / Report Search ───────────────────────────────
        public async Task<List<OdReportSearchResultDto>> SearchOdReportsAsync(
            string? department = null,
            string? studentName = null,
            string? registerNumber = null,
            string? classYearSection = null,
            string? eventName = null,
            string? collegeName = null,
            string? odType = null,
            string? certification = null,
            string? startDate = null,
            string? endDate = null,
            int? year = null,
            string? section = null)
        {
            IQueryable<OdApply> query = _context.OdApplies.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(odType) && !odType.Equals("All", StringComparison.OrdinalIgnoreCase))
            {
                var isGroup = odType.Contains("group", StringComparison.OrdinalIgnoreCase);
                query = query.Where(o => o.IsGroupOd == isGroup);
            }

            if (!string.IsNullOrWhiteSpace(eventName))
            {
                var ev = eventName.Trim().ToLower();
                query = query.Where(o => o.Event != null && o.Event.ToLower().Contains(ev));
            }

            if (!string.IsNullOrWhiteSpace(collegeName))
            {
                var col = collegeName.Trim().ToLower();
                query = query.Where(o => o.CollegeIndustry != null && o.CollegeIndustry.ToLower().Contains(col));
            }

            if (!string.IsNullOrWhiteSpace(startDate))
            {
                var sDate = startDate.Trim();
                query = query.Where(o => (o.ToDate != null && string.Compare(o.ToDate, sDate) >= 0) || (o.FromDate != null && string.Compare(o.FromDate, sDate) >= 0));
            }

            if (!string.IsNullOrWhiteSpace(endDate))
            {
                var eDate = endDate.Trim();
                query = query.Where(o => (o.FromDate != null && string.Compare(o.FromDate, eDate) <= 0));
            }

            var candidateOds = await query.OrderByDescending(o => o.AppliedDate).ToListAsync();
            if (candidateOds.Count == 0)
                return new List<OdReportSearchResultDto>();

            // Fast student lookups
            var allStudents = await _context.Students.AsNoTracking().ToListAsync();
            var studentById = allStudents.ToDictionary(s => s.StudentId);
            var studentByReg = allStudents
                .GroupBy(s => (s.RegisterNumber ?? "").Trim().ToLower())
                .Where(g => !string.IsNullOrEmpty(g.Key))
                .ToDictionary(g => g.Key, g => g.First());

            // Fetch certificates for all candidate ODs
            var candidateOdIds = candidateOds.Select(o => o.OdId).ToList();
            var allOdCerts = await _context.OdCertificates.AsNoTracking()
                .Where(c => candidateOdIds.Contains(c.OdId))
                .ToListAsync();
            var certsByOd = allOdCerts.GroupBy(c => c.OdId).ToDictionary(g => g.Key, g => g.ToList());

            var targetDept = !string.IsNullOrWhiteSpace(department) ? department.Trim().ToLower() : null;
            var targetStudentName = !string.IsNullOrWhiteSpace(studentName) ? studentName.Trim().ToLower() : null;
            var targetRegNo = !string.IsNullOrWhiteSpace(registerNumber) ? registerNumber.Trim().ToLower() : null;
            var targetClassStr = !string.IsNullOrWhiteSpace(classYearSection) ? classYearSection.Trim().ToLower() : null;
            var targetCert = !string.IsNullOrWhiteSpace(certification) && !certification.Equals("All", StringComparison.OrdinalIgnoreCase)
                ? certification.Trim()
                : null;

            List<string> classTokens = new();
            if (!string.IsNullOrWhiteSpace(targetClassStr))
            {
                classTokens = targetClassStr
                    .Split(new[] { ' ', ',', '/', '-', '_' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList();
            }

            var results = new List<OdReportSearchResultDto>();

            foreach (var od in candidateOds)
            {
                studentById.TryGetValue(od.StudentId, out var applicant);
                if (applicant == null && !string.IsNullOrWhiteSpace(od.registerNumber))
                {
                    studentByReg.TryGetValue(od.registerNumber.Trim().ToLower(), out applicant);
                }

                var associatedStudents = new List<Student>();
                if (applicant != null) associatedStudents.Add(applicant);

                var memberRegs = ParseList(od.RegisterNumbers);
                foreach (var reg in memberRegs)
                {
                    if (studentByReg.TryGetValue(reg.ToLower(), out var memberStudent))
                    {
                        if (!associatedStudents.Any(s => s.StudentId == memberStudent.StudentId))
                            associatedStudents.Add(memberStudent);
                    }
                }

                // 1. Department Scope Filter
                if (targetDept != null)
                {
                    bool deptMatch = (od.department != null && od.department.Trim().ToLower().Contains(targetDept))
                        || associatedStudents.Any(s => (s.Department ?? "").Trim().ToLower().Contains(targetDept));

                    if (!deptMatch) continue;
                }

                // Explicit Year Filter (Staff automatic restriction)
                if (year.HasValue && year.Value > 0)
                {
                    bool yearMatch = (applicant != null && applicant.Year == year.Value)
                        || associatedStudents.Any(s => s.Year == year.Value);

                    if (!yearMatch) continue;
                }

                // Explicit Section Filter (Staff automatic restriction)
                if (!string.IsNullOrWhiteSpace(section))
                {
                    var targetSec = NormalizeSectionString(section);
                    bool sectionMatch = (applicant != null && NormalizeSectionString(applicant.Section) == targetSec)
                        || NormalizeSectionString(od.Section) == targetSec
                        || associatedStudents.Any(s => NormalizeSectionString(s.Section) == targetSec);

                    if (!sectionMatch) continue;
                }

                // 2. Student Name Filter
                if (targetStudentName != null)
                {
                    bool nameMatch = (od.StudentName != null && od.StudentName.ToLower().Contains(targetStudentName))
                        || associatedStudents.Any(s => (s.Name ?? "").ToLower().Contains(targetStudentName));

                    if (!nameMatch) continue;
                }

                // 3. Register Number Filter
                if (targetRegNo != null)
                {
                    bool regMatch = (od.registerNumber != null && od.registerNumber.ToLower().Contains(targetRegNo))
                        || (od.RegisterNumbers != null && od.RegisterNumbers.ToLower().Contains(targetRegNo))
                        || associatedStudents.Any(s => (s.RegisterNumber ?? "").ToLower().Contains(targetRegNo));

                    if (!regMatch) continue;
                }

                // 4. Class / Year / Section Filter
                if (classTokens.Count > 0)
                {
                    bool classMatch = false;
                    var candidateDescriptors = new List<(string Dept, int Year, string Section)>();

                    if (applicant != null)
                    {
                        candidateDescriptors.Add((applicant.Department ?? "", applicant.Year, applicant.Section ?? ""));
                    }
                    else
                    {
                        candidateDescriptors.Add((od.department ?? "", 0, od.Section ?? ""));
                    }

                    foreach (var m in associatedStudents)
                    {
                        if (applicant == null || m.StudentId != applicant.StudentId)
                        {
                            candidateDescriptors.Add((m.Department ?? "", m.Year, m.Section ?? ""));
                        }
                    }

                    foreach (var desc in candidateDescriptors)
                    {
                        var dDept = desc.Dept.ToLower();
                        var dSec = NormalizeSectionString(desc.Section);
                        var dYear = desc.Year;
                        var dYearStr = dYear > 0 ? dYear.ToString() : "";
                        var dYearRoman = dYear == 1 ? "i" : dYear == 2 ? "ii" : dYear == 3 ? "iii" : dYear == 4 ? "iv" : "";

                        bool allTokensMatch = true;
                        foreach (var token in classTokens)
                        {
                            var t = token.ToLower();
                            if (t == "year" || t == "sec" || t == "section" || t == "class" || t == "std" || t == "b.sc" || t == "bsc" || t == "b.e" || t == "be" || t == "b.tech")
                            {
                                continue;
                            }

                            bool tokenMatch = false;
                            if (t == dYearStr || t == $"{dYearStr}st" || t == $"{dYearStr}nd" || t == $"{dYearStr}rd" || t == $"{dYearStr}th" || (!string.IsNullOrEmpty(dYearRoman) && t == dYearRoman))
                            {
                                tokenMatch = true;
                            }
                            else if (t == dSec || NormalizeSectionString(t) == dSec)
                            {
                                tokenMatch = true;
                            }
                            else if (dDept.Contains(t) || t.Contains(dDept))
                            {
                                tokenMatch = true;
                            }

                            if (!tokenMatch)
                            {
                                allTokensMatch = false;
                                break;
                            }
                        }

                        if (allTokensMatch)
                        {
                            classMatch = true;
                            break;
                        }
                    }

                    if (!classMatch) continue;
                }

                // 5. Build Group Member Info & Certificate Data
                certsByOd.TryGetValue(od.OdId, out var odCerts);
                odCerts ??= new List<OdCertificate>();

                var memberInfoList = new List<GroupMemberInfoDto>();
                var applicantReg = (applicant?.RegisterNumber ?? od.registerNumber ?? "").Trim();
                var applicantCert = odCerts.FirstOrDefault(c => c.RegisterNumber.Equals(applicantReg, StringComparison.OrdinalIgnoreCase));

                string soloCertStatus = !string.IsNullOrWhiteSpace(applicantCert?.WinningStatus)
                    ? applicantCert.WinningStatus.Trim()
                    : (!string.IsNullOrWhiteSpace(od.WinningStatus) ? od.WinningStatus.Trim() : (applicantCert != null || !string.IsNullOrWhiteSpace(od.CertificatePhotoUrl) ? "Submitted" : "Not Submitted"));

                bool soloHasCert = (applicantCert != null && !string.IsNullOrWhiteSpace(applicantCert.CertificatePhotoUrl)) || !string.IsNullOrWhiteSpace(od.CertificatePhotoUrl);
                bool soloCertVerified = applicantCert?.CertificateVerified ?? false;

                if (od.IsGroupOd)
                {
                    var allGroupRegs = new List<string>();
                    if (!string.IsNullOrWhiteSpace(applicantReg))
                        allGroupRegs.Add(applicantReg);
                    foreach (var r in memberRegs)
                    {
                        if (!allGroupRegs.Any(x => x.Equals(r, StringComparison.OrdinalIgnoreCase)))
                            allGroupRegs.Add(r);
                    }

                    foreach (var r in allGroupRegs)
                    {
                        var mCert = odCerts.FirstOrDefault(c => c.RegisterNumber.Equals(r, StringComparison.OrdinalIgnoreCase));
                        string mCertStatus = !string.IsNullOrWhiteSpace(mCert?.WinningStatus)
                            ? mCert.WinningStatus.Trim()
                            : (r.Equals(applicantReg, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(od.WinningStatus) ? od.WinningStatus.Trim() : (mCert != null ? "Submitted" : "Not Submitted"));

                        bool mHasCert = (mCert != null && !string.IsNullOrWhiteSpace(mCert.CertificatePhotoUrl)) || (r.Equals(applicantReg, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(od.CertificatePhotoUrl));
                        bool mCertVerified = mCert?.CertificateVerified ?? false;

                        if (studentByReg.TryGetValue(r.ToLower(), out var sObj))
                        {
                            memberInfoList.Add(new GroupMemberInfoDto
                            {
                                StudentName = sObj.Name ?? "",
                                RegisterNumber = sObj.RegisterNumber ?? "",
                                Department = sObj.Department ?? "",
                                Year = sObj.Year,
                                Section = sObj.Section ?? "",
                                CertificationStatus = mCertStatus,
                                HasCertificate = mHasCert,
                                CertificateVerified = mCertVerified
                            });
                        }
                        else
                        {
                            memberInfoList.Add(new GroupMemberInfoDto
                            {
                                StudentName = r.Equals(od.registerNumber, StringComparison.OrdinalIgnoreCase) ? (od.StudentName ?? "") : "",
                                RegisterNumber = r,
                                Department = od.department ?? "",
                                Section = od.Section ?? "",
                                CertificationStatus = mCertStatus,
                                HasCertificate = mHasCert,
                                CertificateVerified = mCertVerified
                            });
                        }
                    }
                }

                // Determine primary / overall Certification Status for this OD
                string overallCertStatus = soloCertStatus;
                if (od.IsGroupOd && memberInfoList.Count > 0)
                {
                    var memberStatuses = memberInfoList
                        .Select(m => m.CertificationStatus)
                        .Where(s => !string.IsNullOrWhiteSpace(s) && !s.Equals("Not Submitted", StringComparison.OrdinalIgnoreCase))
                        .Distinct()
                        .ToList();

                    if (memberStatuses.Count > 0)
                    {
                        overallCertStatus = string.Join(", ", memberStatuses);
                    }
                }

                // 6. Certification Filter Check
                if (targetCert != null)
                {
                    bool certMatch = MatchesCertification(overallCertStatus, targetCert)
                        || MatchesCertification(soloCertStatus, targetCert)
                        || memberInfoList.Any(m => MatchesCertification(m.CertificationStatus, targetCert));

                    if (!certMatch) continue;
                }

                // Determine overall status
                string overallStatus = "Pending";
                if (string.Equals(od.HodStatus, "Approved", StringComparison.OrdinalIgnoreCase))
                {
                    overallStatus = "Approved";
                }
                else if (string.Equals(od.HodStatus, "Rejected", StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(od.FacultyStatus, "Rejected", StringComparison.OrdinalIgnoreCase))
                {
                    overallStatus = "Rejected";
                }
                else if (string.Equals(od.FacultyStatus, "Approved", StringComparison.OrdinalIgnoreCase))
                {
                    overallStatus = "Faculty Approved";
                }

                results.Add(new OdReportSearchResultDto
                {
                    OdId = od.OdId,
                    StudentId = od.StudentId,
                    StudentName = applicant?.Name ?? od.StudentName ?? "",
                    RegisterNumber = applicant?.RegisterNumber ?? od.registerNumber ?? "",
                    ClassName = applicant?.Department ?? od.department ?? "",
                    Year = applicant?.Year,
                    Section = applicant?.Section ?? od.Section ?? "",
                    EventName = od.Event ?? "",
                    CollegeName = od.CollegeIndustry ?? "",
                    OdType = od.IsGroupOd ? "Group OD" : "Solo OD",
                    IsGroupOd = od.IsGroupOd,
                    GroupName = od.GroupName,
                    RegisterNumbers = od.RegisterNumbers,
                    Members = memberInfoList,
                    FromDate = od.FromDate ?? "",
                    ToDate = od.ToDate ?? "",
                    StartTime = od.StartTime,
                    EndTime = od.EndTime,
                    NumberOfDays = od.NumberOfDays,
                    AppliedDate = od.AppliedDate,
                    FacultyStatus = od.FacultyStatus,
                    HodStatus = od.HodStatus,
                    OverallStatus = overallStatus,
                    Reason = od.Reason,
                    CompetitionType = od.CompetitionType,
                    CertificationStatus = overallCertStatus,
                    HasCertificate = soloHasCert || memberInfoList.Any(m => m.HasCertificate),
                    CertificateVerified = soloCertVerified || memberInfoList.Any(m => m.CertificateVerified)
                });
            }

            return results;
        }

        private static bool MatchesCertification(string? status, string targetCert)
        {
            if (string.IsNullOrWhiteSpace(status) || status.Equals("Not Submitted", StringComparison.OrdinalIgnoreCase))
                return false;

            var s = status.Trim().ToLowerInvariant();
            var t = targetCert.Trim().ToLowerInvariant();

            if (t.Contains("1st") || t.Contains("first"))
                return s.Contains("1st") || s.Contains("first");
            if (t.Contains("2nd") || t.Contains("second"))
                return s.Contains("2nd") || s.Contains("second");
            if (t.Contains("3rd") || t.Contains("third"))
                return s.Contains("3rd") || s.Contains("third");
            if (t.Contains("participat"))
                return s.Contains("participat");
            if (t.Equals("other", StringComparison.OrdinalIgnoreCase))
                return !s.Contains("1st") && !s.Contains("first") && !s.Contains("2nd") && !s.Contains("second") && !s.Contains("3rd") && !s.Contains("third") && !s.Contains("participat") && !s.Equals("not submitted", StringComparison.OrdinalIgnoreCase);

            return s.Contains(t);
        }

        // ── Real Excel (.xlsx) Export ─────────────────────────────────────────
        public async Task<byte[]> GenerateOdReportExcelAsync(
            string? department = null,
            string? studentName = null,
            string? registerNumber = null,
            string? classYearSection = null,
            string? eventName = null,
            string? collegeName = null,
            string? odType = null,
            string? certification = null,
            string? startDate = null,
            string? endDate = null,
            int? year = null,
            string? section = null)
        {
            var data = await SearchOdReportsAsync(department, studentName, registerNumber, classYearSection, eventName, collegeName, odType, certification, startDate, endDate, year, section);

            using var workbook = new ClosedXML.Excel.XLWorkbook();
            var ws = workbook.Worksheets.Add("OD Report");

            // 1. Institution Letterhead Banner
            ws.Range("A1:T1").Merge();
            var titleCell = ws.Cell("A1");
            titleCell.Value = "NANDHA ARTS AND SCIENCE COLLEGE (AUTONOMOUS)";
            titleCell.Style.Font.Bold = true;
            titleCell.Style.Font.FontSize = 14;
            titleCell.Style.Font.FontColor = ClosedXML.Excel.XLColor.White;
            titleCell.Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#107C41"); // Excel Green
            titleCell.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            titleCell.Style.Alignment.Vertical = ClosedXML.Excel.XLAlignmentVerticalValues.Center;
            ws.Row(1).Height = 28;

            ws.Range("A2:T2").Merge();
            var subTitleCell = ws.Cell("A2");
            subTitleCell.Value = "ON DUTY (OD) STUDENT PARTICIPATION & STATUS REPORT";
            subTitleCell.Style.Font.Bold = true;
            subTitleCell.Style.Font.FontSize = 11;
            subTitleCell.Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#0F172A");
            subTitleCell.Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#E8F5E9");
            subTitleCell.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            subTitleCell.Style.Alignment.Vertical = ClosedXML.Excel.XLAlignmentVerticalValues.Center;
            ws.Row(2).Height = 22;

            // 2. Metadata / Filter Summary
            ws.Range("A3:T3").Merge();
            var metaCell = ws.Cell("A3");
            var filterParts = new List<string>();
            filterParts.Add($"Department: {department ?? "All"}");
            if (year.HasValue && year.Value > 0) filterParts.Add($"Year: {year.Value}");
            if (!string.IsNullOrWhiteSpace(section)) filterParts.Add($"Section: {section.Trim().ToUpperInvariant()}");
            if (!string.IsNullOrWhiteSpace(studentName)) filterParts.Add($"Student: {studentName}");
            if (!string.IsNullOrWhiteSpace(registerNumber)) filterParts.Add($"Reg No: {registerNumber}");
            if (!string.IsNullOrWhiteSpace(classYearSection)) filterParts.Add($"Class: {classYearSection}");
            if (!string.IsNullOrWhiteSpace(eventName)) filterParts.Add($"Event: {eventName}");
            if (!string.IsNullOrWhiteSpace(collegeName)) filterParts.Add($"College: {collegeName}");
            if (!string.IsNullOrWhiteSpace(odType) && !odType.Equals("All", StringComparison.OrdinalIgnoreCase)) filterParts.Add($"OD Type: {odType}");
            if (!string.IsNullOrWhiteSpace(certification) && !certification.Equals("All", StringComparison.OrdinalIgnoreCase)) filterParts.Add($"Certification: {certification}");
            if (!string.IsNullOrWhiteSpace(startDate) || !string.IsNullOrWhiteSpace(endDate)) filterParts.Add($"Date: {startDate ?? "Start"} to {endDate ?? "End"}");
            filterParts.Add($"Total Records: {data.Count}");
            filterParts.Add($"Generated: {DateTime.Now:yyyy-MM-dd HH:mm}");

            metaCell.Value = string.Join("  |  ", filterParts);
            metaCell.Style.Font.FontSize = 9.5;
            metaCell.Style.Font.Italic = true;
            metaCell.Style.Font.FontColor = ClosedXML.Excel.XLColor.FromHtml("#475569");
            metaCell.Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#F1F5F9");
            metaCell.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            metaCell.Style.Alignment.Vertical = ClosedXML.Excel.XLAlignmentVerticalValues.Center;
            ws.Row(3).Height = 20;

            ws.Row(4).Height = 8; // Spacer

            // 3. Table Headers (Row 5)
            string[] headers = new[]
            {
                "#", "Student Name", "Register No", "Department / Class", "Year", "Section",
                "Event Name", "Competition Type", "College / Industry", "OD Type", "Group Name / Members",
                "From Date", "To Date", "Time", "Days", "Applied Date",
                "Staff Status", "HOD Status", "Overall Status", "Certification Status"
            };

            for (int c = 0; c < headers.Length; c++)
            {
                var cell = ws.Cell(5, c + 1);
                cell.Value = headers[c];
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontSize = 10;
                cell.Style.Font.FontColor = ClosedXML.Excel.XLColor.White;
                cell.Style.Fill.BackgroundColor = ClosedXML.Excel.XLColor.FromHtml("#107C41");
                cell.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
                cell.Style.Alignment.Vertical = ClosedXML.Excel.XLAlignmentVerticalValues.Center;
                cell.Style.Border.OutsideBorder = ClosedXML.Excel.XLBorderStyleValues.Thin;
                cell.Style.Border.OutsideBorderColor = ClosedXML.Excel.XLColor.FromHtml("#0B5C30");
            }
            ws.Row(5).Height = 26;

            // 4. Data Rows
            int currentRow = 6;
            for (int i = 0; i < data.Count; i++)
            {
                var item = data[i];
                var isEven = (i % 2 == 1);
                var rowBg = isEven ? ClosedXML.Excel.XLColor.FromHtml("#F8FAFC") : ClosedXML.Excel.XLColor.White;

                string timeSpan = !string.IsNullOrWhiteSpace(item.StartTime)
                    ? $"{item.StartTime}{(!string.IsNullOrWhiteSpace(item.EndTime) ? " - " + item.EndTime : "")}"
                    : "Full Day";

                string membersSummary = "";
                if (item.IsGroupOd && item.Members.Count > 0)
                {
                    membersSummary = $"{item.GroupName ?? "Group"} ({item.Members.Count} members: {string.Join(", ", item.Members.Select(m => $"{m.RegisterNumber} - {m.StudentName}"))})";
                }

                ws.Cell(currentRow, 1).Value = i + 1;
                ws.Cell(currentRow, 2).Value = item.StudentName;
                ws.Cell(currentRow, 3).Value = item.RegisterNumber;
                ws.Cell(currentRow, 4).Value = item.ClassName;
                ws.Cell(currentRow, 5).Value = item.Year?.ToString() ?? "-";
                ws.Cell(currentRow, 6).Value = item.Section;
                ws.Cell(currentRow, 7).Value = item.EventName;
                ws.Cell(currentRow, 8).Value = item.CompetitionType ?? "-";
                ws.Cell(currentRow, 9).Value = item.CollegeName;
                ws.Cell(currentRow, 10).Value = item.OdType;
                ws.Cell(currentRow, 11).Value = membersSummary;
                ws.Cell(currentRow, 12).Value = item.FromDate;
                ws.Cell(currentRow, 13).Value = item.ToDate;
                ws.Cell(currentRow, 14).Value = timeSpan;
                ws.Cell(currentRow, 15).Value = item.NumberOfDays;
                ws.Cell(currentRow, 16).Value = item.AppliedDate.ToString("yyyy-MM-dd HH:mm");
                ws.Cell(currentRow, 17).Value = item.FacultyStatus;
                ws.Cell(currentRow, 18).Value = item.HodStatus;
                ws.Cell(currentRow, 19).Value = item.OverallStatus;
                ws.Cell(currentRow, 20).Value = item.CertificationStatus;

                // Center align specific columns
                int[] centerCols = new[] { 1, 3, 5, 6, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20 };
                foreach (var colIdx in centerCols)
                {
                    ws.Cell(currentRow, colIdx).Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
                }

                for (int c = 1; c <= 20; c++)
                {
                    var cell = ws.Cell(currentRow, c);
                    cell.Style.Fill.BackgroundColor = rowBg;
                    cell.Style.Font.FontSize = 9.5;
                    cell.Style.Border.OutsideBorder = ClosedXML.Excel.XLBorderStyleValues.Thin;
                    cell.Style.Border.OutsideBorderColor = ClosedXML.Excel.XLColor.FromHtml("#E2E8F0");
                    cell.Style.Alignment.Vertical = ClosedXML.Excel.XLAlignmentVerticalValues.Center;
                }

                ws.Row(currentRow).Height = 22;
                currentRow++;
            }

            // Freeze header row
            ws.SheetView.FreezeRows(5);

            // Set AutoFilter if data present
            if (data.Count > 0)
            {
                ws.Range(5, 1, currentRow - 1, 20).SetAutoFilter();
            }

            // Adjust Column Widths
            ws.Columns(1, 20).AdjustToContents();
            foreach (var col in ws.Columns(1, 20))
            {
                if (col.Width < 12) col.Width = 12;
                if (col.Width > 45) col.Width = 45;
            }

            // Signature block at bottom
            int sigRow = currentRow + 3;
            ws.Range(sigRow, 2, sigRow, 4).Merge();
            var sig1 = ws.Cell(sigRow, 2);
            sig1.Value = "Class In-Charge / Staff Advisor";
            sig1.Style.Font.Bold = true;
            sig1.Style.Font.FontSize = 10;
            sig1.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            sig1.Style.Border.TopBorder = ClosedXML.Excel.XLBorderStyleValues.Dashed;

            ws.Range(sigRow, 9, sigRow, 11).Merge();
            var sig2 = ws.Cell(sigRow, 9);
            sig2.Value = "Head of Department (HOD)";
            sig2.Style.Font.Bold = true;
            sig2.Style.Font.FontSize = 10;
            sig2.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            sig2.Style.Border.TopBorder = ClosedXML.Excel.XLBorderStyleValues.Dashed;

            ws.Range(sigRow, 16, sigRow, 18).Merge();
            var sig3 = ws.Cell(sigRow, 16);
            sig3.Value = "Principal / Authority";
            sig3.Style.Font.Bold = true;
            sig3.Style.Font.FontSize = 10;
            sig3.Style.Alignment.Horizontal = ClosedXML.Excel.XLAlignmentHorizontalValues.Center;
            sig3.Style.Border.TopBorder = ClosedXML.Excel.XLBorderStyleValues.Dashed;

            using var ms = new MemoryStream();
            workbook.SaveAs(ms);
            return ms.ToArray();
        }

        private static string NormalizeSectionString(string? sec)
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