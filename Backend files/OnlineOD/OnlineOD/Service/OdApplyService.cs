using OnlineOD.Data;
using OnlineOD.Models;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Dtos;

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
        public async Task<List<OdApply>> GetByDepartmentAsync(string department, string? section = null)
        {
            var query = _context.OdApplies.Where(o => o.department == department);

            // When a section is provided, only return ODs from students in that
            // exact class section — this is what routes a request to only the
            // matching class teacher instead of every staff member in the dept.
            if (!string.IsNullOrWhiteSpace(section))
            {
                var target = section.Trim().ToLower();
                query = query.Where(o => o.Section != null && o.Section.Trim().ToLower() == target);
            }

            return await query
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
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
                NumberOfDays = dto.NumberOfDays,
                Event = dto.Event,
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

        // Update faculty status of an OD application
        public async Task<OdApply?> UpdateFacultyStatusAsync(int odId, string status)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;
            od.FacultyStatus = status;
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

        public async Task<bool> DeleteOdApplyAsync(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return false;

            _context.OdApplies.Remove(od);
            await _context.SaveChangesAsync();
            return true;
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
                HodApprovedRegisterNumbers = od.HodApprovedRegisterNumbers,
                WinningStatus = od.WinningStatus,
                CertificatePhotoUrl = od.CertificatePhotoUrl,
                CertificateVerified = od.CertificateVerified,
                Certificates = certsByOd.TryGetValue(od.OdId, out var list) ? list : new List<OdCertificate>()
            }).ToList();
        }

        // ── Group member per-register-number status ──

        private static List<string> ParseList(string? csv) =>
            (csv ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                       .Select(r => r.Trim())
                       .Where(r => r.Length > 0)
                       .ToList();

        private static string JoinList(List<string> list) => string.Join(",", list);

        public async Task<OdApply?> RejectGroupMemberAsync(int odId, string registerNumber)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

            var rejected = ParseList(od.FacultyRejectedRegisterNumbers);
            if (!rejected.Any(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase)))
                rejected.Add(registerNumber);
            od.FacultyRejectedRegisterNumbers = JoinList(rejected);

            // If HOD had previously overridden this member, clear that override
            // since faculty is now actively re-rejecting it
            var hodApproved = ParseList(od.HodApprovedRegisterNumbers);
            hodApproved.RemoveAll(r => r.Equals(registerNumber, StringComparison.OrdinalIgnoreCase));
            od.HodApprovedRegisterNumbers = JoinList(hodApproved);

            await _context.SaveChangesAsync();
            return od;
        }

        public async Task<OdApply?> UnrejectGroupMemberAsync(int odId, string registerNumber)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;

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
    }
}