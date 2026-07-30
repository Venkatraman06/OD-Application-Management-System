using OnlineOD.Data;
using OnlineOD.Models;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Dtos;

namespace OnlineOD.Service
{
    public class OdApplyService : IOdApplyService
    {
        private readonly ApplicationDbContext _context;

        public OdApplyService(ApplicationDbContext context)
        {
            _context = context;
        }

        // Get all OD applications
        public async Task<List<OdApply>> GetAllOdApplyAsync()
        {
            return await _context.OdApplies.ToListAsync();
        }

        // Get OD application by ID
        public async Task<OdApply?> GetOdApplyByIdAsync(int id)
        {
            return await _context.OdApplies.FindAsync(id);
        }

        // Get OD applications by student ID
        public async Task<List<OdApply>> GetByStudentIdAsync(int studentId)
        {
            return await _context.OdApplies
                .Where(o => o.StudentId == studentId)
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
        }

        // Get OD applications by department
        public async Task<List<OdApply>> GetByDepartmentAsync(string department)
        {
            return await _context.OdApplies
                .Where(o => o.department == department)
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
        }

        // Get OD applications approved by faculty for a department
        public async Task<List<OdApply>> GetApprovedByFacultyAsync(string department)
        {
            return await _context.OdApplies
                .Where(o => o.department == department && o.FacultyStatus == "Approved")
                .OrderByDescending(o => o.AppliedDate)
                .ToListAsync();
        }

        // Get OD applications approved by HOD for a department

        public async Task<OdApply> CreateOdApplyAsync(OdApplyDto dto)
        {
            var od = new OdApply
            {
                StudentId = dto.StudentId,
                StudentName = dto.StudentName,
                registerNumber = dto.registerNumber,
                department = dto.department,
                FromDate = dto.FromDate,
                ToDate = dto.ToDate,
                NumberOfDays = dto.NumberOfDays,
                Event = dto.Event,
                Reason = dto.Reason,
                CollegeIndustry = dto.CollegeIndustry,
                AppliedDate = DateTime.Now,
                FacultyStatus = "Pending",
                HodStatus = "Pending",
                IsGroupOd = dto.IsGroupOd,
                GroupName = dto.GroupName,
                RegisterNumbers = dto.RegisterNumbers
            };

            _context.OdApplies.Add(od);
            await _context.SaveChangesAsync();
            return od;
        }

        // Update faculty status of an OD application
        public async Task<OdApply?> UpdateFacultyStatusAsync(int odId, string status)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;
            od.FacultyStatus = status;
            await _context.SaveChangesAsync();
            return od;
        }

        public async Task<OdApply?> UpdateHodStatusAsync(int odId, string status)
        {
            var od = await _context.OdApplies.FindAsync(odId);
            if (od == null) return null;
            od.HodStatus = status;
            await _context.SaveChangesAsync();
            return od;
        }

        // Delete an OD application by ID

        public async Task<bool> DeleteOdApplyAsync(int id)
        {
            var od = await _context.OdApplies.FindAsync(id);
            if (od == null) return false;

            _context.OdApplies.Remove(od);
            await _context.SaveChangesAsync();
            return true;
        }

        // In OdApplyService.cs
        public async Task UpdateCertificateAsync(OdApply od)
        {
            _context.OdApplies.Update(od);
            await _context.SaveChangesAsync();
        }
    }
}