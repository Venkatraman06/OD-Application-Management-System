using System;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using OnlineOD.Data;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class AdminBootstrapService : IAdminBootstrapService
    {
        private readonly ApplicationDbContext _context;
        private readonly IAdminPasswordService _passwordService;
        private readonly IConfiguration _config;
        private readonly ILogger<AdminBootstrapService> _logger;

        public AdminBootstrapService(
            ApplicationDbContext context,
            IAdminPasswordService passwordService,
            IConfiguration config,
            ILogger<AdminBootstrapService> logger)
        {
            _context = context;
            _passwordService = passwordService;
            _config = config;
            _logger = logger;
        }

        public async Task BootstrapAsync()
        {
            try
            {
                var anyAdmins = await _context.Admins.AnyAsync();
                if (anyAdmins)
                {
                    _logger.LogInformation("[AdminBootstrap] Admin account(s) already exist. Skipping bootstrap.");
                    return;
                }

                var initialPassword = Environment.GetEnvironmentVariable("ADMIN_INITIAL_PASSWORD")
                                      ?? _config["ADMIN_INITIAL_PASSWORD"]
                                      ?? _config["AdminBootstrap:InitialPassword"];

                if (string.IsNullOrWhiteSpace(initialPassword))
                {
                    _logger.LogWarning("[AdminBootstrap] No Admin account found, and 'ADMIN_INITIAL_PASSWORD' environment variable is not configured. Bootstrap skipped.");
                    return;
                }

                var initialId = Environment.GetEnvironmentVariable("ADMIN_INITIAL_ID")
                                ?? _config["ADMIN_INITIAL_ID"]
                                ?? _config["AdminBootstrap:InitialId"]
                                ?? "admin1";

                var initialName = Environment.GetEnvironmentVariable("ADMIN_INITIAL_NAME")
                                  ?? _config["ADMIN_INITIAL_NAME"]
                                  ?? _config["AdminBootstrap:InitialName"]
                                  ?? "Administrator";

                var initialEmail = Environment.GetEnvironmentVariable("ADMIN_INITIAL_EMAIL")
                                   ?? _config["ADMIN_INITIAL_EMAIL"]
                                   ?? _config["AdminBootstrap:InitialEmail"];

                var admin = new Admin
                {
                    AdminId = initialId.Trim(),
                    Name = initialName.Trim(),
                    Email = !string.IsNullOrWhiteSpace(initialEmail) ? initialEmail.Trim() : null,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                admin.PasswordHash = _passwordService.HashPassword(admin, initialPassword.Trim());

                _context.Admins.Add(admin);
                await _context.SaveChangesAsync();

                _logger.LogInformation("[AdminBootstrap] Initial Admin account '{AdminId}' created successfully with secure password hash.", admin.AdminId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[AdminBootstrap] An error occurred during Admin bootstrap.");
            }
        }
    }
}
