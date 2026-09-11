using OnlineOD.Services;

namespace OnlineOD.Service
{
    public class EmailBackgroundWorker : BackgroundService
    {
        private readonly EmailQueue _queue;
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<EmailBackgroundWorker> _logger;

        public EmailBackgroundWorker(EmailQueue queue, IServiceProvider serviceProvider, ILogger<EmailBackgroundWorker> logger)
        {
            _queue = queue;
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[EmailBackgroundWorker] Service started and listening for email jobs.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    var job = await _queue.DequeueAsync(stoppingToken);
                    if (job == null) continue;

                    await ProcessJobWithRetryAsync(job, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[EmailBackgroundWorker] Unexpected error in background worker loop.");
                }
            }

            _logger.LogInformation("[EmailBackgroundWorker] Service stopping.");
        }

        private async Task ProcessJobWithRetryAsync(EmailJob job, CancellationToken cancellationToken)
        {
            const int maxRetries = 3;
            int attempt = 0;

            while (attempt < maxRetries && !cancellationToken.IsCancellationRequested)
            {
                attempt++;
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var emailService = scope.ServiceProvider.GetRequiredService<EmailService>();

                    if (job.Type == "Submission")
                    {
                        await emailService.SendOdSubmissionEmailAsync(
                            toEmail: job.ToEmail,
                            staffName: job.StaffName,
                            studentName: job.StudentName,
                            registerNumber: job.RegisterNumber,
                            eventName: job.EventName,
                            department: job.Department,
                            fromDate: job.FromDate,
                            toDate: job.ToDate,
                            odId: job.OdId,
                            staffId: job.StaffId,
                            isGroup: job.IsGroup,
                            groupName: job.GroupName,
                            registerNumbers: job.RegisterNumbers,
                            collegeIndustry: job.CollegeIndustry,
                            startTime: job.StartTime,
                            endTime: job.EndTime
                        );
                    }
                    else if (job.Type == "Approval")
                    {
                        await emailService.SendOdApprovalEmailAsync(
                            toEmail: job.ToEmail,
                            hodName: job.HodName,
                            studentName: job.StudentName,
                            registerNumber: job.RegisterNumber,
                            eventName: job.EventName,
                            department: job.Department,
                            fromDate: job.FromDate,
                            toDate: job.ToDate,
                            odId: job.OdId,
                            isGroup: job.IsGroup,
                            groupName: job.GroupName,
                            registerNumbers: job.RegisterNumbers,
                            collegeIndustry: job.CollegeIndustry,
                            startTime: job.StartTime,
                            endTime: job.EndTime
                        );
                    }

                    _logger.LogInformation("[EmailBackgroundWorker] Successfully sent {Type} email to {ToEmail} for OD #{OdId}.", job.Type, job.ToEmail, job.OdId);
                    return; // Success — exit retry loop
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[EmailBackgroundWorker] Attempt {Attempt}/{Max} failed to send {Type} email to {ToEmail} for OD #{OdId}.", attempt, maxRetries, job.Type, job.ToEmail, job.OdId);

                    if (attempt < maxRetries)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2 * attempt), cancellationToken);
                    }
                    else
                    {
                        _logger.LogError("[EmailBackgroundWorker] Permanently failed to send {Type} email to {ToEmail} for OD #{OdId} after {Max} attempts.", job.Type, job.ToEmail, job.OdId, maxRetries);
                    }
                }
            }
        }
    }
}
