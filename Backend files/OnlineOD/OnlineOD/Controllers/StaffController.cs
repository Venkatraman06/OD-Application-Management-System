using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;
using OnlineOD.Services;

namespace OnlineOD.Controllers
{
    [Route("api/Faculty")]
    [ApiController]
    public class StaffController : ControllerBase
    {
        private readonly IStaffService _staffService;
        private readonly IOdApplyService _odService;
        private readonly IHodService _hodService;
        private readonly EmailService _emailService;

        public StaffController(IStaffService staffService, IOdApplyService odService,
             IHodService hodService, EmailService emailService)
        {
            _staffService = staffService;
            _odService = odService;
            _hodService = hodService;
            _emailService = emailService;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var staffs = await _staffService.GetAllStaffAsync();
            return Ok(staffs);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var staff = await _staffService.GetStaffByIdAsync(id);
            return Ok(staff);
        }

        [HttpPost]
        public async Task<IActionResult> AddStaff([FromBody] Staff staff)
        {
            var added = await _staffService.AddStaffAsync(staff);
            return Ok(added);
        }

        [HttpPut]
        public async Task<IActionResult> UpdateStaff([FromBody] Staff staff)
        {
            var updated = await _staffService.UpdateStaffAsync(staff);
            return Ok(updated);
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStaff(int id)
        {
            var result = await _staffService.DeleteStaffAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }

        // GET /api/Faculty/ByDepartmentSection?department=CS&section=B
        // Finds the class staff assigned to a specific Department + Section
        // (the same routing rule used for PendingODs). Used by the printed
        // OD report to show the actual class staff's name in the Staff
        // Signature line, instead of just the department name.
        [HttpGet("ByDepartmentSection")]
        public async Task<IActionResult> GetByDepartmentSection([FromQuery] string department, [FromQuery] string? section = null)
        {
            if (string.IsNullOrWhiteSpace(department))
                return BadRequest("department is required");

            var allStaff = await _staffService.GetAllStaffAsync();
            var dept = department.Trim().ToLower();
            var sec = (section ?? "").Trim().ToLower();

            var match = allStaff.FirstOrDefault(s =>
                (s.Department ?? "").Trim().ToLower() == dept &&
                (string.IsNullOrEmpty(sec)
                    ? string.IsNullOrEmpty(s.Section)
                    : (s.Section ?? "").Trim().ToLower() == sec));

            // Fall back to any staff in the department if no exact section match
            match ??= allStaff.FirstOrDefault(s => (s.Department ?? "").Trim().ToLower() == dept);

            if (match == null) return NotFound();

            return Ok(new { name = match.Name, department = match.Department, section = match.Section });
        }

        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] StaffLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.Name) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("Username and Password are required");

            var staff = await _staffService.LoginAsync(dto.Name, dto.Password);
            if (staff == null)
                return Unauthorized("Invalid username or password");

            return Ok(new
            {
                facultyId = staff.StaffId,
                name = staff.Name,
                department = staff.Department,
                section = staff.Section
            });
        }

        // GET /api/Faculty/PendingODs/{department}?section=B
        // The optional section filter restricts results to only the OD
        // requests from students in that exact class section — this is what
        // makes a Section-B student's request visible only to Section-B
        // staff instead of every staff member in the department.
        [HttpGet("PendingODs/{department}")]
        public async Task<IActionResult> GetPendingODs(string department, [FromQuery] string? section = null)
        {
            var ods = await _odService.GetByDepartmentAsync(department, section);
            var withCerts = await _odService.AttachCertificatesAsync(ods);
            return Ok(withCerts);
        }

        // Approve/Reject by faculty — then email HOD with clickable buttons.
        // staffId identifies WHICH staff is deciding — required for group ODs
        // spanning multiple sections, so a Section-A staff can only decide on
        // Section-A members, and Section-B staff only on Section-B members.
        [HttpPut("Approve/{odId}")]
        public async Task<IActionResult> Approve(int odId, [FromQuery] string status, [FromQuery] int staffId)
        {
            if (string.IsNullOrEmpty(status))
                return BadRequest("Status is required");

            if (status != "Approved" && status != "Rejected")
                return BadRequest("Status must be Approved or Rejected");

            if (staffId <= 0)
                return BadRequest("staffId is required");

            // Block approve/reject once the OD is already ongoing (today falls
            // within its From/To range) — the decision window is meant to
            // close once the OD has actually started, not just once it ends.
            var existing = await _odService.GetOdApplyByIdAsync(odId);
            if (existing == null) return NotFound("OD request not found");
            if (IsOdOngoing(existing.FromDate, existing.ToDate))
                return BadRequest("This OD is already ongoing and can no longer be approved or rejected.");

            OdApply? od;
            try
            {
                od = await _odService.ApproveByStaffAsync(odId, status, staffId);
            }
            catch (InvalidOperationException ex)
            {
                // Thrown when this staff has no students from their own
                // section on this OD — nothing for them to decide.
                return BadRequest(ex.Message);
            }
            if (od == null) return NotFound("OD request not found");

            // Tracks whether the HOD notification email actually went out, and
            // why not if it didn't — this used to be swallowed silently, so
            // staff had no way of knowing the HOD was never notified.
            string emailStatus = "not_applicable";
            string emailDetail = null;

            // Only notify HOD once the OD's OVERALL FacultyStatus has actually
            // become "Approved" — for a multi-section group OD, that only
            // happens after EVERY involved section has made its own decision,
            // not just this one staff's own section.
            if (od.FacultyStatus == "Approved")
            {
                try
                {
                    var hods = await _hodService.GetAllHodAsync();
                    var hod = hods.FirstOrDefault(h =>
                        h.Department != null &&
                        h.Department.Trim().ToLower() == (od.department ?? "").Trim().ToLower());

                    if (hod == null)
                    {
                        emailStatus = "failed";
                        emailDetail = $"No HOD record found for department '{od.department}'. " +
                                      "Check that a HOD exists with this exact department name.";
                        Console.WriteLine($"[Email] HOD notify skipped — {emailDetail}");
                    }
                    else if (string.IsNullOrWhiteSpace(hod.Email))
                    {
                        emailStatus = "failed";
                        emailDetail = $"HOD '{hod.Name}' (department '{hod.Department}') has no Email set on their account.";
                        Console.WriteLine($"[Email] HOD notify skipped — {emailDetail}");
                    }
                    else
                    {
                        await _emailService.SendOdApprovalEmailAsync(
                            toEmail: hod.Email,
                            hodName: hod.Name,
                            studentName: od.StudentName ?? "",
                            registerNumber: od.registerNumber ?? "",
                            eventName: od.Event ?? "",
                            department: od.department ?? "",
                            fromDate: od.FromDate ?? "",
                            toDate: od.ToDate ?? "",
                            odId: od.OdId,
                            isGroup: od.IsGroupOd,
                            groupName: od.GroupName ?? "",
                            registerNumbers: od.RegisterNumbers ?? "",
                            collegeIndustry: od.CollegeIndustry ?? ""
                        );
                        emailStatus = "sent";
                        Console.WriteLine($"[Email] HOD notify sent to {hod.Email} for OD #{od.OdId}");
                    }
                }
                catch (Exception ex)
                {
                    emailStatus = "failed";
                    // Include the inner exception too — SMTP auth/connection
                    // failures (e.g. a revoked Gmail app password) usually put
                    // the real reason there, not in ex.Message.
                    emailDetail = ex.InnerException != null
                        ? $"{ex.Message} | Inner: {ex.InnerException.Message}"
                        : ex.Message;
                    Console.WriteLine($"[Email] HOD notify FAILED — {emailDetail}");
                }
            }

            return Ok(new
            {
                od.OdId,
                od.FacultyStatus,
                od.HodStatus,
                emailStatus,
                emailDetail
            });
        }

        // True while today falls within the OD's own From/To date range —
        // used to lock out approve/reject once the OD has actually started.
        private static bool IsOdOngoing(string? fromDateRaw, string? toDateRaw)
        {
            if (!DateTime.TryParse(fromDateRaw, out var from) || !DateTime.TryParse(toDateRaw, out var to))
                return false;
            var today = DateTime.Today;
            return today >= from.Date && today <= to.Date;
        }
    }
}