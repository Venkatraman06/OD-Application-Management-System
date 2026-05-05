using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IStaffService
    {
        Task<List<Staff>> GetAllStaffAsync();
        Task<Staff> GetStaffByIdAsync(int id);
        Task<Staff> AddStaffAsync(Staff staff);
        Task<Staff> UpdateStaffAsync(Staff staff);
        Task<bool> DeleteStaffAsync(int id);
        Task<Staff> LoginAsync(string username, string password);
        //Task LoginAsync(object username, object password);
        //Task LoginAsync(string username, object password);
    }
}