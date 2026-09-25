using System;

namespace Rendezvous.Web.Models
{
    public class MeetingMessage
    {
        public Guid Id { get; set; }

        public Guid MeetingId { get; set; }

        public string? SenderUserId { get; set; }

        public string SenderDisplayName { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;

        public DateTime SentAt { get; set; }

        // Navigation property
        public Meeting? Meeting { get; set; }
    }
}