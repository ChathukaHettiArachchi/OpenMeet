using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Rendezvous.Web.Data;
using Rendezvous.Web.Models;
using Rendezvous.Web.Hubs;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSignalR();

// Configure SQL Server.
builder.Services.AddDbContext<ConferenceDbContext>(options =>
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("ConferenceDb")
    )
);

var app = builder.Build();

// Configure the HTTP request pipeline.
// app.UseHttpsRedirection();

app.UseDefaultFiles();
app.UseStaticFiles();

// Create a meeting.
app.MapPost("/api/meetings", async (
    CreateMeetingRequest request,
    ConferenceDbContext dbContext) =>
{
    // Validate meeting title.
    if (string.IsNullOrWhiteSpace(request.Title))
    {
        return Results.BadRequest(new
        {
            message = "Meeting title is required."
        });
    }

    var title = request.Title.Trim();

    if (title.Length > 200)
    {
        return Results.BadRequest(new
        {
            message = "Meeting title cannot exceed 200 characters."
        });
    }

    // Validate description.
    var description = request.Description?.Trim();

    if (description?.Length > 1000)
    {
        return Results.BadRequest(new
        {
            message = "Description cannot exceed 1000 characters."
        });
    }

    // Generate unpredictable identifiers and a separate host secret.
    var meetingId = Guid.NewGuid();

    var meetingCode = Convert.ToHexString(
        RandomNumberGenerator.GetBytes(16)
    ).ToLowerInvariant();

    var hostToken = Convert.ToHexString(
        RandomNumberGenerator.GetBytes(32)
    ).ToLowerInvariant();

    var meeting = new Meeting
    {
        Id = meetingId,
        Title = title,
        Description = description,
        MeetingCode = meetingCode,
        HostToken = hostToken,
        HostUserId = null,
        CreatedAt = DateTime.UtcNow,
        Status = 0
    };

    // Save the meeting to SQL Server.
    dbContext.Meetings.Add(meeting);

    await dbContext.SaveChangesAsync();

    return Results.Created(
        $"/api/meetings/{meeting.MeetingCode}",
        new
        {
            // Keep this property for compatibility with the current frontend.
            meetingId = meeting.MeetingCode,
            meetingCode = meeting.MeetingCode,
            title = meeting.Title,
            description = meeting.Description,
            createdAt = meeting.CreatedAt,

            // Return the host secret only to the meeting creator.
            // Never put it in the shareable meeting URL.
            hostToken = meeting.HostToken
        }
    );
});

// Retrieve a meeting using its meeting code.
app.MapGet("/api/meetings/{meetingCode}", async (
    string meetingCode,
    ConferenceDbContext dbContext) =>
{
    if (string.IsNullOrWhiteSpace(meetingCode))
    {
        return Results.BadRequest(new
        {
            message = "Meeting code is required."
        });
    }

    var meeting = await dbContext.Meetings
        .AsNoTracking()
        .FirstOrDefaultAsync(m => m.MeetingCode == meetingCode);

    if (meeting is null)
    {
        return Results.NotFound(new
        {
            message = "Meeting not found."
        });
    }

    // Do not expose the host token or internal database ID.
    return Results.Ok(new
    {
        meetingCode = meeting.MeetingCode,
        title = meeting.Title,
        description = meeting.Description,
        createdAt = meeting.CreatedAt,
        scheduledStartTime = meeting.ScheduledStartTime,
        startedAt = meeting.StartedAt,
        endedAt = meeting.EndedAt,
        status = meeting.Status
    });
});

app.MapPost("/api/meetings/{meetingCode}/participants", async (
    string meetingCode,
    JoinMeetingRequest request,
    ConferenceDbContext db) =>
{
    // Validate the participant's display name.
    var displayName = request.DisplayName?.Trim();

    if (string.IsNullOrWhiteSpace(displayName))
    {
        return Results.BadRequest(new
        {
            message = "Please enter your name."
        });
    }

    if (displayName.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Your name cannot exceed 100 characters."
        });
    }

    // Find the meeting.
    var meeting = await db.Meetings
        .FirstOrDefaultAsync(m => m.MeetingCode == meetingCode);

    if (meeting is null)
    {
        return Results.NotFound(new
        {
            message = "Meeting not found."
        });
    }

    // Create the participant record.
    var participant = new MeetingParticipant
    {
        Id = Guid.NewGuid(),
        MeetingId = meeting.Id,
        UserId = null,
        DisplayName = displayName,
        Role = 0,
        JoinedAt = DateTime.UtcNow,
        LeftAt = null,
        IsActive = true,
        ConnectionId = null,
        IsMutedAudio = false,
        IsMutedVideo = false
    };

    db.MeetingParticipants.Add(participant);

    await db.SaveChangesAsync();

    return Results.Created(
        $"/api/meetings/{meetingCode}/participants/{participant.Id}",
        new
        {
            participantId = participant.Id,
            displayName = participant.DisplayName,
            joinedAt = participant.JoinedAt
        });
});

app.MapHub<MeetingHub>("/meetingHub");

app.Run();

public record CreateMeetingRequest(string? Title,string? Description);

public record JoinMeetingRequest(string? DisplayName);