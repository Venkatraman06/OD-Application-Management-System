using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    // One row per (OdId, RegisterNumber). This lets each member of a group OD
    // upload their own certificate independently, instead of sharing a single
    // CertificatePhotoUrl field on the OD itself (which caused one member's
    // upload to overwrite another's).
    public class OdCertificate
    {
        [Key]
        public int Id { get; set; }

        public int OdId { get; set; }
        public string RegisterNumber { get; set; } = "";

        public string? WinningStatus { get; set; }
        public string? CertificatePhotoUrl { get; set; }
        public bool CertificateVerified { get; set; } = false;

        public DateTime UploadedDate { get; set; } = DateTime.Now;
    }
}