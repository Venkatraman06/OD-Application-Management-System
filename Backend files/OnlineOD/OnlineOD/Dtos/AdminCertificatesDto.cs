namespace OnlineOD.Dtos
{
    public class AdminPendingCertDto
    {
        public int OdId { get; set; }
        public int StudentId { get; set; }
        public string StudentName { get; set; } = "";
        public string RegisterNumber { get; set; } = "";
        public string? Department { get; set; }
        public string? Section { get; set; }
        public int? Year { get; set; }
        public string? EventName { get; set; }
        public string? CollegeName { get; set; }
        public string? CompetitionType { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public int NumberOfDays { get; set; }
        public bool IsGroupOd { get; set; }
        public string? GroupName { get; set; }
        public string? Reason { get; set; }
        public DateTime AppliedDate { get; set; }
    }

    public class AdminSubmittedCertDto
    {
        public int CertId { get; set; }
        public int OdId { get; set; }
        public int StudentId { get; set; }
        public string StudentName { get; set; } = "";
        public string RegisterNumber { get; set; } = "";
        public string? Department { get; set; }
        public string? Section { get; set; }
        public int? Year { get; set; }
        public string? EventName { get; set; }
        public string? CollegeName { get; set; }
        public string? CompetitionType { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public int NumberOfDays { get; set; }
        public bool IsGroupOd { get; set; }
        public string? GroupName { get; set; }
        public string? Reason { get; set; }
        public string? WinningStatus { get; set; }
        public string? CertificatePhotoUrl { get; set; }
        public bool CertificateVerified { get; set; }
        public DateTime UploadedDate { get; set; }
    }

    public class AdminCertificatesResultDto
    {
        public List<AdminPendingCertDto> Pending { get; set; } = new();
        public List<AdminSubmittedCertDto> Submitted { get; set; } = new();
    }
}
