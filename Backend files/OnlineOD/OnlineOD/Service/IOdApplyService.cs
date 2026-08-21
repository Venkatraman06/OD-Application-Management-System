using OnlineOD.Dtos;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IOdApplyService
    {
        Task<List<OdApply>> GetAllOdApplyAsync();
        Task<OdApply?> GetOdApplyByIdAsync(int id);
        Task<OdApply> CreateOdApplyAsync(OdApplyDto dto);
        Task<bool> DeleteOdApplyAsync(int id);
        Task<List<OdApply>> GetByStudentIdAsync(int studentId);
        Task<List<OdApply>> GetByDepartmentAsync(string department, string? section = null);
        Task<List<OdApply>> GetApprovedByFacultyAsync(string department);

        // Returns the distinct class sections actually involved in this OD —
        // for a group OD, this looks up each member's REAL current Section
        // from the Students table (not just the applicant's own Section),
        // since a group can span multiple sections.
        Task<List<string>> GetInvolvedSectionsAsync(OdApply od);

        // Section-aware faculty decision. A group OD can span multiple class
        // sections (e.g. Section A + Section B students in one group) — this
        // makes sure a staff member can only decide on the members from their
        // OWN section, and the overall FacultyStatus only becomes "Approved"
        // once every section involved has made its decision.
        Task<OdApply?> ApproveByStaffAsync(int odId, string status, int staffId);

        Task<OdApply?> UpdateHodStatusAsync(int odId, string status);
        Task UpdateCertificateAsync(OdApply od);

        // ── Per-member certificates (group OD safe — each register number gets its own row) ──
        Task<OdCertificate> UploadMemberCertificateAsync(int odId, string registerNumber, string? winningStatus, string certUrl);
        Task<List<OdCertificate>> GetCertificatesForOdAsync(int odId);
        Task<OdCertificate?> VerifyMemberCertificateAsync(int odId, string registerNumber);
        Task<List<OdWithCertificatesDto>> AttachCertificatesAsync(List<OdApply> ods);

        Task<OdApply?> RejectGroupMemberAsync(int odId, string registerNumber);
        Task<OdApply?> UnrejectGroupMemberAsync(int odId, string registerNumber);
        Task<OdApply?> HodOverrideGroupMemberAsync(int odId, string registerNumber);
    }
}