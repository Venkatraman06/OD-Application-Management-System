namespace OnlineOD.Dtos
{
    public class StudentLoginDto
    {
        public string RegisterNumber { get; set; }
        public string Password { get; set; }
    }

    public class StaffLoginDto
    {
        public string Name { get; set; }
        public string Password { get; set; }
    }

    public class HodDto
    {
        public int HodId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? RollNumber { get; set; }
        public string Department { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string? Password { get; set; }
        public string Category { get; set; } = "UG";
    }

    public class AdminLoginDto
    {
        public string AdminId { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class UpdateStudentDto
    {
        public int StudentId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string RegisterNumber { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string? Section { get; set; }
        public int Year { get; set; }
        public DateTime DOB { get; set; }
        public int semester { get; set; }
        public string? Password { get; set; }
        public string? Email { get; set; }
        public string Category { get; set; } = "UG";
        public bool IsActive { get; set; } = true;
    }

    public class UpdateStaffDto
    {
        public int StaffId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string RollNumber { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string? Section { get; set; }
        public int? Year { get; set; }
        public string? Password { get; set; }
        public string Email { get; set; } = string.Empty;
        public string Category { get; set; } = "UG";
        public bool IsActive { get; set; } = true;
    }
}