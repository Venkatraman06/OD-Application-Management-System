using MailKit.Net.Smtp;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
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

        //dependancy injection of services
        public StaffController(IStaffService staffService, IOdApplyService odService
             , IHodService hodService, EmailService emailService)
        {
            _staffService = staffService;
            _odService = odService;
          
            _hodService = hodService;
            _emailService = emailService;
        }
        //this will get all the staff details from my database

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var staffs = await _staffService.GetAllStaffAsync();
            return Ok(staffs);
        }
        //this will get the staff details by id from the database
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var staff = await _staffService.GetStaffByIdAsync(id);
            return Ok(staff);
        }
        //this will add the staff details to the database 
        [HttpPost]
        public async Task<IActionResult> AddStaff([FromBody] Staff staff)
        {
            var added = await _staffService.AddStaffAsync(staff);
            return Ok(added);
        }
        //this will update the staff details in the database
        [HttpPut]
        public async Task<IActionResult> UpdateStaff([FromBody] Staff staff)
        {
            var updated = await _staffService.UpdateStaffAsync(staff);
            return Ok(updated);
        }
        //this will delete the staff details from the database
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStaff(int id)
        {
            var result = await _staffService.DeleteStaffAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }
        //this will check the login credentials of the staff and return the staff details if the credentials are correct
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
                department = staff.Department
            });
        }
        //this will get the pending OD requests of the staff's department from the database
        [HttpGet("PendingODs/{department}")]
        public async Task<IActionResult> GetPendingODs(string department)
        {
            var ods = await _odService.GetByDepartmentAsync(department);
            return Ok(ods);
        }
      //this will update faculty status of OD and after approving it will send the email to hod
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
                // this part will send email to the HOD of the same department to approve the OD request
                try
                {
                    var hods = await _hodService.GetAllHodAsync();
                    var hod = hods.FirstOrDefault(h =>
                        h.Department != null &&
                        h.Department.Trim().ToLower() == od.department.Trim().ToLower());

                    if (hod != null && !string.IsNullOrEmpty(hod.Email))
                    {
                        await _emailService.SendOdApprovalEmailAsync(
                            toEmail: hod.Email,
                            hodName: hod.Name,
                            studentName: od.StudentName,
                            registerNumber: od.registerNumber,
                            eventName: od.Event,
                            department: od.department,
                            fromDate: od.FromDate,
                            toDate: od.ToDate
                        );
                    }
                }
                catch (Exception ex)
                {
                    // Email failure should not block the approval response
                    Console.WriteLine($"Email error: {ex.Message}");
                }
            }

            return Ok(od);
        }
    }
}