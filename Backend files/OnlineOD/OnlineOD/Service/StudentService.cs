using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Dtos;
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
            existing.Section = student.Section;
            existing.Year = student.Year;
            existing.DOB = student.DOB;
            existing.semester = student.semester;
            if (!string.IsNullOrWhiteSpace(student.Password)) existing.Password = student.Password;
            existing.Email = student.Email;
            existing.IsActive = student.IsActive;

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

        // Look up a student by register number only (used to validate group
        // members before they're added to a Group OD — no password needed).
        public async Task<Student> GetByRegisterNumberAsync(string registerNumber)
        {
            if (string.IsNullOrWhiteSpace(registerNumber)) return null;
            return await _context.Students
                .FirstOrDefaultAsync(s => s.RegisterNumber == registerNumber);
        }

        // Get students filtered by department and section (for Staff 'My Students' view)
        public async Task<List<Student>> GetStudentsBySectionAsync(string department, string? section)
        {
            var dept = (department ?? "").Trim().ToLower();
            var sec = (section ?? "").Trim().ToLower();

            var query = _context.Students.AsQueryable();

            if (!string.IsNullOrEmpty(dept))
            {
                query = query.Where(s => (s.Department ?? "").Trim().ToLower() == dept);
            }

            if (!string.IsNullOrEmpty(sec))
            {
                query = query.Where(s => (s.Section ?? "").Trim().ToLower() == sec);
            }

            return await query.OrderBy(s => s.RegisterNumber).ToListAsync();
        }

        // Toggle student active/deactive status with strict Staff Section authorization
        public async Task<Student?> ToggleStudentStatusAsync(int studentId, int staffId)
        {
            var staff = await _context.Staffs.FindAsync(staffId);
            if (staff == null)
                throw new UnauthorizedAccessException("Staff member not found.");

            var student = await _context.Students.FindAsync(studentId);
            if (student == null)
                return null;

            var staffDept = (staff.Department ?? "").Trim().ToLower();
            var studentDept = (student.Department ?? "").Trim().ToLower();
            var staffSec = (staff.Section ?? "").Trim().ToLower();
            var studentSec = (student.Section ?? "").Trim().ToLower();

            if (staffDept != studentDept || (!string.IsNullOrEmpty(staffSec) && staffSec != studentSec))
            {
                throw new UnauthorizedAccessException("You are only authorized to activate or deactivate students in your assigned class section.");
            }

            student.IsActive = !student.IsActive;
            await _context.SaveChangesAsync();
            return student;
        }

        // Get all students (or filtered by department/section) with calculated OD counts (Total, Approved, Rejected)
        public async Task<List<StudentOdHistoryDto>> GetStudentsOdHistoryAsync(string? department = null, string? section = null)
        {
            var query = _context.Students.AsQueryable();
            var dept = (department ?? "").Trim().ToLower();
            var sec = (section ?? "").Trim().ToLower();

            if (!string.IsNullOrEmpty(dept))
            {
                query = query.Where(s => (s.Department ?? "").Trim().ToLower() == dept);
            }

            if (!string.IsNullOrEmpty(sec))
            {
                query = query.Where(s => (s.Section ?? "").Trim().ToLower() == sec);
            }

            var students = await query.OrderBy(s => s.RegisterNumber).ToListAsync();
            var allOds = await _context.OdApplies.ToListAsync();

            var result = new List<StudentOdHistoryDto>();

            foreach (var s in students)
            {
                var reg = (s.RegisterNumber ?? "").Trim().ToLower();

                // Find all ODs where this student is the primary applicant or a group member
                var matchingOds = allOds.Where(o =>
                {
                    if (o.StudentId == s.StudentId) return true;
                    if (!string.IsNullOrWhiteSpace(o.registerNumber) && o.registerNumber.Trim().ToLower() == reg) return true;
                    if (o.IsGroupOd && !string.IsNullOrWhiteSpace(o.RegisterNumbers))
                    {
                        var members = o.RegisterNumbers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                        return members.Any(m => m.ToLower() == reg);
                    }
                    return false;
                }).ToList();

                int totalCount = matchingOds.Count;
                int approvedCount = 0;
                int rejectedCount = 0;

                foreach (var od in matchingOds)
                {
                    bool isIndividualRejected = false;
                    bool isIndividualOverridden = false;

                    if (od.IsGroupOd)
                    {
                        var rejectedList = (od.FacultyRejectedRegisterNumbers ?? "")
                            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                            .Select(r => r.ToLower()).ToList();
                        var overriddenList = (od.HodApprovedRegisterNumbers ?? "")
                            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                            .Select(r => r.ToLower()).ToList();

                        isIndividualRejected = rejectedList.Contains(reg);
                        isIndividualOverridden = overriddenList.Contains(reg);
                    }

                    if (od.HodStatus == "Approved")
                    {
                        if (isIndividualRejected && !isIndividualOverridden)
                        {
                            rejectedCount++;
                        }
                        else
                        {
                            approvedCount++;
                        }
                    }
                    else if (od.HodStatus == "Rejected" || od.FacultyStatus == "Rejected")
                    {
                        rejectedCount++;
                    }
                    else if (isIndividualRejected && !isIndividualOverridden)
                    {
                        rejectedCount++;
                    }
                }

                result.Add(new StudentOdHistoryDto
                {
                    StudentId = s.StudentId,
                    StudentName = s.Name,
                    RegisterNumber = s.RegisterNumber,
                    Class = s.Department,
                    Department = s.Department,
                    Section = s.Section,
                    Year = s.Year,
                    TotalOdCount = totalCount,
                    ApprovedCount = approvedCount,
                    RejectedCount = rejectedCount
                });
            }

            return result;
        }
    }
}