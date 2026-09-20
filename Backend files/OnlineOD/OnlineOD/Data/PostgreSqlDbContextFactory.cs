using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using System;

namespace OnlineOD.Data
{
    public class PostgreSqlDbContextFactory : IDesignTimeDbContextFactory<PostgreSqlDbContext>
    {
        public PostgreSqlDbContext CreateDbContext(string[] args)
        {
            var optionsBuilder = new DbContextOptionsBuilder<PostgreSqlDbContext>();
            var connStr = Environment.GetEnvironmentVariable("POSTGRES_CONNECTION")
                ?? "Host=localhost;Database=Online_ODdb;Username=postgres;Password=postgres";

            optionsBuilder.UseNpgsql(connStr);
            return new PostgreSqlDbContext(optionsBuilder.Options);
        }
    }
}
