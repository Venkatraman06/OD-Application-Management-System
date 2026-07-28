using System.Security.Cryptography;
using System.Text;

namespace OnlineOD.Services
{
    public static class EmailTokenHelper
    {
        public static string Generate(int odId, string action, string secret)
        {
            var raw = $"{odId}:{action}:{secret}";
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
            return Convert.ToBase64String(bytes)
                          .Replace("+", "-").Replace("/", "_").Replace("=", "");
        }

        public static bool Validate(int odId, string action, string token, string secret)
            => token == Generate(odId, action, secret);
    }
}