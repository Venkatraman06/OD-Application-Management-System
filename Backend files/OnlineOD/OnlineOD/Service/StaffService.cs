using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class StaffService : IStaffService
    {
        public readonly ApplicationDbContext _context;

        public StaffService(ApplicationDbContext context)
        {
            _context = context;
        }

        // this will get all the staff details from my database
        public async Task<List<Staff>> GetAllStaffAsync()
        {
            return await _context.Staffs.ToListAsync();
        }

        // this will get the staff details by id from my database
        public async Task<Staff> GetStaffByIdAsync(int id)
        {
            return await _context.Staffs.FindAsync(id);
        }

        // this will add the staff details to my database

        public async Task<Staff> AddStaffAsync(Staff staff)
        {
            _context.Staffs.Add(staff);
            await _context.SaveChangesAsync();
            return staff;
        }

        // this will update the staff details in my database
        public async Task<Staff> UpdateStaffAsync(Staff staff)
        {
            var existing = await _context.Staffs.FindAsync(staff.StaffId);
            if (existing == null) return null;

            existing.Name = staff.Name;
            existing.Department = staff.Department;
            existing.Password = staff.Password;

            await _context.SaveChangesAsync();
            return existing;
        }

        // this will delete the staff details from my database
        public async Task<bool> DeleteStaffAsync(int id)
        {
            var staff = await _context.Staffs.FindAsync(id);
            if (staff == null) return false;

            _context.Staffs.Remove(staff);
            await _context.SaveChangesAsync();
            return true;
        }

        // this will check the staff details in my database for login
        public async Task<Staff> LoginAsync(string username, string password)
        {
            return await _context.Staffs
                .FirstOrDefaultAsync(s =>
                    s.Name == username &&
                    s.Password == password);
        }
       
    }
}