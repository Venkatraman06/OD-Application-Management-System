using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace OnlineOD.Service
{
    public class HodService : IHodService
    {
        public readonly ApplicationDbContext _context;
        private readonly PasswordHasher<Hod> _passwordHasher = new();

        //constructor to inject the database context
        public HodService(ApplicationDbContext context)
        {
            _context = context;
        }

        // this will get all the hod details from my database
        public async Task<List<Hod>> GetAllHodAsync()
        {
            return await _context.Hods.ToListAsync();
        }

        // this will get the hod details by id from my database
        public async Task<Hod> GetHodByIdAsync(int id)
        {
            return await _context.Hods.FindAsync(id);
        }

        // this will add the hod details to my database
        public async Task<Hod> AddHodAsync(Hod hod)
        {
            if (!string.IsNullOrWhiteSpace(hod.Password))
            {
                hod.Password = _passwordHasher.HashPassword(hod, hod.Password);
            }
            _context.Hods.Add(hod);
            await _context.SaveChangesAsync();
            return hod;
        }

        // this will update the hod details in my database
        public async Task<Hod> UpdateHodAsync(Hod hod)
        {
            var existing = await _context.Hods.FindAsync(hod.HodId);
            if (existing == null) return null;

            existing.Name = hod.Name;
            existing.RollNumber = hod.RollNumber;
            existing.Department = hod.Department;
            if (!string.IsNullOrWhiteSpace(hod.Password) && hod.Password != existing.Password)
            {
                existing.Password = _passwordHasher.HashPassword(existing, hod.Password);
            }
            existing.Email = hod.Email;
            existing.IsActive = hod.IsActive;

            await _context.SaveChangesAsync();
            return existing;
        }

        //  this will delete the hod details from my database
        public async Task<bool> DeleteHodAsync(int id)
        {
            var hod = await _context.Hods.FindAsync(id);
            if (hod == null) return false;

            _context.Hods.Remove(hod);
            await _context.SaveChangesAsync();
            return true;
        }

        // this will check the hod details for login from my database with transparent migration for legacy plaintext passwords
        public async Task<Hod?> LoginAsync(string username, string password)
        {
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
                return null;

            var hod = await _context.Hods
                .FirstOrDefaultAsync(h => h.Name == username);

            if (hod == null || string.IsNullOrEmpty(hod.Password))
                return null;

            bool isMatch = false;
            bool needsRehash = false;

            try
            {
                var result = _passwordHasher.VerifyHashedPassword(hod, hod.Password, password);
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
                if (hod.Password == password)
                {
                    isMatch = true;
                    needsRehash = true;
                }
            }

            if (isMatch)
            {
                if (needsRehash)
                {
                    hod.Password = _passwordHasher.HashPassword(hod, password);
                    await _context.SaveChangesAsync();
                }
                return hod;
            }

            return null;
        }
    }
}