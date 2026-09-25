using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;
using System;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EventsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public EventsController(ApplicationDbContext context)
        {
            _context = context;
        }

        private string GetTodayDateString()
        {
            // IST is UTC+5:30
            var istTime = DateTime.UtcNow.AddHours(5).AddMinutes(30);
            return istTime.ToString("yyyy-MM-dd");
        }

        // GET /api/Events/Active
        // Returns only currently active events where IsActive is true and deadline has not passed.
        // Used by the Student OD Apply form.
        [HttpGet("Active")]
        public async Task<IActionResult> GetActiveEvents()
        {
            var today = GetTodayDateString();

            // Auto-deactivate any events whose deadline has passed
            var pastDeadlineEvents = await _context.Events
                .Where(e => e.IsActive && !string.IsNullOrEmpty(e.DeadlineDate) && string.Compare(today, e.DeadlineDate) > 0)
                .ToListAsync();

            if (pastDeadlineEvents.Count > 0)
            {
                foreach (var evt in pastDeadlineEvents)
                {
                    evt.IsActive = false;
                }
                await _context.SaveChangesAsync();
            }

            var activeEvents = await _context.Events
                .Where(e => e.IsActive)
                .OrderBy(e => e.EventName)
                .Select(e => new
                {
                    id = e.Id,
                    eventName = e.EventName,
                    collegeName = e.CollegeName,
                    startingDate = e.StartingDate,
                    deadlineDate = e.DeadlineDate
                })
                .ToListAsync();

            return Ok(activeEvents);
        }

        // GET /api/Events
        // Returns all events for the Admin Events tab.
        [HttpGet]
        public async Task<IActionResult> GetAllEvents()
        {
            var today = GetTodayDateString();

            // Auto-deactivate any events whose deadline has passed
            var pastDeadlineEvents = await _context.Events
                .Where(e => e.IsActive && !string.IsNullOrEmpty(e.DeadlineDate) && string.Compare(today, e.DeadlineDate) > 0)
                .ToListAsync();

            if (pastDeadlineEvents.Count > 0)
            {
                foreach (var evt in pastDeadlineEvents)
                {
                    evt.IsActive = false;
                }
                await _context.SaveChangesAsync();
            }

            var events = await _context.Events
                .OrderByDescending(e => e.CreatedAt)
                .ToListAsync();

            var result = events.Select(e =>
            {
                string status = "Going on";
                if (!string.IsNullOrEmpty(e.StartingDate) && string.Compare(today, e.StartingDate, StringComparison.Ordinal) < 0)
                {
                    status = "Upcoming";
                }
                else if (!string.IsNullOrEmpty(e.DeadlineDate) && string.Compare(today, e.DeadlineDate, StringComparison.Ordinal) > 0)
                {
                    status = "Expired";
                }

                return new
                {
                    id = e.Id,
                    eventName = e.EventName,
                    collegeName = e.CollegeName,
                    startingDate = e.StartingDate,
                    deadlineDate = e.DeadlineDate,
                    createdAt = e.CreatedAt,
                    isActive = e.IsActive,
                    status = status
                };
            }).ToList();

            return Ok(result);
        }

        // GET /api/Events/{id}
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEventById(int id)
        {
            var evt = await _context.Events.FindAsync(id);
            if (evt == null) return NotFound(new { message = "Event not found." });
            return Ok(evt);
        }

        // POST /api/Events
        [HttpPost]
        public async Task<IActionResult> CreateEvent([FromBody] EventDto dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Event data is required." });

            if (string.IsNullOrWhiteSpace(dto.EventName))
                return BadRequest(new { message = "Event name is required." });

            if (string.IsNullOrWhiteSpace(dto.CollegeName))
                return BadRequest(new { message = "College name is required." });

            if (string.IsNullOrWhiteSpace(dto.StartingDate))
                return BadRequest(new { message = "Starting date is required." });

            if (string.IsNullOrWhiteSpace(dto.DeadlineDate))
                return BadRequest(new { message = "Deadline date is required." });

            if (string.Compare(dto.DeadlineDate.Trim(), dto.StartingDate.Trim(), StringComparison.Ordinal) < 0)
                return BadRequest(new { message = "Deadline date cannot be before starting date." });

            var evt = new Event
            {
                EventName = dto.EventName.Trim(),
                CollegeName = dto.CollegeName.Trim(),
                StartingDate = dto.StartingDate.Trim(),
                DeadlineDate = dto.DeadlineDate.Trim(),
                CreatedAt = DateTime.UtcNow,
                IsActive = true
            };

            _context.Events.Add(evt);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Event created successfully.", eventObj = evt });
        }

        // PUT /api/Events/{id}
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEvent(int id, [FromBody] EventDto dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Event data is required." });

            var evt = await _context.Events.FindAsync(id);
            if (evt == null) return NotFound(new { message = "Event not found." });

            if (!string.IsNullOrWhiteSpace(dto.EventName)) evt.EventName = dto.EventName.Trim();
            if (!string.IsNullOrWhiteSpace(dto.CollegeName)) evt.CollegeName = dto.CollegeName.Trim();
            if (!string.IsNullOrWhiteSpace(dto.StartingDate)) evt.StartingDate = dto.StartingDate.Trim();
            if (!string.IsNullOrWhiteSpace(dto.DeadlineDate)) evt.DeadlineDate = dto.DeadlineDate.Trim();

            if (string.Compare(evt.DeadlineDate, evt.StartingDate, StringComparison.Ordinal) < 0)
                return BadRequest(new { message = "Deadline date cannot be before starting date." });

            if (dto.IsActive.HasValue) evt.IsActive = dto.IsActive.Value;

            await _context.SaveChangesAsync();

            return Ok(new { message = "Event updated successfully.", eventObj = evt });
        }

        // DELETE /api/Events/{id}
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteEvent(int id)
        {
            var evt = await _context.Events.FindAsync(id);
            if (evt == null) return NotFound(new { message = "Event not found." });

            _context.Events.Remove(evt);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Event deleted successfully." });
        }

        // PUT /api/Events/{id}/ToggleStatus
        [HttpPut("{id}/ToggleStatus")]
        public async Task<IActionResult> ToggleEventStatus(int id)
        {
            var evt = await _context.Events.FindAsync(id);
            if (evt == null) return NotFound(new { message = "Event not found." });

            evt.IsActive = !evt.IsActive;
            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = evt.IsActive ? "Event activated." : "Event deactivated.",
                isActive = evt.IsActive
            });
        }
    }

    public class EventDto
    {
        public string? EventName { get; set; }
        public string? CollegeName { get; set; }
        public string? StartingDate { get; set; }
        public string? DeadlineDate { get; set; }
        public bool? IsActive { get; set; }
    }
}
