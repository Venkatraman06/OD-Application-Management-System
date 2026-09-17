namespace OnlineOD.Dtos
{
    public class AlterDaysDto
    {
        public string FromDate { get; set; } = string.Empty;
        public string ToDate { get; set; } = string.Empty;
        public string? StartTime { get; set; }
        public string? EndTime { get; set; }
        // NumberOfDays is recomputed server-side; client may also send it as a hint
        public int? NumberOfDays { get; set; }
        // Which dashboard is editing ("faculty" or "hod") — determines whether
        // FacultyStatus or HodStatus must be Pending for the edit to be allowed.
        public string Role { get; set; } = "faculty";
    }
}