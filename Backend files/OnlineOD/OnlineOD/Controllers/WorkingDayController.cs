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

        // GET /api/WorkingDay
        // Returns the current effective working-days list (seed calendar
        // with any HOD overrides already applied), raw override rows,
        // and any configured special days (Holidays / Examinations).
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var overrides = await _context.WorkingDayOverrides
                .AsNoTracking()
                .OrderBy(o => o.Date)
                .ToListAsync();

            var specialDays = WorkingDaysCalendar.SpecialDays.Values
                .OrderBy(s => s.Date)
                .ToList();

            return Ok(new
            {
                workingDays = WorkingDaysCalendar.WorkingDays.OrderBy(d => d).ToList(),
                minDate = WorkingDaysCalendar.MinDate,
                maxDate = WorkingDaysCalendar.MaxDate,
                overrides,
                specialDays
            });
        }

        // GET /api/WorkingDay/CheckSpecialDays?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
        [HttpGet("CheckSpecialDays")]
        public IActionResult CheckSpecialDays([FromQuery] string? fromDate, [FromQuery] string? toDate)
        {
            if (string.IsNullOrWhiteSpace(fromDate) || string.IsNullOrWhiteSpace(toDate))
                return BadRequest(new { message = "fromDate and toDate query parameters are required." });

            var list = WorkingDaysCalendar.GetSpecialDaysInRange(fromDate, toDate);
            return Ok(new
            {
                hasSpecialDays = list.Count > 0,
                count = list.Count,
                specialDays = list
            });
        }

        // PUT /api/WorkingDay/{date}
        // Body: { "isWorking": true|false, "dayType": "Holiday"|"Examination", "name": "..." }
        [HttpPut("{date}")]
        public async Task<IActionResult> EditDay(string date, [FromBody] EditWorkingDayDto dto)
        {
            if (string.IsNullOrWhiteSpace(date))
                return BadRequest(new { message = "Date is required." });

            bool isWorking = dto.IsWorking ?? (!string.Equals(dto.DayType, "Holiday", StringComparison.OrdinalIgnoreCase));

            if (!WorkingDaysCalendar.ApplyOverride(date, isWorking, dto.DayType, dto.Name))
                return BadRequest(new { message = "Invalid date." });

            var normalized = DateTime.Parse(date).ToString("yyyy-MM-dd");

            var existing = await _context.WorkingDayOverrides.FindAsync(normalized);
            if (existing == null)
            {
                _context.WorkingDayOverrides.Add(new WorkingDayOverride
                {
                    Date = normalized,
                    IsWorking = isWorking,
                    DayType = dto.DayType,
                    Name = dto.Name,
                    UpdatedAt = DateTime.Now
                });
            }
            else
            {
                existing.IsWorking = isWorking;
                existing.DayType = dto.DayType;
                existing.Name = dto.Name;
                existing.UpdatedAt = DateTime.Now;
            }

            await _context.SaveChangesAsync();

            return Ok(new { date = normalized, isWorking = isWorking, dayType = dto.DayType, name = dto.Name });
        }

        // DELETE /api/WorkingDay/{date}
        [HttpDelete("{date}")]
        public async Task<IActionResult> RemoveDay(string date)
        {
            return await EditDay(date, new EditWorkingDayDto { IsWorking = false, DayType = "Holiday", Name = "Holiday" });
        }

        // POST /api/WorkingDay/EditCalendar & POST /api/WorkingDay/AddCalendar (alias)
        // Body: { "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "dayType": "Holiday"|"Examination", "name": "Pongal" }
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

            // Capitalize properly
            dayType = dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase) ? "Holiday" : "Examination";

            if (string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest(new { message = "Name is required (e.g. Pongal, Semester Examination)." });

            var name = dto.Name.Trim();

            if (!DateTime.TryParse(dto.FromDate, out var start) || !DateTime.TryParse(dto.ToDate, out var end))
                return BadRequest(new { message = "Invalid date format for From Date or End Date." });

            if (start.Date > end.Date)
                return BadRequest(new { message = "End Date must be greater than or equal to From Date." });

            bool isWorking = dto.IsWorking ?? (!dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase));

            var curr = start.Date;
            while (curr <= end.Date)
            {
                var dateStr = curr.ToString("yyyy-MM-dd");
                WorkingDaysCalendar.ApplyOverride(dateStr, isWorking, dayType, name);

                var existing = await _context.WorkingDayOverrides.FindAsync(dateStr);
                if (existing == null)
                {
                    _context.WorkingDayOverrides.Add(new WorkingDayOverride
                    {
                        Date = dateStr,
                        IsWorking = isWorking,
                        DayType = dayType,
                        Name = name,
                        UpdatedAt = DateTime.Now
                    });
                }
                else
                {
                    existing.IsWorking = isWorking;
                    existing.DayType = dayType;
                    existing.Name = name;
                    existing.UpdatedAt = DateTime.Now;
                }
                curr = curr.AddDays(1);
            }

            await _context.SaveChangesAsync();
            return Ok(new
            {
                message = "Calendar updated successfully.",
                fromDate = start.ToString("yyyy-MM-dd"),
                toDate = end.ToString("yyyy-MM-dd"),
                dayType,
                name,
                isWorking
            });
        }
    }

    public class EditWorkingDayDto
    {
        public bool? IsWorking { get; set; }
        public string? DayType { get; set; }
        public string? Name { get; set; }
    }

    public class EditCalendarRangeDto
    {
        public string FromDate { get; set; } = string.Empty;
        public string ToDate { get; set; } = string.Empty;
        public string DayType { get; set; } = "Holiday"; // "Holiday" | "Examination"
        public string Name { get; set; } = string.Empty;
        public bool? IsWorking { get; set; }
    }
}