using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class SystemSetting
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string Key { get; set; }

        public string Value { get; set; } = string.Empty;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
