using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class HodController : ControllerBase
    {
        private readonly IHodService _hodService;
        private readonly IOdApplyService _odService;
        //dependancy injection of services
        public HodController(IHodService hodService, IOdApplyService odService)
        {
            _hodService = hodService;
            _odService = odService;
        }


        //this will get all the hod details from my database
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var hods = await _hodService.GetAllHodAsync();
            return Ok(hods);
        }


        //this will get the hod details by id from the database
        [HttpGet("{id}")]
        public async Task<IActionResult> GetById(int id)
        {
            var hod = await _hodService.GetHodByIdAsync(id);
            return Ok(hod);
        }


        //this will add the hod details to the database
        [HttpPost]
        public async Task<IActionResult> AddHod([FromBody] Hod hod)
        {
            var added = await _hodService.AddHodAsync(hod);
            return Ok(added);
        }


        //this will update the hod details in the database
        [HttpPut]
        public async Task<IActionResult> UpdateHod([FromBody] Hod hod)
        {
            var updated = await _hodService.UpdateHodAsync(hod);
            return Ok(updated);
        }


        //this will delete the hod details from the database
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteHod(int id)
        {
            var result = await _hodService.DeleteHodAsync(id);
            if (!result) return NotFound();
            return Ok(result);
        }


        // this will login the hod by checking the login credentials with database and return 
        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] StaffLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.Name) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("Username and Password are required");

            var hod = await _hodService.LoginAsync(dto.Name, dto.Password);
            if (hod == null)
                return Unauthorized("Invalid username or password");

            return Ok(new
            {
                hodId = hod.HodId,
                name = hod.Name,
                department = hod.Department
            });
        }


        // this will get all the OD requests that are approved by the faculty for a specific department
        [HttpGet("ApprovedByFaculty/{department}")]
        public async Task<IActionResult> GetApprovedByFaculty(string department)
        {
            var ods = await _odService.GetApprovedByFacultyAsync(department);
            return Ok(ods);
        }


        // this will update the HOD approval status of the OD request and return the updated OD request details
        [HttpPut("FinalApprove/{odId}")]
        public async Task<IActionResult> FinalApprove(int odId, [FromQuery] string status)
        {
            if (string.IsNullOrEmpty(status))
                return BadRequest("Status is required");

            if (status != "Approved" && status != "Rejected")
                return BadRequest("Status must be Approved or Rejected");

            var od = await _odService.UpdateHodStatusAsync(odId, status);
            if (od == null) return NotFound("OD request not found");

            return Ok(od);
        }
    }
}