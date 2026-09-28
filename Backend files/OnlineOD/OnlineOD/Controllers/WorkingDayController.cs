using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;
using OnlineOD.Service;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WorkingDayController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public WorkingDayController(ApplicationDbContext context)
        {
            _context = context;
        }

        // GET /api/WorkingDay?dept=...&year=...&section=...&course=...
        // Returns the current effective working-days list, override rows,
        // and configured special days (Holidays / Examinations) scoped to user/role.
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] string? dept, [FromQuery] int? year, [FromQuery] string? section, [FromQuery] string? course)
        {
            var cleanDept = string.IsNullOrWhiteSpace(dept) ? null : dept.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : section.Trim();
            var cleanYear = (year.HasValue && year.Value > 0) ? year.Value : (int?)null;
            var cleanCourse = string.IsNullOrWhiteSpace(course) ? null : course.Trim();

            var overridesQuery = _context.WorkingDayOverrides.AsNoTracking();

            if (!string.IsNullOrEmpty(cleanDept))
            {
                overridesQuery = overridesQuery.Where(o => o.Department == null || o.Department == cleanDept || o.Department.Contains(cleanDept) || cleanDept.Contains(o.Department));
            }
            if (cleanYear.HasValue)
            {
                overridesQuery = overridesQuery.Where(o => o.Year == null || o.Year == 0 || o.Year == cleanYear.Value);
            }
            if (!string.IsNullOrEmpty(cleanSec))
            {
                overridesQuery = overridesQuery.Where(o => o.Section == null || o.Section == "" || o.Section == "All" || o.Section == cleanSec);
            }

            var overrides = await overridesQuery
                .OrderBy(o => o.Date)
                .ToListAsync();

            var specialDays = WorkingDaysCalendar.GetSpecialDays(cleanDept, cleanYear, cleanSec);

            return Ok(new
            {
                workingDays = WorkingDaysCalendar.WorkingDays.OrderBy(d => d).ToList(),
                minDate = WorkingDaysCalendar.MinDate,
                maxDate = WorkingDaysCalendar.MaxDate,
                overrides,
                specialDays
            });
        }

        // GET /api/WorkingDay/CheckSpecialDays?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&dept=...&year=...&section=...
        [HttpGet("CheckSpecialDays")]
        public IActionResult CheckSpecialDays([FromQuery] string? fromDate, [FromQuery] string? toDate,
            [FromQuery] string? dept, [FromQuery] int? year, [FromQuery] string? section)
        {
            if (string.IsNullOrWhiteSpace(fromDate) || string.IsNullOrWhiteSpace(toDate))
                return BadRequest(new { message = "fromDate and toDate query parameters are required." });

            var cleanDept = string.IsNullOrWhiteSpace(dept) ? null : dept.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : section.Trim();
            var cleanYear = (year.HasValue && year.Value > 0) ? year.Value : (int?)null;

            var list = WorkingDaysCalendar.GetSpecialDaysInRange(fromDate, toDate, cleanDept, cleanYear, cleanSec);
            return Ok(new
            {
                hasSpecialDays = list.Count > 0,
                count = list.Count,
                specialDays = list
            });
        }

        // PUT /api/WorkingDay/{date}
        // Body: { "isWorking": true|false, "dayType": "Holiday"|"Examination", "name": "...", "department": "...", "year": 1, "section": "A" }
        [HttpPut("{date}")]
        public async Task<IActionResult> EditDay(string date, [FromBody] EditWorkingDayDto dto)
        {
            if (string.IsNullOrWhiteSpace(date))
                return BadRequest(new { message = "Date is required." });

            bool isWorking = dto.IsWorking ?? (!string.Equals(dto.DayType, "Holiday", StringComparison.OrdinalIgnoreCase));
            var cleanDept = string.IsNullOrWhiteSpace(dto.Department) ? null : dto.Department.Trim();
            var cleanCourse = string.IsNullOrWhiteSpace(dto.Course) ? null : dto.Course.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(dto.Section) || dto.Section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : dto.Section.Trim();
            var cleanYear = (dto.Year.HasValue && dto.Year.Value > 0) ? dto.Year.Value : (int?)null;

            if (!DateTime.TryParse(date, out var parsedDate))
                return BadRequest(new { message = "Invalid date format." });

            var normalized = parsedDate.ToString("yyyy-MM-dd");

            var existing = await _context.WorkingDayOverrides.FirstOrDefaultAsync(o =>
                o.Date == normalized &&
                (cleanDept == null || o.Department == cleanDept) &&
                (cleanYear == null || o.Year == cleanYear) &&
                (cleanSec == null || o.Section == cleanSec) &&
                (dto.Name == null || o.Name == dto.Name));

            if (existing == null)
            {
                var record = new WorkingDayOverride
                {
                    Date = normalized,
                    IsWorking = isWorking,
                    DayType = dto.DayType,
                    Name = dto.Name,
                    Department = cleanDept,
                    Course = cleanCourse,
                    Year = cleanYear,
                    Section = cleanSec,
                    UpdatedAt = DateTime.Now
                };
                _context.WorkingDayOverrides.Add(record);
                await _context.SaveChangesAsync();
                WorkingDaysCalendar.ApplyOverride(normalized, isWorking, dto.DayType, dto.Name, cleanDept, cleanCourse, cleanYear, cleanSec, record.Id);
            }
            else
            {
                existing.IsWorking = isWorking;
                existing.DayType = dto.DayType;
                existing.Name = dto.Name;
                existing.Department = cleanDept;
                existing.Course = cleanCourse;
                existing.Year = cleanYear;
                existing.Section = cleanSec;
                existing.UpdatedAt = DateTime.Now;
                await _context.SaveChangesAsync();
                WorkingDaysCalendar.ApplyOverride(normalized, isWorking, dto.DayType, dto.Name, cleanDept, cleanCourse, cleanYear, cleanSec, existing.Id);
            }

            return Ok(new { date = normalized, isWorking, dayType = dto.DayType, name = dto.Name });
        }

        // DELETE /api/WorkingDay/{date}
        [HttpDelete("{date}")]
        public async Task<IActionResult> RemoveDay(string date)
        {
            return await EditDay(date, new EditWorkingDayDto { IsWorking = false, DayType = "Holiday", Name = "Holiday" });
        }

        // POST /api/WorkingDay/EditCalendar & POST /api/WorkingDay/AddCalendar (alias)
        // Body: { "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "dayType": "Holiday"|"Examination", "name": "Pongal", "department": "...", "year": 2, "section": "A" }
        [HttpPost("EditCalendar")]
        [HttpPost("AddCalendar")]
        public async Task<IActionResult> EditCalendar([FromBody] EditCalendarRangeDto dto)
        {
            if (dto == null || string.IsNullOrWhiteSpace(dto.FromDate) || string.IsNullOrWhiteSpace(dto.ToDate))
                return BadRequest(new { message = "From Date and End Date are required." });

            if (string.IsNullOrWhiteSpace(dto.DayType))
                return BadRequest(new { message = "Day Type is required (Holiday or Examination)." });

            var dayType = dto.DayType.Trim();
            if (!dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase) &&
                !dayType.Equals("Examination", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Day Type must be either 'Holiday' or 'Examination'." });
            }

            dayType = dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase) ? "Holiday" : "Examination";

            if (string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { message = "Name is required (e.g. Pongal, Semester Examination)." });

            var name = dto.Name.Trim();

            if (!DateTime.TryParse(dto.FromDate, out var start) || !DateTime.TryParse(dto.ToDate, out var end))
                return BadRequest(new { message = "Invalid date format for From Date or End Date." });

            if (start.Date > end.Date)
                return BadRequest(new { message = "End Date must be greater than or equal to From Date." });

            bool isWorking = dto.IsWorking ?? (!dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase));
            var cleanDept = string.IsNullOrWhiteSpace(dto.Department) ? null : dto.Department.Trim();
            var cleanCourse = string.IsNullOrWhiteSpace(dto.Course) ? null : dto.Course.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(dto.Section) || dto.Section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : dto.Section.Trim();
            var cleanYear = (dto.Year.HasValue && dto.Year.Value > 0) ? dto.Year.Value : (int?)null;

            var curr = start.Date;
            var recordsToApply = new List<WorkingDayOverride>();

            while (curr <= end.Date)
            {
                var dateStr = curr.ToString("yyyy-MM-dd");

                var existing = await _context.WorkingDayOverrides.FirstOrDefaultAsync(o =>
                    o.Date == dateStr &&
                    (cleanDept == null || o.Department == cleanDept) &&
                    (cleanYear == null || o.Year == cleanYear) &&
                    (cleanSec == null || o.Section == cleanSec) &&
                    o.Name == name);

                if (existing == null)
                {
                    var record = new WorkingDayOverride
                    {
                        Date = dateStr,
                        IsWorking = isWorking,
                        DayType = dayType,
                        Name = name,
                        Department = cleanDept,
                        Course = cleanCourse,
                        Year = cleanYear,
                        Section = cleanSec,
                        UpdatedAt = DateTime.Now
                    };
                    _context.WorkingDayOverrides.Add(record);
                    recordsToApply.Add(record);
                }
                else
                {
                    existing.IsWorking = isWorking;
                    existing.DayType = dayType;
                    existing.Name = name;
                    existing.Department = cleanDept;
                    existing.Course = cleanCourse;
                    existing.Year = cleanYear;
                    existing.Section = cleanSec;
                    existing.UpdatedAt = DateTime.Now;
                    recordsToApply.Add(existing);
                }
                curr = curr.AddDays(1);
            }

            await _context.SaveChangesAsync();

            // Apply to live memory with assigned Ids
            foreach (var rec in recordsToApply)
            {
                WorkingDaysCalendar.ApplyOverride(rec.Date, rec.IsWorking, rec.DayType, rec.Name,
                    rec.Department, rec.Course, rec.Year, rec.Section, rec.Id);
            }

            return Ok(new
            {
                message = "Calendar updated successfully.",
                fromDate = start.ToString("yyyy-MM-dd"),
                toDate = end.ToString("yyyy-MM-dd"),
                dayType,
                name,
                department = cleanDept,
                course = cleanCourse,
                year = cleanYear,
                section = cleanSec,
                isWorking
            });
        }
    }

    public class EditWorkingDayDto
    {
        public bool? IsWorking { get; set; }
        public string? DayType { get; set; }
        public string? Name { get; set; }
        public string? Department { get; set; }
        public string? Course { get; set; }
        public int? Year { get; set; }
        public string? Section { get; set; }
    }

    public class EditCalendarRangeDto
    {
        public string FromDate { get; set; } = string.Empty;
        public string ToDate { get; set; } = string.Empty;
        public string DayType { get; set; } = "Holiday"; // "Holiday" | "Examination"
        public string Name { get; set; } = string.Empty;
        public string? Department { get; set; }
        public string? Course { get; set; }
        public int? Year { get; set; }
        public string? Section { get; set; }
        public bool? IsWorking { get; set; }
    }
}
