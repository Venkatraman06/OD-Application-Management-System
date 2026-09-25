using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StudentController : ControllerBase
    {
        private readonly IStudentService _studentService;

        public StudentController(IStudentService studentService)
        {
            _studentService = studentService;
        }

        //this will get all the student details from my database
        [HttpGet]
        public async Task<IActionResult> GetAllStudents()
        {
            var students = await _studentService.GetAllStudentsAsync();
            return Ok(students);
        }


        //  this will get the student details by id from the database
        [HttpGet("{id}")]
        public async Task<IActionResult> GetStudentById(int id)
        {
            var student = await _studentService.GetStudentByIdAsync(id);
            if (student == null) return NotFound();
            return Ok(student);
        }

        // Validate a register number exists — used when adding a Group OD
        // member, so only real students can be added to the group.
        // GET /api/Student/ValidateRegisterNumber/{regNo}
        [HttpGet("ValidateRegisterNumber/{regNo}")]
        public async Task<IActionResult> ValidateRegisterNumber(string regNo)
        {
            if (string.IsNullOrWhiteSpace(regNo))
                return BadRequest(new { message = "Register number is required" });

            var student = await _studentService.GetByRegisterNumberAsync(regNo.Trim());
            if (student == null)
                return NotFound(new { message = "No user found" });

            if (!student.IsActive)
                return BadRequest(new { message = $"The student with register number {student.RegisterNumber} has been deactivated by their class advisor and cannot be added to the Group OD." });

            return Ok(new { name = student.Name, registerNumber = student.RegisterNumber, department = student.Department });
        }


        // this will add the student details to the database
        [HttpPost]
        public async Task<IActionResult> AddStudent([FromBody] Student student)
        {
            if (student == null) return BadRequest();
            var added = await _studentService.AddStudentAsync(student);
            return CreatedAtAction(nameof(GetStudentById), new { id = added.StudentId }, added);
        }


        // this will update the student details in the database
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateStudent(int id, [FromBody] Student student)
        {
            if (student == null || student.StudentId != id) return BadRequest();
            var updated = await _studentService.UpdateStudentAsync(student);
            if (updated == null) return NotFound();
            return Ok(updated);
        }


        // this will delete the student details from the database
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStudent(int id)
        {
            var result = await _studentService.DeleteStudentAsync(id);
            if (!result) return NotFound();
            return NoContent();
        }


        // GET /api/Student/BySection?department=CS&section=B
        [HttpGet("BySection")]
        public async Task<IActionResult> GetBySection([FromQuery] string department, [FromQuery] string? section = null)
        {
            var list = await _studentService.GetStudentsBySectionAsync(department, section);
            return Ok(list);
        }

        // GET /api/Student/OdHistory?department=CSE&section=A
        [HttpGet("OdHistory")]
        public async Task<IActionResult> GetOdHistory([FromQuery] string? department = null, [FromQuery] string? section = null)
        {
            var list = await _studentService.GetStudentsOdHistoryAsync(department, section);
            return Ok(list);
        }

        // PUT /api/Student/{studentId}/ToggleStatus?staffId=1
        [HttpPut("{studentId}/ToggleStatus")]
        public async Task<IActionResult> ToggleStatus(int studentId, [FromQuery] int staffId)
        {
            if (staffId <= 0)
                return BadRequest(new { message = "staffId is required" });

            try
            {
                var updated = await _studentService.ToggleStudentStatusAsync(studentId, staffId);
                if (updated == null)
                    return NotFound(new { message = "Student not found" });

                return Ok(new
                {
                    studentId = updated.StudentId,
                    name = updated.Name,
                    registerNumber = updated.RegisterNumber,
                    isActive = updated.IsActive
                });
            }
            catch (UnauthorizedAccessException ex)
            {
                return StatusCode(403, new { message = ex.Message });
            }
        }

        // this will login the student by checking the login credentials with database and return   
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] StudentLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.RegisterNumber) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("RegisterNumber and Password are required");

            var student = await _studentService.LoginAsync(dto.RegisterNumber, dto.Password);

            if (student == null)
                return Unauthorized("Invalid register number or password");

            if (!student.IsActive)
                return StatusCode(403, new { message = "Your account has been deactivated. Please contact the administrator." });

            return Ok(new
            {
                studentId = student.StudentId,
                name = student.Name,
                registerNumber = student.RegisterNumber,
                department = student.Department,
                section = student.Section,
                year = student.Year,
                dob = student.DOB,
                semester = student.semester,
                email = student.Email,
                isActive = student.IsActive
            });
        }
    }
}