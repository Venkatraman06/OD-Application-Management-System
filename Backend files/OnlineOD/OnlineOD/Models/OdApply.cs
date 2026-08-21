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

        // Class section this OD request belongs to (copied from the applying
        // student at submit time) — used to route the request to only the
        // staff assigned to this Department + Section.
        public string? Section { get; set; }

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
        public string? RegisterNumbers { get; set; } // comma-separated list of member register numbers
        public string? FacultyRejectedRegisterNumbers { get; set; } // comma-separated — members faculty rejected
        public string? FacultyApprovedRegisterNumbers { get; set; } // comma-separated — members whose OWN section-staff has approved them (needed when a group spans multiple sections, since each section's staff can only decide on their own members)
        public string? HodApprovedRegisterNumbers { get; set; }     // comma-separated — members HOD overrode back to approved

        // Feature 3 — Winning certificate
        public string? WinningStatus { get; set; }
        public string? CertificatePhotoUrl { get; set; }
        public bool CertificateVerified { get; set; } = false; // staff has verified the uploaded certificate — locks it from further student edits
    }
}