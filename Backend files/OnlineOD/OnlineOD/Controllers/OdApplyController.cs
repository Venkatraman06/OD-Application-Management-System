using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Service;
using OnlineOD.Services;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class OdApplyController : ControllerBase
    {
        private readonly IOdApplyService _service;
        private readonly IStaffService _staffService;
        private readonly EmailService _emailService;

        public OdApplyController(IOdApplyService service, IStaffService staffService,
            EmailService emailService)
        {
            _service = service;
            _staffService = staffService;
            _emailService = emailService;
        }
        // Get all OD applications
        [HttpGet]
        public async Task<IActionResult> GetAllOd()
        {
            var od = await _service.GetAllOdApplyAsync();
            return Ok(od);
        }
        // Get OD application by ID
        [HttpGet("{id}")]
        public async Task<IActionResult> GetOdById(int id)
        {
            var od = await _service.GetOdApplyByIdAsync(id);
            if (od == null) return NotFound();
            return Ok(od);
        }
        // Get OD applications by Student ID
        [HttpGet("Student-Od/{studentId}")]
        public async Task<IActionResult> GetByStudentId(int studentId)
        {
            var ods = await _service.GetByStudentIdAsync(studentId);
            return Ok(ods);
        }
        // Create a new OD application
        [HttpPost("OD-Apply")]
        public async Task<IActionResult> CreateOdApply([FromBody] OdApplyDto dto)
        {
            if (dto == null)
                return BadRequest("OD Apply data is required");

            var result = await _service.CreateOdApplyAsync(dto);

            // Send email notification to faculty of same department
            try
            {
                var staffList = await _staffService.GetAllStaffAsync();
                var staff = staffList.FirstOrDefault(s =>
                    s.Department != null &&
                    s.Department.Trim().ToLower() == dto.department.Trim().ToLower());

                if (staff != null && !string.IsNullOrEmpty(staff.Email))
                {
                    await _emailService.SendOdSubmissionEmailAsync(
                        toEmail: staff.Email,
                        staffName: staff.Name,
                        studentName: dto.StudentName,
                        registerNumber: dto.registerNumber,
                        eventName: dto.Event,
                        department: dto.department,
                        fromDate: dto.FromDate,
                        toDate: dto.ToDate
                    );
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Email error: {ex.Message}");
            }

            return Ok(result);
        }
        // Update an existing OD application
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteOd(int id)
        {
            var result = await _service.DeleteOdApplyAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }
    }
}