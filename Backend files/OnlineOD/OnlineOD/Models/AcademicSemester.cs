using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class AcademicSemester
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Category { get; set; } = "UG"; // "UG" or "PG"

        [Required]
        public int Year { get; set; } // 1, 2, 3, 4

        [Required]
        public int Semester { get; set; } // 1, 2, ..., 8

        [Required]
        public string StartDate { get; set; } = string.Empty; // YYYY-MM-DD

        [Required]
        public string EndDate { get; set; } = string.Empty; // YYYY-MM-DD

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
