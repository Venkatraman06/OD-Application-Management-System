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

        // Approve/Reject by faculty — then email HOD with clickable buttons
        [HttpPut("Approve/{odId}")]
        public async Task<IActionResult> Approve(int odId, [FromQuery] string status)
        {
            if (string.IsNullOrEmpty(status))
                return BadRequest("Status is required");

            if (status != "Approved" && status != "Rejected")
                return BadRequest("Status must be Approved or Rejected");

            var od = await _odService.UpdateFacultyStatusAsync(odId, status);
            if (od == null) return NotFound("OD request not found");

            if (status == "Approved")
            {
                try
                {
                    var hods = await _hodService.GetAllHodAsync();
                    var hod = hods.FirstOrDefault(h =>
                        h.Department != null &&
                        h.Department.Trim().ToLower() == (od.department ?? "").Trim().ToLower());

                    if (hod != null && !string.IsNullOrEmpty(hod.Email))
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
                            groupName: od.GroupName ?? ""
                        );
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Email error: {ex.Message}");
                }
            }

            return Ok(od);
        }
    }
}