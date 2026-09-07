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
        // with any HOD overrides already applied) plus the raw override
        // rows, so the HOD calendar UI can tell which days were edited.
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var overrides = await _context.WorkingDayOverrides
                .OrderBy(o => o.Date)
                .ToListAsync();

            return Ok(new
            {
                workingDays = WorkingDaysCalendar.WorkingDays.OrderBy(d => d).ToList(),
                minDate = WorkingDaysCalendar.MinDate,
                maxDate = WorkingDaysCalendar.MaxDate,
                overrides
            });
        }

        // PUT /api/WorkingDay/{date}
        // Body: { "isWorking": true|false }
        // HOD edits a single calendar date — set isWorking:false to remov
        // it from the calendar (holiday), or true to add/restore it as a
        // working day.
        [HttpPut("{date}")]
        public async Task<IActionResult> EditDay(string date, [FromBody] EditWorkingDayDto dto)
        {
            if (string.IsNullOrWhiteSpace(date))
                return BadRequest(new { message = "Date is required." });

            if (!WorkingDaysCalendar.ApplyOverride(date, dto.IsWorking))
                return BadRequest(new { message = "Invalid date." });

            var normalized = DateTime.Parse(date).ToString("yyyy-MM-dd");

            var existing = await _context.WorkingDayOverrides.FindAsync(normalized);
            if (existing == null)
            {
                _context.WorkingDayOverrides.Add(new WorkingDayOverride
                {
                    Date = normalized,
                    IsWorking = dto.IsWorking,
                    UpdatedAt = DateTime.Now
                });
            }
            else
            {
                existing.IsWorking = dto.IsWorking;
                existing.UpdatedAt = DateTime.Now;
            }

            await _context.SaveChangesAsync();

            return Ok(new { date = normalized, isWorking = dto.IsWorking });
        }

        // DELETE /api/WorkingDay/{date}
        // Convenience shortcut for "remove this day from the calendar" —
        // equivalent to PUT with isWorking:false.
        [HttpDelete("{date}")]
        public async Task<IActionResult> RemoveDay(string date)
        {
            return await EditDay(date, new EditWorkingDayDto { IsWorking = false });
        }
    }

    public class EditWorkingDayDto
    {
        public bool IsWorking { get; set; }
    }
}