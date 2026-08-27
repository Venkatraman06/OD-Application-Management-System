namespace OnlineOD.Dtos
{
    public class OdApplyDto
    {
        public int StudentId { get; set; }
        public string? StudentName { get; set; }
        public string? registerNumber { get; set; }
        public string? department { get; set; }
        public string? Section { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public int NumberOfDays { get; set; }
        public string? Event { get; set; }
        public string? CompetitionType { get; set; } // e.g. Hackathon, Cultural, Sports, Technical, Other
        public string? Reason { get; set; }
        public string? CollegeIndustry { get; set; }

        // Group OD fields
        public bool IsGroupOd { get; set; } = false;
        public string? GroupName { get; set; }
        public string? RegisterNumbers { get; set; } // comma-separated list of member register numbers
    }
}