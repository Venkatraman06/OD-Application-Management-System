using System;
using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class ContactAdminRequest
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string RegisterNumber { get; set; }

        public string? Dob { get; set; }

        [Required]
        public string Role { get; set; }

        [Required]
        public string Message { get; set; }

        public bool IsResolved { get; set; } = false;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}