using System.Threading.Channels;

namespace OnlineOD.Service
{
    public class EmailQueue
    {
        private readonly Channel<EmailJob> _queue;

        public EmailQueue()
        {
            var options = new UnboundedChannelOptions
            {
                SingleReader = true
            };
            _queue = Channel.CreateUnbounded<EmailJob>(options);
        }

        public void Enqueue(EmailJob job)
        {
            if (job == null) return;
            _queue.Writer.TryWrite(job);
        }

        public ValueTask<EmailJob> DequeueAsync(CancellationToken cancellationToken)
        {
            return _queue.Reader.ReadAsync(cancellationToken);
        }
    }
}
