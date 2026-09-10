namespace OnlineOD.Service
{
    public class EmailJob
    {
        public string Type { get; set; } = string.Empty; // "Submission" or "Approval"
        public string ToEmail { get; set; } = string.Empty;
        public string StaffName { get; set; } = string.Empty;
        public string StudentName { get; set; } = string.Empty;
        public string RegisterNumber { get; set; } = string.Empty;
        public string EventName { get; set; } = string.Empty;
        public string Department { get; set; } = string.Empty;
        public string FromDate { get; set; } = string.Empty;
        public string ToDate { get; set; } = string.Empty;
        public int OdId { get; set; }
        public int StaffId { get; set; }
        public bool IsGroup { get; set; }
        public string GroupName { get; set; } = string.Empty;
        public string RegisterNumbers { get; set; } = string.Empty;
        public string CollegeIndustry { get; set; } = string.Empty;
        public string? StartTime { get; set; }
        public string? EndTime { get; set; }
        public string HodName { get; set; } = string.Empty;
        public int RetryCount { get; set; } = 0;
    }
}
