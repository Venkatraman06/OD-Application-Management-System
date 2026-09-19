namespace OnlineOD.Dtos
{
    public class StudentOdHistoryDto
    {
        public int StudentId { get; set; }
        public string StudentName { get; set; } = string.Empty;
        public string RegisterNumber { get; set; } = string.Empty;
        public string Class { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string? Section { get; set; }
        public int Year { get; set; }
        public int TotalOdCount { get; set; }
        public int ApprovedCount { get; set; }
        public int RejectedCount { get; set; }
    }
}
