using Microsoft.EntityFrameworkCore;
using OnlineOD.Models;

namespace OnlineOD.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Student> Students { get; set; }
        public DbSet<Staff> Staffs { get; set; }
        public DbSet<Hod> Hods { get; set; }
        public DbSet<OdApply> OdApplies { get; set; }
        public DbSet<OdCertificate> OdCertificates { get; set; }
    }
}