using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
namespace OnlineOD.Models
{
    public class Student
    {


        [Key]
        public int StudentId { get; set; }

        [Required]
        public string Name { get; set; }

        [Required]
        public string RegisterNumber { get; set; }

        [Required]
        public string Department { get; set; }

        // Class section (e.g. "A", "B") — routes this student's OD requests
        // to only the staff assigned to the same Department + Section.
        public string? Section { get; set; }

        [Required]
        public int Year { get; set; }

        [Required]
        public DateTime DOB { get; set; }

        [Required]
        public int semester { get; set; }

        // Store HASH, not plain password
        [Required]
        public string Password { get; set; }
    }
}