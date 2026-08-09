using OnlineOD.Models;

namespace OnlineOD.Dtos
{
    // Mirrors OdApply's fields exactly (so existing frontend code that reads
    // od.studentName, od.fromDate, etc. keeps working unchanged), plus a new
    // "certificates" array — one entry per group member who has uploaded,
    // instead of the old single shared CertificatePhotoUrl field.
    public class OdWithCertificatesDto
    {
        public int OdId { get; set; }
        public int StudentId { get; set; }
        public string? StudentName { get; set; }
        public string? registerNumber { get; set; }
        public string? department { get; set; }
        public string? Section { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public int NumberOfDays { get; set; }
        public string? Event { get; set; }
        public string? Reason { get; set; }
        public string? CollegeIndustry { get; set; }
        public DateTime AppliedDate { get; set; }
        public string FacultyStatus { get; set; } = "Pending";
        public string HodStatus { get; set; } = "Pending";

        public bool IsGroupOd { get; set; }
        public string? GroupName { get; set; }
        public string? RegisterNumbers { get; set; }
        public string? FacultyRejectedRegisterNumbers { get; set; }
        public string? HodApprovedRegisterNumbers { get; set; }

        // Old single-certificate fields — kept for backward compatibility with
        // any certificates uploaded before this change. New uploads go through
        // the Certificates list below instead.
        public string? WinningStatus { get; set; }
        public string? CertificatePhotoUrl { get; set; }
        public bool CertificateVerified { get; set; }

        public List<OdCertificate> Certificates { get; set; } = new();
    }
}