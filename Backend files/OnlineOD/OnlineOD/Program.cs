using Microsoft.EntityFrameworkCore;
using OnlineOD.Data;
using OnlineOD.Service;
using OnlineOD.Services;
using System;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

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
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader()
              // Without this, the browser silently drops these custom
              // headers even though the server sent them — response.headers
              // .get('X-Email-Status') would always return null cross-origin.
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
app.UseCors("AllowAll");
app.UseAuthorization();
app.MapControllers();
app.Run();