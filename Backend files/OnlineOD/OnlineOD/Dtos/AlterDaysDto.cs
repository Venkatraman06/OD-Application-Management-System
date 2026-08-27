namespace OnlineOD.Dtos
{
    public class AlterDaysDto
    {
        public string FromDate { get; set; } = string.Empty;
        public string ToDate { get; set; } = string.Empty;
        // NumberOfDays is recomputed server-side; client may also send it as a hint
        public int? NumberOfDays { get; set; }
    }
}