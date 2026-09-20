using Microsoft.EntityFrameworkCore;

namespace OnlineOD.Data
{
    public class PostgreSqlDbContext : ApplicationDbContext
    {
        public PostgreSqlDbContext(DbContextOptions<PostgreSqlDbContext> options)
            : base(options)
        {
        }
    }
}
