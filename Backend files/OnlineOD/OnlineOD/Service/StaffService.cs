using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class StaffService : IStaffService
    {
        public readonly ApplicationDbContext _context;
        private readonly PasswordHasher<Staff> _passwordHasher = new();

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
            if (!string.IsNullOrWhiteSpace(staff.Password))
            {
                staff.Password = _passwordHasher.HashPassword(staff, staff.Password);
            }
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
            existing.RollNumber = staff.RollNumber;
            existing.Department = staff.Department;
            existing.Section = staff.Section;
            existing.Year = staff.Year;
            existing.Email = staff.Email;
            if (!string.IsNullOrWhiteSpace(staff.Password) && staff.Password != existing.Password)
            {
                existing.Password = _passwordHasher.HashPassword(existing, staff.Password);
            }
            existing.IsActive = staff.IsActive;

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

        // this will check the staff details in my database for login with transparent migration for legacy plaintext passwords
        public async Task<Staff?> LoginAsync(string username, string password)
        {
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
                return null;

            var staff = await _context.Staffs
                .FirstOrDefaultAsync(s => s.Name == username || s.RollNumber == username);

            if (staff == null || string.IsNullOrEmpty(staff.Password))
                return null;

            bool isMatch = false;
            bool needsRehash = false;

            try
            {
                var result = _passwordHasher.VerifyHashedPassword(staff, staff.Password, password);
                if (result == PasswordVerificationResult.Success)
                {
                    isMatch = true;
                }
                else if (result == PasswordVerificationResult.SuccessRehashNeeded)
                {
                    isMatch = true;
                    needsRehash = true;
                }
            }
            catch
            {
                // Format exception if stored password is not in ASP.NET Core hash format
            }

            if (!isMatch)
            {
                if (staff.Password == password)
                {
                    isMatch = true;
                    needsRehash = true;
                }
            }

            if (isMatch)
            {
                if (needsRehash)
                {
                    staff.Password = _passwordHasher.HashPassword(staff, password);
                    await _context.SaveChangesAsync();
                }
                return staff;
            }

            return null;
        }

    }
}