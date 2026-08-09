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
        Task<OdApply?> UpdateFacultyStatusAsync(int odId, string status);
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