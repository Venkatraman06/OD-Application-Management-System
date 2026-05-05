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
}