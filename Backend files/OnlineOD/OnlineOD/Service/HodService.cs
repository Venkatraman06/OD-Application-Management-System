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
            existing.Department = hod.Department;
            existing.Password = hod.Password;
            existing.Email = hod.Email;

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

        // this will check the hod details for login from my database
        public async Task<Hod> LoginAsync(string username, string password)
        {
            return await _context.Hods
                .FirstOrDefaultAsync(h =>
                    h.Name == username &&
                    h.Password == password);
        }
    }
}