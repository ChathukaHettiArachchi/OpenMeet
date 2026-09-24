using System.ComponentModel.DataAnnotations;

namespace Rendezvous.Web.Models;

public class Meeting
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [Required]
    [MaxLength(50)]
    public string MeetingCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string HostToken { get; set; } = string.Empty;

    [MaxLength(450)]
    public string? HostUserId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? ScheduledStartTime { get; set; }

    public DateTime? StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public int Status { get; set; }
}