using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class Staff
    {
        [Key]
        public int StaffId { get; set; }
        public string Name { get; set; }
        public string RollNumber { get; set; }
        public string Department { get; set; }
        public string Password { get; set; }

        public string Email { get; set; }
    }
}
