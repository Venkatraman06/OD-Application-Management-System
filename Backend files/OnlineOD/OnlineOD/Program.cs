using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Service;
using OnlineOD.Services;
using System;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

// Support dynamic port binding for cloud platforms (e.g. Render, Railway)
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlOptions => sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(30),
            errorNumbersToAdd: null)));

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[]
            {
                "https://od-application-management-system-q7.vercel.app",
                "http://localhost:5500",
                "http://127.0.0.1:5500",
                "http://localhost:3000",
                "http://localhost:5088",
                "http://localhost:5183"
            };

        policy.WithOrigins(configuredOrigins)
              .SetIsOriginAllowed(origin =>
              {
                  if (string.IsNullOrEmpty(origin)) return false;
                  try
                  {
                      var uri = new Uri(origin);
                      return uri.Host == "localhost"
                          || uri.Host == "127.0.0.1"
                          || uri.Host.StartsWith("192.168.")
                          || origin.Equals("https://od-application-management-system-q7.vercel.app", StringComparison.OrdinalIgnoreCase);
                  }
                  catch
                  {
                      return false;
                  }
              })
              .AllowAnyMethod()
              .AllowAnyHeader()
              .WithExposedHeaders("X-Email-Status", "X-Email-Detail");
    });
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new DateOnlyJsonConverter());
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());
});

builder.Services.AddScoped<IStudentService, StudentService>();
builder.Services.AddScoped<IStaffService, StaffService>();
builder.Services.AddScoped<IHodService, HodService>();
builder.Services.AddScoped<IOdApplyService, OdApplyService>();
builder.Services.AddScoped<EmailService>();
builder.Services.AddSingleton<EmailQueue>();
builder.Services.AddHostedService<EmailBackgroundWorker>();

var app = builder.Build();

// Load any HOD-made calendar overrides from the database into the live
// in-memory working-days set, so edits/removals persist across restarts
// and are honored by server-side OD-date validation immediately.
using (var scope = app.Services.CreateScope())
{
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var overrides = db.WorkingDayOverrides.ToList();
        WorkingDaysCalendar.LoadOverrides(
            overrides.Select(o => (o.Date, o.IsWorking)));
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Startup] Could not load working-day overrides — {ex.Message}");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseStaticFiles();          // ← needed for /uploads/ certificate files

var frontendPath = Path.Combine(app.Environment.ContentRootPath, "..", "..", "Frontend files", "Frontend files OD");
if (Directory.Exists(frontendPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(Path.GetFullPath(frontendPath)),
        RequestPath = ""
    });
}

app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();
app.Run();