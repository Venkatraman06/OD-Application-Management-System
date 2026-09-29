using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IJwtTokenService
    {
        string GenerateToken(int userId, string username, string role, string? department = null, string? section = null, int? year = null, string? email = null, string? adminId = null);
        string GenerateStudentToken(Student student);
        string GenerateStaffToken(Staff staff);
        string GenerateHodToken(Hod hod);
        string GenerateAdminToken(Admin admin);
    }
}
