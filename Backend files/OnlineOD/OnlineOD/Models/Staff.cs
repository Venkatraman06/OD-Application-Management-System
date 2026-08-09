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

        // The class section this staff member teaches (e.g. "A", "B"). OD
        // requests are routed only to the staff whose Department + Section
        // match the applying student's own Department + Section.
        public string? Section { get; set; }

        public string Password { get; set; }

        public string Email { get; set; }
    }
}