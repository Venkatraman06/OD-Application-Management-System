using System;
using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Dtos
{
    public class AdminResponseDto
    {
        public int Id { get; set; }
        public string AdminId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? Email { get; set; }
        public bool IsActive { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime? UpdatedAt { get; set; }
    }

    public class CreateAdminDto
    {
        [Required]
        [MaxLength(50)]
        public string AdminId { get; set; } = string.Empty;

        [Required]
        [MinLength(4)]
        public string Password { get; set; } = string.Empty;

        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Email { get; set; }
    }

    public class UpdateAdminDto
    {
        [Required]
        [MaxLength(100)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? Email { get; set; }

        public string? Password { get; set; }
    }
}
