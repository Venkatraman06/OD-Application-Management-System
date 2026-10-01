using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OnlineOD.Dtos;
using OnlineOD.Models;
using OnlineOD.Service;
using System.Security.Claims;

namespace OnlineOD.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class StudentController : ControllerBase
    {
        private readonly IStudentService _studentService;
        private readonly IStaffService _staffService;
        private readonly IHodService _hodService;
        private readonly IJwtTokenService _jwtTokenService;

        public StudentController(IStudentService studentService, IStaffService staffService, IHodService hodService, IJwtTokenService jwtTokenService)
        {
            _studentService = studentService;
            _staffService = staffService;
            _hodService = hodService;
            _jwtTokenService = jwtTokenService;
        }

        // GET /api/Student - Student lookup and Admin student management
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet]
        public async Task<IActionResult> GetAllStudents()
        {
            var students = await _studentService.GetAllStudentsAsync();

            if (User.IsInRole("Admin"))
            {
                var adminList = students.Select(s => new
                {
                    studentId = s.StudentId,
                    name = s.Name,
                    registerNumber = s.RegisterNumber,
                    department = s.Department,
                    section = s.Section,
                    year = s.Year,
                    semester = s.semester,
                    dob = s.DOB,
                    email = s.Email,
                    isActive = s.IsActive
                });
                return Ok(adminList);
            }

            var lookupList = students.Select(s => new
            {
                studentId = s.StudentId,
                name = s.Name,
                registerNumber = s.RegisterNumber,
                department = s.Department,
                section = s.Section,
                year = s.Year,
                isActive = s.IsActive
            });
            return Ok(lookupList);
        }


        //  this will get the student details by id from the database
        [Authorize(Roles = "Student,Staff,HOD,Admin")]
        [HttpGet("{id}")]
        public async Task<IActionResult> GetStudentById(int id)
        {
            if (User.IsInRole("Student"))
            {
                var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId != id)
                {
                    return StatusCode(403, new { message = "You are not authorized to view another student's profile." });
                }
            }

            var student = await _studentService.GetStudentByIdAsync(id);
            if (student == null) return NotFound();

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

        // Validate a register number exists — used when adding a Group OD
        // member, so only real students can be added to the group.
        // GET /api/Student/ValidateRegisterNumber/{regNo}
        [AllowAnonymous]
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
        [Authorize(Roles = "Admin")]
        [HttpPost]
        public async Task<IActionResult> AddStudent([FromBody] Student student)
        {
            if (student == null) return BadRequest();
            var added = await _studentService.AddStudentAsync(student);
            var safeAdded = new
            {
                studentId = added.StudentId,
                name = added.Name,
                registerNumber = added.RegisterNumber,
                department = added.Department,
                section = added.Section,
                year = added.Year,
                dob = added.DOB,
                semester = added.semester,
                email = added.Email,
                isActive = added.IsActive
            };
            return CreatedAtAction(nameof(GetStudentById), new { id = added.StudentId }, safeAdded);
        }


        // this will update the student details in the database
        [Authorize(Roles = "Student,Admin")]
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateStudent(int id, [FromBody] Student student)
        {
            if (student == null) return BadRequest();

            if (User.IsInRole("Student"))
            {
                var studentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(studentIdClaim) || !int.TryParse(studentIdClaim, out var authStudentId) || authStudentId != id)
                {
                    return StatusCode(403, new { message = "You are not authorized to update another student's profile." });
                }

                var existing = await _studentService.GetStudentByIdAsync(id);
                if (existing == null) return NotFound();

                // Allow updating only self-editable profile fields, keeping institutional/identity fields locked
                var safeStudent = new Student
                {
                    StudentId = existing.StudentId,
                    Name = !string.IsNullOrWhiteSpace(student.Name) ? student.Name.Trim() : existing.Name,
                    RegisterNumber = existing.RegisterNumber, // Locked
                    Department = existing.Department,         // Locked
                    Section = existing.Section,               // Locked
                    Year = existing.Year,                     // Locked
                    semester = existing.semester,             // Locked
                    IsActive = existing.IsActive,             // Locked
                    DOB = student.DOB != default(DateTime) ? student.DOB : existing.DOB,
                    Email = !string.IsNullOrWhiteSpace(student.Email) ? student.Email.Trim() : existing.Email,
                    Password = !string.IsNullOrWhiteSpace(student.Password) ? student.Password : existing.Password
                };

                var updated = await _studentService.UpdateStudentAsync(safeStudent);
                return Ok(new
                {
                    studentId = updated.StudentId,
                    name = updated.Name,
                    registerNumber = updated.RegisterNumber,
                    department = updated.Department,
                    section = updated.Section,
                    year = updated.Year,
                    dob = updated.DOB,
                    semester = updated.semester,
                    email = updated.Email,
                    isActive = updated.IsActive
                });
            }
            else
            {
                if (student.StudentId != id) return BadRequest();
                var updated = await _studentService.UpdateStudentAsync(student);
                if (updated == null) return NotFound();
                return Ok(new
                {
                    studentId = updated.StudentId,
                    name = updated.Name,
                    registerNumber = updated.RegisterNumber,
                    department = updated.Department,
                    section = updated.Section,
                    year = updated.Year,
                    dob = updated.DOB,
                    semester = updated.semester,
                    email = updated.Email,
                    isActive = updated.IsActive
                });
            }
        }


        // this will delete the student details from the database
        [Authorize(Roles = "Admin")]
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteStudent(int id)
        {
            var result = await _studentService.DeleteStudentAsync(id);
            if (!result) return NotFound();
            return NoContent();
        }


        // GET /api/Student/BySection?department=CS&section=B
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpGet("BySection")]
        public async Task<IActionResult> GetBySection([FromQuery] string department, [FromQuery] string? section = null)
        {
            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                department = authStaff.Department ?? "";
                section = authStaff.Section;
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _hodService.GetHodByIdAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                department = authHod.Department ?? "";
            }

            var list = await _studentService.GetStudentsBySectionAsync(department, section);
            return Ok(list);
        }

        // GET /api/Student/OdHistory?department=CSE&section=A
        [Authorize(Roles = "Staff,HOD,Admin")]
        [HttpGet("OdHistory")]
        public async Task<IActionResult> GetOdHistory([FromQuery] string? department = null, [FromQuery] string? section = null)
        {
            if (User.IsInRole("Staff"))
            {
                var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                    return Unauthorized(new { message = "Invalid or missing staff authentication token." });

                var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
                if (authStaff == null || !authStaff.IsActive)
                    return StatusCode(403, new { message = "Your staff account has been deactivated." });

                department = authStaff.Department;
                section = authStaff.Section;
            }
            else if (User.IsInRole("HOD"))
            {
                var hodIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(hodIdClaim) || !int.TryParse(hodIdClaim, out var authHodId) || authHodId <= 0)
                    return Unauthorized(new { message = "Invalid or missing HOD authentication token." });

                var authHod = await _hodService.GetHodByIdAsync(authHodId);
                if (authHod == null || !authHod.IsActive)
                    return StatusCode(403, new { message = "HOD account not found or deactivated." });

                department = authHod.Department;
            }

            var list = await _studentService.GetStudentsOdHistoryAsync(department, section);
            return Ok(list);
        }

        // PUT /api/Student/{studentId}/ToggleStatus?staffId=1
        // Authenticated Staff identity resolved from JWT ClaimTypes.NameIdentifier.
        // The optional staffId query param is ignored on the server for identity decisions.
        [Authorize(Roles = "Staff")]
        [HttpPut("{studentId}/ToggleStatus")]
        public async Task<IActionResult> ToggleStatus(int studentId, [FromQuery] int? staffId = null)
        {
            var staffIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(staffIdClaim) || !int.TryParse(staffIdClaim, out var authStaffId) || authStaffId <= 0)
                return Unauthorized(new { message = "Invalid or missing staff authentication token." });

            var authStaff = await _staffService.GetStaffByIdAsync(authStaffId);
            if (authStaff == null || !authStaff.IsActive)
                return StatusCode(403, new { message = "Your staff account has been deactivated." });

            try
            {
                var updated = await _studentService.ToggleStudentStatusAsync(studentId, authStaffId);
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

            var token = _jwtTokenService.GenerateStudentToken(student);

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
                isActive = student.IsActive,
                token = token
            });
        }
    }
}