using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    // A single calendar override / special day (Holiday / Examination) edit.
    public class WorkingDayOverride
    {
        [Key]
        public int Id { get; set; }
        public string Date { get; set; } = string.Empty;
        public bool IsWorking { get; set; }
        public string? DayType { get; set; } // "Holiday" | "Examination"
        public string? Name { get; set; }    // e.g. "Pongal", "Semester Examination"
        public string? Department { get; set; } // e.g. "Computer Science"
        public string? Course { get; set; }     // e.g. "B.Sc Computer Science"
        public int? Year { get; set; }          // e.g. 1, 2, 3
        public string? Section { get; set; }    // e.g. "A", "B", "C" or null (all)
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }
}
