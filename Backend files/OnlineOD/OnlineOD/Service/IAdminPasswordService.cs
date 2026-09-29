using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IAdminPasswordService
    {
        string HashPassword(Admin admin, string password);
        bool VerifyPassword(Admin admin, string hashedPassword, string providedPassword);
    }
}
