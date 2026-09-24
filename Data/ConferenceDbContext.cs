using Microsoft.EntityFrameworkCore;
using Rendezvous.Web.Models;

namespace Rendezvous.Web.Data;

public class ConferenceDbContext : DbContext
{
    public ConferenceDbContext(
        DbContextOptions<ConferenceDbContext> options)
        : base(options)
    {
    }

    

    public DbSet<Meeting> Meetings => Set<Meeting>();



    public DbSet<MeetingParticipant> MeetingParticipants =>
    Set<MeetingParticipant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);

    // Configure the existing Meetings table.
    modelBuilder.Entity<Meeting>(entity =>
    {
        entity.ToTable("Meetings", "dbo");

        entity.HasKey(m => m.Id);

        entity.Property(m => m.Id)
            .HasColumnType("uniqueidentifier");

        entity.Property(m => m.Title)
            .HasMaxLength(200)
            .IsRequired();

        entity.Property(m => m.Description)
            .HasMaxLength(1000);

        entity.Property(m => m.MeetingCode)
            .HasMaxLength(50)
            .IsRequired();

        entity.Property(m => m.HostToken)
            .HasMaxLength(100)
            .IsRequired();

        entity.Property(m => m.HostUserId)
            .HasMaxLength(450);

        entity.Property(m => m.CreatedAt)
            .HasColumnType("datetime2")
            .IsRequired();

        entity.Property(m => m.ScheduledStartTime)
            .HasColumnType("datetime2");

        entity.Property(m => m.StartedAt)
            .HasColumnType("datetime2");

        entity.Property(m => m.EndedAt)
            .HasColumnType("datetime2");

        entity.Property(m => m.Status)
            .IsRequired();
    });

    // Configure the new MeetingParticipants table.
    modelBuilder.Entity<MeetingParticipant>(entity =>
{
    entity.ToTable("MeetingParticipants", "dbo");

    entity.HasKey(p => p.Id);

    entity.Property(p => p.Id)
        .HasColumnType("uniqueidentifier");

    entity.Property(p => p.MeetingId)
        .HasColumnType("uniqueidentifier")
        .IsRequired();

    entity.Property(p => p.UserId)
        .HasMaxLength(450);

    entity.Property(p => p.DisplayName)
        .HasMaxLength(100)
        .HasColumnType("nvarchar(100)")
        .IsRequired();

    entity.Property(p => p.Role)
        .HasColumnType("int")
        .IsRequired();

    entity.Property(p => p.JoinedAt)
        .HasColumnType("datetime2")
        .IsRequired();

    entity.Property(p => p.LeftAt)
        .HasColumnType("datetime2");

    entity.Property(p => p.IsActive)
        .HasColumnType("bit")
        .IsRequired();

    entity.Property(p => p.ConnectionId)
        .HasMaxLength(100)
        .HasColumnType("nvarchar(100)");

    entity.Property(p => p.IsMutedAudio)
        .HasColumnType("bit")
        .IsRequired();

    entity.Property(p => p.IsMutedVideo)
        .HasColumnType("bit")
        .IsRequired();

    entity.HasOne<Meeting>()
        .WithMany()
        .HasForeignKey(p => p.MeetingId)
        .OnDelete(DeleteBehavior.Cascade);
});
}
}