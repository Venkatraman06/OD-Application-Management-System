using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace OnlineOD.Models
{
    using System.ComponentModel.DataAnnotations.Schema;

    public class Hod
    {
        [Key]
        public int HodId { get; set; }
        public string Name { get; set; }
        public string Department { get; set; }

        public string Email { get; set; }
        [JsonIgnore]
        public string Password { get; set; }
    }
}