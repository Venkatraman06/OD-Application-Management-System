using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IHodService
    {
        Task<List<Hod>> GetAllHodAsync();
        Task<Hod> GetHodByIdAsync(int id);
        Task<Hod> AddHodAsync(Hod hod);
        Task<Hod> UpdateHodAsync(Hod hod);
        Task<bool> DeleteHodAsync(int id);
        Task<Hod> LoginAsync(string username, string password);
    }
}