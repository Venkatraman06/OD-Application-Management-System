using System.ComponentModel.DataAnnotations;

namespace OnlineOD.Models
{
    public class Event
    {
        [Key]
        public int Id { get; set; }

        [Required]
        public string EventName { get; set; } = string.Empty;

        [Required]
        public string CollegeName { get; set; } = string.Empty;

        [Required]
        public string StartingDate { get; set; } = string.Empty;

        [Required]
        public string DeadlineDate { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.Now;

        public bool IsActive { get; set; } = true;
    }
}
