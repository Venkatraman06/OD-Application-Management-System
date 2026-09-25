using Microsoft.EntityFrameworkCore;
using Npgsql;
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

var rawConnectionString = Environment.GetEnvironmentVariable("ConnectionStrings__DefaultConnection")
                       ?? builder.Configuration.GetConnectionString("DefaultConnection")
                       ?? Environment.GetEnvironmentVariable("DATABASE_URL")
                       ?? builder.Configuration["DATABASE_URL"]
                       ?? "";

var databaseProvider = Environment.GetEnvironmentVariable("DatabaseProvider")
                    ?? Environment.GetEnvironmentVariable("DATABASE_PROVIDER")
                    ?? builder.Configuration["DatabaseProvider"]
                    ?? "";

bool isPostgreSql;
if (databaseProvider.Equals("PostgreSQL", StringComparison.OrdinalIgnoreCase))
{
    isPostgreSql = true;
}
else if (databaseProvider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
{
    isPostgreSql = false;
}
else
{
    // Automatic fallback: local SQL Server only when LocalDB/SQLExpress/Trusted_Connection is detected
    bool isLocalDb = rawConnectionString.Contains("(localdb)", StringComparison.OrdinalIgnoreCase)
                  || rawConnectionString.Contains("sqlexpress", StringComparison.OrdinalIgnoreCase)
                  || rawConnectionString.Contains("Trusted_Connection", StringComparison.OrdinalIgnoreCase);

    isPostgreSql = rawConnectionString.StartsWith("postgres", StringComparison.OrdinalIgnoreCase)
                || rawConnectionString.Contains("Host=", StringComparison.OrdinalIgnoreCase)
                || rawConnectionString.Contains("neon.tech", StringComparison.OrdinalIgnoreCase)
                || rawConnectionString.Contains("sslmode", StringComparison.OrdinalIgnoreCase)
                || (!isLocalDb && !string.IsNullOrWhiteSpace(rawConnectionString));
}

var connectionString = isPostgreSql
    ? ConvertPostgreSqlUriToConnectionString(rawConnectionString)
    : rawConnectionString.Trim().Trim('\"', '\'');

Console.WriteLine($"[Startup] Database provider selected: {(isPostgreSql ? "PostgreSQL" : "SQL Server")}");

if (isPostgreSql)
{
    AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
    builder.Services.AddDbContext<ApplicationDbContext, PostgreSqlDbContext>(options =>
        options.UseNpgsql(
            connectionString,
            npgsqlOptions => npgsqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(30),
                errorCodesToAdd: null)));
}
else
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlServer(
            connectionString,
            sqlOptions => sqlOptions.EnableRetryOnFailure(
                maxRetryCount: 5,
                maxRetryDelay: TimeSpan.FromSeconds(30),
                errorNumbersToAdd: null)));
}

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[]
            {
                "https://od-application-management-system.vercel.app",
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
                          || uri.Host.Equals("od-application-management-system.vercel.app", StringComparison.OrdinalIgnoreCase);
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

// Global Exception Handler: Ensures CORS headers and detailed error JSON on 500 exceptions
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";

        var origin = context.Request.Headers["Origin"].ToString();
        if (!string.IsNullOrEmpty(origin))
        {
            context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Access-Control-Allow-Headers"] = "*";
            context.Response.Headers["Access-Control-Allow-Methods"] = "*";
        }

        var exceptionHandlerPathFeature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerPathFeature>();
        var ex = exceptionHandlerPathFeature?.Error;
        var errorMessage = ex?.Message ?? "An internal server error occurred.";

        await context.Response.WriteAsync(System.Text.Json.JsonSerializer.Serialize(new
        {
            error = "Internal Server Error",
            message = errorMessage,
            path = context.Request.Path.Value
        }));
    });
});

app.UseRouting();
app.UseCors("AllowAll");

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

app.UseAuthorization();
app.MapControllers();
app.Run();

// Helper to convert URI format (postgres://user:pass@host/db) to standard ADO.NET connection string
static string ConvertPostgreSqlUriToConnectionString(string connStr)
{
    if (string.IsNullOrWhiteSpace(connStr)) return connStr;
    connStr = connStr.Trim().Trim('\"', '\'');

    if (connStr.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
        connStr.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var uri = new Uri(connStr);
            var userInfo = uri.UserInfo.Split(':', 2);
            var username = userInfo.Length > 0 ? Uri.UnescapeDataString(userInfo[0]) : "";
            var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 5432;
            var database = uri.AbsolutePath.TrimStart('/');

            var builder = new NpgsqlConnectionStringBuilder
            {
                Host = host,
                Port = port,
                Database = database,
                Username = username,
                Password = password,
                SslMode = SslMode.Require
            };

            return builder.ConnectionString;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Startup] Warning: could not parse PostgreSQL URI — {ex.Message}");
            return connStr;
        }
    }

    return connStr;
}