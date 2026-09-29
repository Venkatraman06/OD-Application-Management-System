using System;
using Microsoft.AspNetCore.Identity;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class AdminPasswordService : IAdminPasswordService
    {
        private readonly PasswordHasher<Admin> _passwordHasher;

        public AdminPasswordService()
        {
            _passwordHasher = new PasswordHasher<Admin>();
        }

        public string HashPassword(Admin admin, string password)
        {
            if (string.IsNullOrWhiteSpace(password))
            {
                throw new ArgumentException("Password cannot be null or empty.", nameof(password));
            }

            return _passwordHasher.HashPassword(admin, password);
        }

        public bool VerifyPassword(Admin admin, string hashedPassword, string providedPassword)
        {
            if (string.IsNullOrWhiteSpace(hashedPassword) || string.IsNullOrWhiteSpace(providedPassword))
            {
                return false;
            }

            var result = _passwordHasher.VerifyHashedPassword(admin, hashedPassword, providedPassword);
            return result == PasswordVerificationResult.Success || result == PasswordVerificationResult.SuccessRehashNeeded;
        }
    }
}
