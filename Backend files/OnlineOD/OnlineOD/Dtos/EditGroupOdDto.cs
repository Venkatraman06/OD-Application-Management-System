namespace OnlineOD.Dtos
{
    // Payload for a student editing their own OD (Solo or Group)
    public class EditGroupOdDto
    {
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public string? StartTime { get; set; }
        public string? EndTime { get; set; }
        public int NumberOfDays { get; set; }
        public string? Event { get; set; }
        public string? CompetitionType { get; set; }
        public string? Reason { get; set; }
        public string? CollegeIndustry { get; set; }
        public string? GroupName { get; set; }
        public string? RegisterNumbers { get; set; } // comma-separated list of member register numbers
    }
}