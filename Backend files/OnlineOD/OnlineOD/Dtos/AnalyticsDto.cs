namespace OnlineOD.Dtos
{
    public class AnalyticsSummaryDto
    {
        public int TotalEvents { get; set; }
        public int TotalParticipants { get; set; }
        public int TotalCertificates { get; set; }

        public int ParticipatedCount { get; set; }
        public int FirstPrizeCount { get; set; }
        public int SecondPrizeCount { get; set; }
        public int ThirdPrizeCount { get; set; }
        public int OtherCount { get; set; }

        public List<AnalyticsEventCountDto> EventCounts { get; set; } = new();
        public List<AnalyticsStudentEntryDto> Students { get; set; } = new();
    }

    public class AnalyticsEventCountDto
    {
        public string Event { get; set; } = "";
        public int Count { get; set; }
    }

    public class AnalyticsStudentEntryDto
    {
        public string StudentName { get; set; } = "";
        public string RegisterNumber { get; set; } = "";
        public string Section { get; set; } = "";
        public string Event { get; set; } = "";
        public string CollegeIndustry { get; set; } = "";
        public string WinningStatus { get; set; } = "";
        public string FromDate { get; set; } = "";
        public string ToDate { get; set; } = "";
        public bool CertificateVerified { get; set; }
    }
}