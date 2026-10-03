using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Models;
using OnlineOD.Service;
using System.Security.Claims;

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

        // GET /api/WorkingDay?dept=...&year=...&section=...&course=...&category=...
        // Returns the current effective working-days list, override rows,
        // and configured special days (Holidays / Examinations) scoped to user/role.
        [AllowAnonymous]
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] string? dept, [FromQuery] int? year, [FromQuery] string? section, [FromQuery] string? course, [FromQuery] string? category)
        {
            var cleanDept = string.IsNullOrWhiteSpace(dept) ? null : dept.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : section.Trim();
            var cleanYear = (year.HasValue && year.Value > 0) ? year.Value : (int?)null;
            var cleanCourse = string.IsNullOrWhiteSpace(course) ? (string.IsNullOrWhiteSpace(category) ? null : category.Trim()) : course.Trim();

            // If user is authenticated, derive or check claims
            if (User.Identity != null && User.Identity.IsAuthenticated)
            {
                if (User.IsInRole("Staff"))
                {
                    var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(staffIdClaim, out var staffId))
                    {
                        var staff = await _context.Staffs.FindAsync(staffId);
                        if (staff != null)
                        {
                            cleanDept = staff.Department;
                            cleanYear = staff.Year;
                            cleanSec = staff.Section;
                            cleanCourse = staff.Category ?? "UG";
                        }
                    }
                }
                else if (User.IsInRole("HOD"))
                {
                    var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(hodIdClaim, out var hodId))
                    {
                        var hod = await _context.Hods.FindAsync(hodId);
                        if (hod != null)
                        {
                            cleanDept = hod.Department;
                        }
                    }
                }
                else if (User.IsInRole("Student"))
                {
                    var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(studentIdClaim, out var studentId))
                    {
                        var student = await _context.Students.FindAsync(studentId);
                        if (student != null)
                        {
                            cleanDept = student.Department;
                            cleanYear = student.Year;
                            cleanSec = student.Section;
                            cleanCourse = student.Category ?? "UG";
                        }
                    }
                }
            }

            var overridesQuery = _context.WorkingDayOverrides.AsNoTracking();

            if (!string.IsNullOrEmpty(cleanDept))
            {
                overridesQuery = overridesQuery.Where(o => o.Department == null || o.Department == "" || o.Department.ToLower() == cleanDept.ToLower() || cleanDept.ToLower().Contains(o.Department.ToLower()));
            }
            else
            {
                // Unauthenticated request with no department specified: only return global/institution-wide overrides
                overridesQuery = overridesQuery.Where(o => o.Department == null || o.Department == "");
            }

            if (cleanYear.HasValue)
            {
                overridesQuery = overridesQuery.Where(o => o.Year == null || o.Year == 0 || o.Year == cleanYear.Value);
            }
            if (!string.IsNullOrEmpty(cleanSec))
            {
                overridesQuery = overridesQuery.Where(o => o.Section == null || o.Section == "" || o.Section.ToLower() == "all" || o.Section.ToLower() == cleanSec.ToLower());
            }
            if (!string.IsNullOrEmpty(cleanCourse))
            {
                overridesQuery = overridesQuery.Where(o => o.Course == null || o.Course == "" || o.Course.ToLower() == cleanCourse.ToLower() || cleanCourse.ToLower().Contains(o.Course.ToLower()));
            }

            var overrides = await overridesQuery
                .OrderBy(o => o.Date)
                .ToListAsync();

            var staffList = await _context.Staffs.AsNoTracking().Where(s => s.IsActive).ToListAsync();
            var hodList = await _context.Hods.AsNoTracking().Where(h => h.IsActive).ToListAsync();

            var specialDays = overrides
                .Where(o => !string.IsNullOrEmpty(o.DayType) || !string.IsNullOrEmpty(o.Name) || !o.IsWorking)
                .Select(o =>
                {
                    var matchedStaff = staffList.FirstOrDefault(s =>
                        (!string.IsNullOrEmpty(o.Department) && (s.Department.ToLower() == o.Department.ToLower() || s.Department.ToLower().Contains(o.Department.ToLower()) || o.Department.ToLower().Contains(s.Department.ToLower()))) &&
                        (!o.Year.HasValue || o.Year == 0 || s.Year == o.Year) &&
                        (string.IsNullOrEmpty(o.Section) || o.Section == "All" || string.Equals(s.Section, o.Section, StringComparison.OrdinalIgnoreCase)) &&
                        (string.IsNullOrEmpty(o.Course) || string.Equals(s.Category, o.Course, StringComparison.OrdinalIgnoreCase))
                    );
                    if (matchedStaff == null && !string.IsNullOrEmpty(o.Department))
                    {
                        matchedStaff = staffList.FirstOrDefault(s => s.Department.ToLower() == o.Department.ToLower() || s.Department.ToLower().Contains(o.Department.ToLower()) || o.Department.ToLower().Contains(s.Department.ToLower()));
                    }

                    var matchedHod = (matchedStaff == null && !string.IsNullOrEmpty(o.Department))
                        ? hodList.FirstOrDefault(h => h.Department.ToLower() == o.Department.ToLower() || h.Department.ToLower().Contains(o.Department.ToLower()) || o.Department.ToLower().Contains(h.Department.ToLower()))
                        : null;

                    return new SpecialDayItem
                    {
                        Id = o.Id,
                        Date = o.Date,
                        DayType = o.DayType ?? (o.IsWorking ? "Working" : "Holiday"),
                        Name = o.Name ?? (o.IsWorking ? "Working Day" : "Holiday"),
                        Department = o.Department,
                        Course = o.Course,
                        Year = o.Year,
                        Section = o.Section,
                        AddedBy = matchedStaff?.Name ?? matchedHod?.Name ?? "Staff"
                    };
                }).ToList();

            return Ok(new
            {
                workingDays = WorkingDaysCalendar.WorkingDays.OrderBy(d => d).ToList(),
                minDate = WorkingDaysCalendar.MinDate,
                maxDate = WorkingDaysCalendar.MaxDate,
                overrides,
                specialDays
            });
        }

        // GET /api/WorkingDay/CheckSpecialDays?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&dept=...&year=...&section=...&category=...
        [AllowAnonymous]
        [HttpGet("CheckSpecialDays")]
        public async Task<IActionResult> CheckSpecialDays([FromQuery] string? fromDate, [FromQuery] string? toDate,
            [FromQuery] string? dept, [FromQuery] int? year, [FromQuery] string? section, [FromQuery] string? category, [FromQuery] string? course)
        {
            if (string.IsNullOrWhiteSpace(fromDate) || string.IsNullOrWhiteSpace(toDate))
                return BadRequest(new { message = "fromDate and toDate query parameters are required." });

            var cleanDept = string.IsNullOrWhiteSpace(dept) ? null : dept.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(section) || section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : section.Trim();
            var cleanYear = (year.HasValue && year.Value > 0) ? year.Value : (int?)null;
            var cleanCourse = string.IsNullOrWhiteSpace(course) ? (string.IsNullOrWhiteSpace(category) ? null : category.Trim()) : course.Trim();

            if (User.Identity != null && User.Identity.IsAuthenticated)
            {
                if (User.IsInRole("Student"))
                {
                    var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(studentIdClaim, out var studentId))
                    {
                        var student = await _context.Students.FindAsync(studentId);
                        if (student != null)
                        {
                            cleanDept = student.Department;
                            cleanYear = student.Year;
                            cleanSec = student.Section;
                            cleanCourse = student.Category ?? "UG";
                        }
                    }
                }
                else if (User.IsInRole("Staff"))
                {
                    var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    if (int.TryParse(staffIdClaim, out var staffId))
                    {
                        var staff = await _context.Staffs.FindAsync(staffId);
                        if (staff != null)
                        {
                            cleanDept = staff.Department;
                            cleanYear = staff.Year;
                            cleanSec = staff.Section;
                            cleanCourse = staff.Category ?? "UG";
                        }
                    }
                }
            }

            var q = _context.WorkingDayOverrides.AsNoTracking()
                .Where(o => string.Compare(o.Date, fromDate) >= 0 && string.Compare(o.Date, toDate) <= 0);

            if (!string.IsNullOrEmpty(cleanDept))
            {
                q = q.Where(o => o.Department == null || o.Department == "" || o.Department.ToLower() == cleanDept.ToLower() || o.Department.ToLower().Contains(cleanDept.ToLower()) || cleanDept.ToLower().Contains(o.Department.ToLower()));
            }
            if (cleanYear.HasValue)
            {
                q = q.Where(o => o.Year == null || o.Year == 0 || o.Year == cleanYear.Value);
            }
            if (!string.IsNullOrEmpty(cleanSec))
            {
                q = q.Where(o => o.Section == null || o.Section == "" || o.Section.ToLower() == "all" || o.Section.ToLower() == cleanSec.ToLower());
            }
            if (!string.IsNullOrEmpty(cleanCourse))
            {
                q = q.Where(o => o.Course == null || o.Course == "" || o.Course.ToLower() == cleanCourse.ToLower() || cleanCourse.ToLower().Contains(o.Course.ToLower()));
            }

            var dbOverrides = await q.OrderBy(o => o.Date).ToListAsync();
            var staffListCheck = await _context.Staffs.AsNoTracking().Where(s => s.IsActive).ToListAsync();
            var list = dbOverrides.Select(o =>
            {
                var matchedStaff = staffListCheck.FirstOrDefault(s =>
                    (!string.IsNullOrEmpty(o.Department) && (s.Department == o.Department || s.Department.Contains(o.Department) || o.Department.Contains(s.Department))) &&
                    (!o.Year.HasValue || o.Year == 0 || s.Year == o.Year) &&
                    (string.IsNullOrEmpty(o.Section) || o.Section == "All" || s.Section == o.Section)
                );
                if (matchedStaff == null && !string.IsNullOrEmpty(o.Department))
                {
                    matchedStaff = staffListCheck.FirstOrDefault(s => s.Department == o.Department || s.Department.Contains(o.Department) || o.Department.Contains(s.Department));
                }
                return new SpecialDayItem
                {
                    Id = o.Id,
                    Date = o.Date,
                    DayType = o.DayType ?? (o.IsWorking ? "Working" : "Holiday"),
                    Name = o.Name ?? (o.IsWorking ? "Working Day" : "Holiday"),
                    Department = o.Department,
                    Course = o.Course,
                    Year = o.Year,
                    Section = o.Section,
                    AddedBy = matchedStaff?.Name ?? "Staff"
                };
            }).ToList();

            if (list.Count == 0)
            {
                list = WorkingDaysCalendar.GetSpecialDaysInRange(fromDate, toDate, cleanDept, cleanYear, cleanSec);
            }

            return Ok(new
            {
                hasSpecialDays = list.Count > 0,
                count = list.Count,
                specialDays = list
            });
        }

        // PUT /api/WorkingDay/{date}
        // Body: { "isWorking": true|false, "dayType": "Holiday"|"Examination", "name": "...", "department": "...", "year": 1, "section": "A" }
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpPut("{date}")]
        public async Task<IActionResult> EditDay(string date, [FromBody] EditWorkingDayDto dto)
        {
            if (string.IsNullOrWhiteSpace(date))
                return BadRequest(new { message = "Date is required." });

            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _context.Staffs.FindAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                dto.Department = authStaff.Department;
                dto.Year = authStaff.Year;
                dto.Section = authStaff.Section;
                dto.Course = authStaff.Category ?? "UG";
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _context.Hods.FindAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                dto.Department = authHod.Department;
                dto.Course = authHod.Category ?? "UG";
            }

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
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpDelete("{date}")]
        public async Task<IActionResult> RemoveDay(string date)
        {
            return await EditDay(date, new EditWorkingDayDto { IsWorking = false, DayType = "Holiday", Name = "Holiday" });
        }

        // POST /api/WorkingDay/EditCalendar & POST /api/WorkingDay/AddCalendar (alias)
        // Body: { "fromDate": "YYYY-MM-DD", "toDate": "YYYY-MM-DD", "dayType": "Holiday"|"Examination", "name": "Pongal", "department": "...", "year": 2, "section": "A" }
        [Authorize(Roles = "Staff,HOD,Admin")]
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

            string creatorName = "Staff";

            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _context.Staffs.FindAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                dto.Department = authStaff.Department;
                dto.Year = authStaff.Year;
                dto.Section = authStaff.Section;
                dto.Course = authStaff.Category ?? "UG";
                creatorName = authStaff.Name;
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _context.Hods.FindAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                dto.Department = authHod.Department;
                dto.Course = authHod.Category ?? "UG";
                creatorName = authHod.Name;
            }
            else
            {
                creatorName = !string.IsNullOrWhiteSpace(dto.AddedBy) ? dto.AddedBy.Trim() : (!string.IsNullOrWhiteSpace(dto.StaffName) ? dto.StaffName.Trim() : "Admin");
            }

            bool isWorking = dto.IsWorking ?? (!dayType.Equals("Holiday", StringComparison.OrdinalIgnoreCase));
            var cleanDept = string.IsNullOrWhiteSpace(dto.Department) ? null : dto.Department.Trim();
            var cleanCourse = string.IsNullOrWhiteSpace(dto.Course) ? null : dto.Course.Trim();
            var cleanSec = string.IsNullOrWhiteSpace(dto.Section) || dto.Section.Equals("All", StringComparison.OrdinalIgnoreCase) ? null : dto.Section.Trim();
            var cleanYear = (dto.Year.HasValue && dto.Year.Value > 0) ? dto.Year.Value : (int?)null;

            // If an original name or date was provided during edit, remove prior range if changed
            if (!string.IsNullOrWhiteSpace(dto.OriginalName) && (!string.Equals(dto.OriginalName, name, StringComparison.OrdinalIgnoreCase) ||
                (dto.OriginalFromDate != null && dto.OriginalFromDate != dto.FromDate) ||
                (dto.OriginalToDate != null && dto.OriginalToDate != dto.ToDate)))
            {
                var oldRecords = await _context.WorkingDayOverrides.Where(o =>
                    o.Name == dto.OriginalName &&
                    (cleanDept == null || o.Department == cleanDept) &&
                    (cleanYear == null || o.Year == cleanYear) &&
                    (cleanSec == null || o.Section == cleanSec)).ToListAsync();

                if (oldRecords.Count > 0)
                {
                    _context.WorkingDayOverrides.RemoveRange(oldRecords);
                }
            }

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

            // Apply to live memory with assigned Ids and creator name
            foreach (var rec in recordsToApply)
            {
                WorkingDaysCalendar.ApplyOverride(rec.Date, rec.IsWorking, rec.DayType, rec.Name,
                    rec.Department, rec.Course, rec.Year, rec.Section, rec.Id, creatorName);
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

        // POST /api/WorkingDay/DeleteCalendar
        // Deletes a configured Holiday / Examination entry (or range) and resets the dates
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpPost("DeleteCalendar")]
        public async Task<IActionResult> DeleteCalendar([FromBody] DeleteCalendarDto dto)
        {
            if (dto == null)
                return BadRequest(new { message = "Delete payload is required." });

            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _context.Staffs.FindAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                if (dto.Id.HasValue && dto.Id.Value > 0)
                {
                    var target = await _context.WorkingDayOverrides.FindAsync(dto.Id.Value);
                    if (target != null)
                    {
                        var staffDept = (authStaff.Department ?? "").Trim().ToLower();
                        var targetDept = (target.Department ?? "").Trim().ToLower();
                        if (staffDept != targetDept)
                            return StatusCode(403, new { message = "You are not authorized to delete calendar entries outside of your department." });
                    }
                }
                else
                {
                    dto.Department = authStaff.Department;
                    dto.Year = authStaff.Year;
                    dto.Section = authStaff.Section;
                }
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _context.Hods.FindAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                if (dto.Id.HasValue && dto.Id.Value > 0)
                {
                    var target = await _context.WorkingDayOverrides.FindAsync(dto.Id.Value);
                    if (target != null)
                    {
                        var hodDept = (authHod.Department ?? "").Trim().ToLower();
                        var targetDept = (target.Department ?? "").Trim().ToLower();
                        if (hodDept != targetDept)
                            return StatusCode(403, new { message = "You are not authorized to delete calendar entries outside of your department." });
                    }
                }
                else
                {
                    dto.Department = authHod.Department;
                }
            }

            var query = _context.WorkingDayOverrides.AsQueryable();

            if (dto.Id.HasValue && dto.Id.Value > 0)
            {
                query = query.Where(o => o.Id == dto.Id.Value);
            }
            else
            {
                if (!string.IsNullOrWhiteSpace(dto.FromDate) && !string.IsNullOrWhiteSpace(dto.ToDate))
                {
                    query = query.Where(o => string.Compare(o.Date, dto.FromDate) >= 0 && string.Compare(o.Date, dto.ToDate) <= 0);
                }
                else if (!string.IsNullOrWhiteSpace(dto.Date))
                {
                    query = query.Where(o => o.Date == dto.Date);
                }

                if (!string.IsNullOrWhiteSpace(dto.Name))
                {
                    var cleanName = dto.Name.Trim();
                    query = query.Where(o => o.Name == cleanName);
                }

                if (!string.IsNullOrWhiteSpace(dto.DayType))
                {
                    var cleanType = dto.DayType.Trim();
                    query = query.Where(o => o.DayType == cleanType);
                }

                if (!string.IsNullOrWhiteSpace(dto.Department))
                {
                    var cleanDept = dto.Department.Trim();
                    query = query.Where(o => o.Department == cleanDept || o.Department == null || o.Department == "");
                }

                if (dto.Year.HasValue && dto.Year.Value > 0)
                {
                    query = query.Where(o => o.Year == dto.Year.Value || o.Year == null || o.Year == 0);
                }

                if (!string.IsNullOrWhiteSpace(dto.Section) && !dto.Section.Equals("All", StringComparison.OrdinalIgnoreCase))
                {
                    var cleanSec = dto.Section.Trim();
                    query = query.Where(o => o.Section == cleanSec || o.Section == null || o.Section == "" || o.Section == "All");
                }
            }

            var toRemove = await query.ToListAsync();
            if (toRemove.Count > 0)
            {
                _context.WorkingDayOverrides.RemoveRange(toRemove);
                await _context.SaveChangesAsync();

                // Reload all remaining overrides into live WorkingDaysCalendar
                var allRemaining = await _context.WorkingDayOverrides.AsNoTracking().ToListAsync();
                WorkingDaysCalendar.LoadOverrides(allRemaining);
            }

            return Ok(new
            {
                message = $"Successfully deleted {toRemove.Count} calendar record(s).",
                deletedCount = toRemove.Count
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
        public string? OriginalName { get; set; }
        public string? OriginalFromDate { get; set; }
        public string? OriginalToDate { get; set; }
        public string? AddedBy { get; set; }
        public string? StaffName { get; set; }
    }

    public class DeleteCalendarDto
    {
        public int? Id { get; set; }
        public string? Date { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public string? DayType { get; set; }
        public string? Name { get; set; }
        public string? Department { get; set; }
        public string? Course { get; set; }
        public int? Year { get; set; }
        public string? Section { get; set; }
    }
}
