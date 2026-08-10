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


        // this will login the student by checking the login credentials with database and return   
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] StudentLoginDto dto)
        {
            if (dto == null || string.IsNullOrEmpty(dto.RegisterNumber) || string.IsNullOrEmpty(dto.Password))
                return BadRequest("RegisterNumber and Password are required");

            var student = await _studentService.LoginAsync(dto.RegisterNumber, dto.Password);

            if (student == null)
                return Unauthorized("Invalid register number or password");

            return Ok(new
            {
                studentId = student.StudentId,
                name = student.Name,
                registerNumber = student.RegisterNumber,
                department = student.Department,
                section = student.Section,
                year = student.Year,
                dob = student.DOB,
                semester = student.semester
            });
        }
    }
}