using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using OnlineOD.Models;

namespace OnlineOD.Service
{
    public class JwtTokenService : IJwtTokenService
    {
        private readonly IConfiguration _config;

        public JwtTokenService(IConfiguration config)
        {
            _config = config;
        }

        public string GenerateToken(int userId, string username, string role, string? department = null, string? section = null, int? year = null, string? email = null, string? adminId = null)
        {
            var secret = Environment.GetEnvironmentVariable("JwtSettings__SecretKey")
                         ?? _config["JwtSettings:SecretKey"];

            if (string.IsNullOrWhiteSpace(secret) || secret.Equals("YOUR_JWT_SECRET", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("[JwtTokenService] Missing required configuration: 'JwtSettings:SecretKey' (or environment variable 'JwtSettings__SecretKey'). JWT tokens cannot be signed without a configured secret key.");
            }

            var issuer = Environment.GetEnvironmentVariable("JwtSettings__Issuer")
                         ?? _config["JwtSettings:Issuer"]
                         ?? "OnlineOD";

            var audience = Environment.GetEnvironmentVariable("JwtSettings__Audience")
                           ?? _config["JwtSettings:Audience"]
                           ?? "OnlineODFrontend";

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret.Trim()));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(ClaimTypes.Name, username ?? string.Empty),
                new Claim(ClaimTypes.Role, role ?? string.Empty),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            if (!string.IsNullOrWhiteSpace(department))
            {
                claims.Add(new Claim("department", department.Trim()));
            }

            if (!string.IsNullOrWhiteSpace(section))
            {
                claims.Add(new Claim("section", section.Trim()));
            }

            if (year.HasValue && year.Value > 0)
            {
                claims.Add(new Claim("year", year.Value.ToString()));
            }

            if (!string.IsNullOrWhiteSpace(email))
            {
                claims.Add(new Claim(ClaimTypes.Email, email.Trim()));
            }

            if (!string.IsNullOrWhiteSpace(adminId))
            {
                claims.Add(new Claim("adminId", adminId.Trim()));
            }

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddDays(7),
                Issuer = issuer,
                Audience = audience,
                SigningCredentials = creds
            };

            var tokenHandler = new JwtSecurityTokenHandler();
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        public string GenerateStudentToken(Student student)
        {
            if (student == null) throw new ArgumentNullException(nameof(student));
            return GenerateToken(
                userId: student.StudentId,
                username: !string.IsNullOrWhiteSpace(student.Name) ? student.Name : student.RegisterNumber,
                role: "Student",
                department: student.Department,
                section: student.Section,
                year: student.Year,
                email: student.Email
            );
        }

        public string GenerateStaffToken(Staff staff)
        {
            if (staff == null) throw new ArgumentNullException(nameof(staff));
            return GenerateToken(
                userId: staff.StaffId,
                username: staff.Name,
                role: "Staff",
                department: staff.Department,
                section: staff.Section,
                year: staff.Year,
                email: staff.Email
            );
        }

        public string GenerateHodToken(Hod hod)
        {
            if (hod == null) throw new ArgumentNullException(nameof(hod));
            return GenerateToken(
                userId: hod.HodId,
                username: hod.Name,
                role: "HOD",
                department: hod.Department,
                section: null,
                year: null,
                email: hod.Email
            );
        }

        public string GenerateAdminToken(Admin admin)
        {
            if (admin == null) throw new ArgumentNullException(nameof(admin));
            return GenerateToken(
                userId: admin.Id,
                username: !string.IsNullOrWhiteSpace(admin.Name) ? admin.Name : admin.AdminId,
                role: "Admin",
                department: null,
                section: null,
                year: null,
                email: admin.Email,
                adminId: admin.AdminId
            );
        }
    }
}
