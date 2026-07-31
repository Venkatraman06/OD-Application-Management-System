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
        Task<List<OdApply>> GetByDepartmentAsync(string department);
        Task<List<OdApply>> GetApprovedByFacultyAsync(string department);
        Task<OdApply?> UpdateFacultyStatusAsync(int odId, string status);
        Task<OdApply?> UpdateHodStatusAsync(int odId, string status);
        Task UpdateCertificateAsync(OdApply od);
        Task<OdApply?> RejectGroupMemberAsync(int odId, string registerNumber);
        Task<OdApply?> UnrejectGroupMemberAsync(int odId, string registerNumber);
        Task<OdApply?> HodOverrideGroupMemberAsync(int odId, string registerNumber);
    }
}