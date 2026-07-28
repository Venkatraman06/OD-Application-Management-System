using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class OdApply
    {
        [Key]
        public int OdId { get; set; }
        public int StudentId { get; set; }
        public string? StudentName { get; set; }
        public string? registerNumber { get; set; }
        public string? department { get; set; }
        public string? FromDate { get; set; }
        public string? ToDate { get; set; }
        public int NumberOfDays { get; set; }
        public string? Event { get; set; }
        public string? Reason { get; set; }
        public string? CollegeIndustry { get; set; }
        public DateTime AppliedDate { get; set; } = DateTime.Now;
        public string FacultyStatus { get; set; } = "Pending";
        public string HodStatus { get; set; } = "Pending";

        // Feature 1 — Group OD
        public bool IsGroupOd { get; set; } = false;
        public string? GroupName { get; set; }

        // Feature 3 — Winning certificate
        public string? WinningStatus { get; set; }
        public string? CertificatePhotoUrl { get; set; }
    }
}