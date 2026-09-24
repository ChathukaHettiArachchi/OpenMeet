using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Rendezvous.Web.Data;
using System.Text.Json;

namespace Rendezvous.Web.Hubs
{
    public class MeetingHub : Hub
    {
        private readonly ConferenceDbContext _db;

        public MeetingHub(ConferenceDbContext db) => _db = db;

        public async Task JoinMeeting(string meetingCode, string participantId)
        {
            if (!Guid.TryParse(participantId, out var participantGuid))
                throw new HubException("Invalid participant ID.");

            var meeting = await _db.Meetings
                .FirstOrDefaultAsync(m => m.MeetingCode == meetingCode);
            if (meeting == null)
                throw new HubException("Meeting not found.");

            var participant = await _db.MeetingParticipants
                .FirstOrDefaultAsync(p => p.Id == participantGuid &&
                                          p.MeetingId == meeting.Id &&
                                          p.IsActive);
            if (participant == null)
                throw new HubException("Participant not found or inactive.");

            var groupName = meeting.Id.ToString();
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);

            // Bind this participant record to the current SignalR connection.
            participant.ConnectionId = Context.ConnectionId;
            await _db.SaveChangesAsync();

            var participants = await _db.MeetingParticipants
                .Where(p => p.MeetingId == meeting.Id && p.IsActive)
                .Select(p => new
                {
                    participantId = p.Id,
                    displayName = p.DisplayName,
                    isMutedAudio = p.IsMutedAudio,
                    isMutedVideo = p.IsMutedVideo
                })
                .ToListAsync();

            await Clients.Caller.SendAsync("ParticipantsList", participants);
            await Clients.OthersInGroup(groupName).SendAsync("ParticipantJoined", new
            {
                participantId = participant.Id,
                displayName = participant.DisplayName,
                isMutedAudio = participant.IsMutedAudio,
                isMutedVideo = participant.IsMutedVideo
            });
        }

        public Task SendOffer(string meetingCode, Guid targetParticipantId, JsonElement offer) =>
            RelaySignal(meetingCode, targetParticipantId, "ReceiveOffer", new { offer });

        public Task SendAnswer(string meetingCode, Guid targetParticipantId, JsonElement answer) =>
            RelaySignal(meetingCode, targetParticipantId, "ReceiveAnswer", new { answer });

        public Task SendIceCandidate(string meetingCode, Guid targetParticipantId, JsonElement candidate) =>
            RelaySignal(meetingCode, targetParticipantId, "ReceiveIceCandidate", new { candidate });

        private async Task RelaySignal(
            string meetingCode, Guid targetParticipantId, string eventName, object payload)
        {
            var meeting = await _db.Meetings
                .FirstOrDefaultAsync(m => m.MeetingCode == meetingCode);
            if (meeting == null)
                throw new HubException("Meeting not found.");

            var sender = await _db.MeetingParticipants.FirstOrDefaultAsync(p =>
                p.MeetingId == meeting.Id &&
                p.ConnectionId == Context.ConnectionId &&
                p.IsActive);
            if (sender == null)
                throw new HubException("You have not joined this meeting.");

            var target = await _db.MeetingParticipants.FirstOrDefaultAsync(p =>
                p.Id == targetParticipantId &&
                p.MeetingId == meeting.Id &&
                p.IsActive &&
                p.ConnectionId != null);
            if (target?.ConnectionId == null)
                throw new HubException("The target participant is not connected.");

            await Clients.Client(target.ConnectionId).SendAsync(eventName, new
            {
                fromParticipantId = sender.Id,
                payload
            });
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            // Only update the row still bound to this exact connection. This avoids
            // an old connection's disconnect event deactivating a newer reconnect.
            var participant = await _db.MeetingParticipants
                .FirstOrDefaultAsync(p => p.ConnectionId == Context.ConnectionId);

            if (participant != null)
            {
                participant.ConnectionId = null;
                participant.IsActive = false;
                participant.LeftAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();

                await Clients.OthersInGroup(participant.MeetingId.ToString())
                    .SendAsync("ParticipantDisconnected", new
                    {
                        participantId = participant.Id,
                        displayName = participant.DisplayName
                    });
            }

            await base.OnDisconnectedAsync(exception);
        }
    }
}
