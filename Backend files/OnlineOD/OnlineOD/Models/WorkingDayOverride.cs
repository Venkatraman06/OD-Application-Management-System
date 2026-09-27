using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    // A single HOD-made edit to the published working-days calendar.
    // Date is stored as "yyyy-MM-dd". IsWorking = false means the HOD
    // removed that date from the calendar (marked it a holiday);
    // IsWorking = true means the HOD added/restored it as a working day.
    public class WorkingDayOverride
    {
        [Key]
        public string Date { get; set; } = string.Empty;
        public bool IsWorking { get; set; }
        public string? DayType { get; set; } // "Holiday" | "Examination"
        public string? Name { get; set; }    // e.g. "Pongal", "Semester Examination"
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }
}