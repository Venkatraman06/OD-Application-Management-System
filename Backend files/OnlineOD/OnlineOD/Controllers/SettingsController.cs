using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SettingsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public SettingsController(ApplicationDbContext context)
        {
            _context = context;
        }

        // GET /api/Settings
        // Returns all system settings (OD prefix, calendar colors, etc.)
        [AllowAnonymous]
        [HttpGet]
        public async Task<IActionResult> GetSettings()
        {
            var settings = await _context.SystemSettings.AsNoTracking().ToListAsync();
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            // Defaults
            map["odIdPrefix"] = "OD";
            map["calendarWeekendColor"] = "#ef4444";
            map["calendarHolidayColor"] = "#dc2626";
            map["calendarExamColor"] = "#f59e0b";
            map["calendarTodayColor"] = "#6366f1";

            foreach (var s in settings)
            {
                if (!string.IsNullOrWhiteSpace(s.Key))
                {
                    map[s.Key] = s.Value ?? string.Empty;
                }
            }

            return Ok(map);
        }

        // PUT /api/Settings
        // Updates system settings (Admin only)
        [Authorize(Roles = "Admin")]
        [HttpPut]
        public async Task<IActionResult> UpdateSettings([FromBody] Dictionary<string, string> updates)
        {
            if (updates == null || updates.Count == 0)
                return BadRequest("No settings provided.");

            foreach (var kvp in updates)
            {
                var key = kvp.Key?.Trim();
                if (string.IsNullOrEmpty(key)) continue;

                var val = kvp.Value?.Trim() ?? string.Empty;

                // Validate prefix (alphanumeric and dashes/underscores only, max 10 chars)
                if (key.Equals("odIdPrefix", StringComparison.OrdinalIgnoreCase))
                {
                    if (val.Length > 10 || System.Text.RegularExpressions.Regex.IsMatch(val, @"[^a-zA-Z0-9_\-]"))
                    {
                        return BadRequest("OD ID Prefix must be alphanumeric (up to 10 characters, optional - or _).");
                    }
                }

                // Validate colors (hex format #RGB or #RRGGBB)
                if (key.StartsWith("calendar", StringComparison.OrdinalIgnoreCase) && key.EndsWith("Color", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrEmpty(val) && !System.Text.RegularExpressions.Regex.IsMatch(val, @"^#(?:[0-9a-fA-F]{3}){1,2}$"))
                    {
                        return BadRequest($"Invalid color format for {key}. Use hex format e.g. #ef4444");
                    }
                }

                var existing = await _context.SystemSettings.FirstOrDefaultAsync(s => s.Key.ToLower() == key.ToLower());
                if (existing != null)
                {
                    existing.Value = val;
                    existing.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    _context.SystemSettings.Add(new SystemSetting
                    {
                        Key = key,
                        Value = val,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Settings updated successfully." });
        }

        // GET /api/Settings/Academic
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("Academic")]
        public async Task<IActionResult> GetAcademicSemesters([FromQuery] string? category = null, [FromQuery] int? year = null)
        {
            var query = _context.AcademicSemesters.AsNoTracking().AsQueryable();

            if (!string.IsNullOrWhiteSpace(category))
            {
                var cat = category.Trim().ToUpper();
                query = query.Where(a => a.Category.ToUpper() == cat);
            }

            if (year.HasValue && year.Value > 0)
            {
                query = query.Where(a => a.Year == year.Value);
            }

            var list = await query
                .OrderBy(a => a.Category)
                .ThenBy(a => a.Year)
                .ThenBy(a => a.Semester)
                .ToListAsync();

            return Ok(list);
        }

        public class AcademicSemesterDto
        {
            public int? Id { get; set; }
            public string Category { get; set; } = "UG";
            public int Year { get; set; }
            public int Semester { get; set; }
            public string StartDate { get; set; }
            public string EndDate { get; set; }
        }

        // POST /api/Settings/Academic
        [Authorize(Roles = "Admin")]
        [HttpPost("Academic")]
        public async Task<IActionResult> SaveAcademicSemester([FromBody] AcademicSemesterDto dto)
        {
            if (dto == null) return BadRequest("Data is required.");

            var cat = (dto.Category ?? "UG").Trim().ToUpper();
            if (cat != "UG" && cat != "PG")
                return BadRequest("Category must be either 'UG' or 'PG'.");

            if (dto.Year < 1 || dto.Year > 5)
                return BadRequest("Year must be between 1 and 5.");

            if (dto.Semester < 1 || dto.Semester > 10)
                return BadRequest("Semester must be between 1 and 10.");

            if (string.IsNullOrWhiteSpace(dto.StartDate) || string.IsNullOrWhiteSpace(dto.EndDate))
                return BadRequest("Start Date and End Date are required.");

            if (!DateTime.TryParse(dto.StartDate, out var start) || !DateTime.TryParse(dto.EndDate, out var end))
                return BadRequest("Invalid date format. Use YYYY-MM-DD.");

            if (start > end)
                return BadRequest("Start Date must be earlier than or equal to End Date.");

            var startStr = start.ToString("yyyy-MM-dd");
            var endStr = end.ToString("yyyy-MM-dd");

            // Overlap check for same category + year + semester (excluding current item if edit)
            var sameScopeSemesters = await _context.AcademicSemesters
                .Where(a => a.Category.ToUpper() == cat && a.Year == dto.Year && a.Semester == dto.Semester && (!dto.Id.HasValue || a.Id != dto.Id.Value))
                .ToListAsync();

            var overlaps = sameScopeSemesters
                .Any(a => string.Compare(a.StartDate, endStr, StringComparison.OrdinalIgnoreCase) <= 0 && string.Compare(a.EndDate, startStr, StringComparison.OrdinalIgnoreCase) >= 0);

            if (overlaps)
                return BadRequest($"An academic semester period for {cat} Year {dto.Year} Semester {dto.Semester} already overlaps with the selected date range.");

            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                var existing = await _context.AcademicSemesters.FindAsync(dto.Id.Value);
                if (existing == null) return NotFound("Academic semester not found.");

                existing.Category = cat;
                existing.Year = dto.Year;
                existing.Semester = dto.Semester;
                existing.StartDate = startStr;
                existing.EndDate = endStr;
            }
            else
            {
                var entity = new AcademicSemester
                {
                    Category = cat,
                    Year = dto.Year,
                    Semester = dto.Semester,
                    StartDate = startStr,
                    EndDate = endStr,
                    CreatedAt = DateTime.UtcNow
                };
                _context.AcademicSemesters.Add(entity);
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Academic semester saved successfully." });
        }

        // DELETE /api/Settings/Academic/{id}
        [Authorize(Roles = "Admin")]
        [HttpDelete("Academic/{id}")]
        public async Task<IActionResult> DeleteAcademicSemester(int id)
        {
            var existing = await _context.AcademicSemesters.FindAsync(id);
            if (existing == null) return NotFound();

            _context.AcademicSemesters.Remove(existing);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}
