using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;

namespace OnlineOD.Filters
{
    public class ActiveAdminFilter : IAsyncActionFilter
    {
        private readonly ApplicationDbContext _context;

        public ActiveAdminFilter(ApplicationDbContext context)
        {
            _context = context;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var hasAllowAnonymous = context.ActionDescriptor.EndpointMetadata
                .Any(em => em is IAllowAnonymous);

            if (hasAllowAnonymous)
            {
                await next();
                return;
            }

            var user = context.HttpContext.User;
            if (user?.Identity == null || !user.Identity.IsAuthenticated)
            {
                await next();
                return;
            }

            if (!user.IsInRole("Admin"))
            {
                await next();
                return;
            }

            var idClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idClaim) || !int.TryParse(idClaim, out var adminId))
            {
                context.Result = new ObjectResult(new { message = "Invalid administrator identity claim." })
                {
                    StatusCode = StatusCodes.Status401Unauthorized
                };
                return;
            }

            var admin = await _context.Admins.AsNoTracking().FirstOrDefaultAsync(a => a.Id == adminId);
            if (admin == null || !admin.IsActive)
            {
                context.Result = new ObjectResult(new { message = "Your administrator account has been deactivated or does not exist." })
                {
                    StatusCode = StatusCodes.Status403Forbidden
                };
                return;
            }

            await next();
        }
    }
}
