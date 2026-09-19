using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class PasswordResetCode
    {
        [Key]
        public int Id { get; set; }
        public string Email { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string UserType { get; set; } = string.Empty; // "Student", "Staff", "Hod"
        public int UserId { get; set; }
        public DateTime ExpiryTime { get; set; }
        public bool IsUsed { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
