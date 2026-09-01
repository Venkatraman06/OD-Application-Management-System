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
            var od = new OdApply
            {
                StudentId = dto.StudentId,
                StudentName = dto.StudentName,
                registerNumber = dto.registerNumber,
                department = dto.department,
                Section = dto.Section,
                FromDate = dto.FromDate,
                ToDate = dto.ToDate,
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
                NumberOfDays = od.NumberOfDays,
                Event = od.Event,
                Reason = od.Reason,
                CollegeIndustry = od.CollegeIndustry,
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


        public async Task<OdApply?> AlterDaysAsync(int odId, string fromDate, string toDate, int numberOfDays)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            // Only allow altering while the OD is still Pending with faculty
            if (!string.Equals(od.FacultyStatus, "Pending", StringComparison.OrdinalIgnoreCase))
                return null;

            // Recompute days server-side to stay consistent — count only
            // published college working days, not raw calendar days.
            int computedDays = WorkingDaysCalendar.CountWorkingDays(fromDate, toDate);
            if (computedDays <= 0)
                computedDays = numberOfDays;

            od.FromDate = fromDate;
            od.ToDate = toDate;
            od.NumberOfDays = computedDays;

            await _context.SaveChangesAsync();
            return od;
        }
    }
}