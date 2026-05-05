using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class StudentService : IStudentService
    {
        private readonly ApplicationDbContext _context;

        public StudentService(ApplicationDbContext context)
        {
            _context = context;
        }

        // get all students

        public async Task<List<Student>> GetAllStudentsAsync()
        {
            return await _context.Students.ToListAsync();
        }

        // Get student by ID
        public async Task<Student> GetStudentByIdAsync(int id)
        {
            return await _context.Students.FindAsync(id);
        }

        // Add new student
        public async Task<Student> AddStudentAsync(Student student)
        {
            _context.Students.Add(student);
            await _context.SaveChangesAsync();
            return student;
        }

        // Update existing student
        public async Task<Student> UpdateStudentAsync(Student student)
        {
            var existing = await _context.Students.FindAsync(student.StudentId);
            if (existing == null) return null;

            existing.Name = student.Name;
            existing.RegisterNumber = student.RegisterNumber;
            existing.Department = student.Department;
            existing.Year = student.Year;
            existing.DOB = student.DOB;
            existing.semester = student.semester;
            existing.Password = student.Password;

            await _context.SaveChangesAsync();
            return existing;
        }

        // Delete student by ID
        public async Task<bool> DeleteStudentAsync(int id)
        {
            var student = await _context.Students.FindAsync(id);
            if (student == null) return false;

            _context.Students.Remove(student);
            await _context.SaveChangesAsync();
            return true;
        }

        // Student login
        public async Task<Student> LoginAsync(string registerNumber, string password)
        {
            return await _context.Students
                .FirstOrDefaultAsync(s =>
                    s.RegisterNumber == registerNumber &&
                    s.Password == password);
        }
    }
}