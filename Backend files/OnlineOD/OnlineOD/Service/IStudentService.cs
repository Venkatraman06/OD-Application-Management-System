using OnlineOD.Dtos;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public interface IStudentService
    {
        Task<List<Student>> GetAllStudentsAsync();
        Task<Student> GetStudentByIdAsync(int id);
        Task<Student> AddStudentAsync(Student student);
        Task<Student> UpdateStudentAsync(Student student);
        Task<bool> DeleteStudentAsync(int id);
        Task<Student> LoginAsync(string registerNumber, string password);
        Task<Student> GetByRegisterNumberAsync(string registerNumber);
        Task<List<Student>> GetStudentsBySectionAsync(string department, string? section);
        Task<Student?> ToggleStudentStatusAsync(int studentId, int staffId);
        Task<List<StudentOdHistoryDto>> GetStudentsOdHistoryAsync(string? department = null, string? section = null);
    }
}