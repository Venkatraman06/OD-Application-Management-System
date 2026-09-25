namespace OnlineOD.Dtos
{
    public class OdReportSearchResultDto
    {
        public int OdId { get; set; }
        public int StudentId { get; set; }
        public string StudentName { get; set; } = "";
        public string RegisterNumber { get; set; } = "";
        public string ClassName { get; set; } = ""; // Department e.g. "B.Sc CS"
        public int? Year { get; set; }
        public string Section { get; set; } = "";
        public string EventName { get; set; } = "";
        public string CollegeName { get; set; } = "";
        public string OdType { get; set; } = "Solo OD"; // "Solo OD" or "Group OD"
        public bool IsGroupOd { get; set; }
        public string? GroupName { get; set; }
        public string? RegisterNumbers { get; set; }
        public List<GroupMemberInfoDto> Members { get; set; } = new();
        public string FromDate { get; set; } = "";
        public string ToDate { get; set; } = "";
        public string? StartTime { get; set; }
        public string? EndTime { get; set; }
        public int NumberOfDays { get; set; }
        public DateTime AppliedDate { get; set; }
        public string FacultyStatus { get; set; } = "Pending";
        public string HodStatus { get; set; } = "Pending";
        public string OverallStatus { get; set; } = "Pending";
        public string? Reason { get; set; }
        public string? CompetitionType { get; set; }
        public string CertificationStatus { get; set; } = "Not Submitted";
        public bool HasCertificate { get; set; }
        public bool CertificateVerified { get; set; }
    }

    public class GroupMemberInfoDto
    {
        public string StudentName { get; set; } = "";
        public string RegisterNumber { get; set; } = "";
        public string Department { get; set; } = "";
        public int? Year { get; set; }
        public string Section { get; set; } = "";
        public string CertificationStatus { get; set; } = "Not Submitted";
        public bool HasCertificate { get; set; }
        public bool CertificateVerified { get; set; }
    }
}
