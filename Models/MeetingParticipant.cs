namespace Rendezvous.Web.Models
{
    public class MeetingParticipant
    {
        public Guid Id { get; set; }

        public Guid MeetingId { get; set; }

        public string? UserId { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public int Role { get; set; }

        public DateTime JoinedAt { get; set; }

        public DateTime? LeftAt { get; set; }

        public bool IsActive { get; set; }

        public string? ConnectionId { get; set; }

        public bool IsMutedAudio { get; set; }

        public bool IsMutedVideo { get; set; }
    }
}