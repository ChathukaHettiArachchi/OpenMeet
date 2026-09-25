
// WebRTC state
let peerConnections = new Map();
const pendingIceCandidates = new Map();
const peerRecoveryStates = new Map();

let currentParticipantId = null;
let currentMeetingCode = null;

// STUN server for initial connectivity testing
const rtcConfiguration = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        }
    ]
};



async function loadMeeting() {
    const params = new URLSearchParams(window.location.search);

    // The meeting-creation page currently uses ?id=...
    const meetingCode = params.get("id");

    const titleElement = document.getElementById("meetingTitle");
    const descriptionElement = document.getElementById("meetingDescription");
    const codeElement = document.getElementById("meetingCode");
    const statusElement = document.getElementById("meetingStatus");
    const createdElement = document.getElementById("createdAt");
    const errorElement = document.getElementById("errorMessage");

    if (!meetingCode) {
        titleElement.textContent = "Meeting code missing";
        errorElement.textContent =
            "Please open a valid meeting invitation link.";
        return;
    }

    try {
        const response = await fetch(
            `/api/meetings/${encodeURIComponent(meetingCode)}`
        );

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error("This meeting could not be found.");
            }

            throw new Error("Unable to load the meeting. Please try again.");
        }

        const meeting = await response.json();

        titleElement.textContent = meeting.title || "Untitled meeting";
        descriptionElement.textContent = meeting.description || "";
        codeElement.textContent = meeting.meetingCode || meetingCode;
        createdElement.textContent = meeting.createdAt
            ? new Date(meeting.createdAt).toLocaleString()
            : "Unknown";

        const statuses = {
            0: "Not started",
            1: "In progress",
            2: "Ended"
        };

        statusElement.textContent =
            statuses[meeting.status] || "Unknown";
    } catch (error) {
        titleElement.textContent = "Unable to open meeting";
        errorElement.textContent = error.message;
        statusElement.textContent = "Unavailable";
    }
}


let meetingConnection = null;

async function connectToMeetingHub(meetingCode, participantId) {
    const participantsList = document.getElementById("participantsList");
    const errorElement = document.getElementById("errorMessage");

    currentMeetingCode = meetingCode;
    currentParticipantId = participantId;

    // Create the SignalR connection.
    meetingConnection = new signalR.HubConnectionBuilder()
        .withUrl("/meetingHub")
        .withAutomaticReconnect()
        .build();


    // =========================
    // Chat
    // =========================

    const chatInput = document.getElementById("chatInput");
    const sendChatButton = document.getElementById("sendChatButton");
    const chatMessages = document.getElementById("chatMessages");

    async function sendChatMessage() {

        const message = chatInput.value.trim();

        if (!message) {
            return;
        }

        try {

            await meetingConnection.invoke("SendChatMessage", message);

            chatInput.value = "";
            chatInput.focus();

        } catch (error) {

            console.error("Failed to send chat message:", error);

        }
    }

    if (sendChatButton) {
        sendChatButton.addEventListener("click", sendChatMessage);
    }

    if (chatInput) {
        chatInput.addEventListener("keydown", function (event) {

            if (event.key === "Enter") {

                event.preventDefault();

                sendChatMessage();

            }

        });
    }

    meetingConnection.on("ReceiveChatMessage", function (data) {

        if (!chatMessages) {
            return;
        }

        const messageElement = document.createElement("div");
        messageElement.classList.add("chat-message");

        // Check whether this message was sent by the current user
        const isOwnMessage =
            data.senderParticipantId === currentParticipantId;

        if (isOwnMessage) {
            messageElement.classList.add("sent");
        } else {
            messageElement.classList.add("received");
        }

        // Sender name
        const senderElement = document.createElement("div");
        senderElement.classList.add("chat-message-sender");
        senderElement.textContent = isOwnMessage
            ? "You"
            : data.senderDisplayName;

        // Message text
        const textElement = document.createElement("div");
        textElement.classList.add("chat-message-text");
        textElement.textContent = data.message;

        messageElement.appendChild(senderElement);
        messageElement.appendChild(textElement);

        chatMessages.appendChild(messageElement);

        // Scroll to newest message
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });


    // Render microphone/camera status indicators for a participant.
    function updateParticipantStatus(participant) {
        const id = participant.participantId;
        if (!id) return;

        const item = document.getElementById(`participant-${id}`);
        const card = document.getElementById(`remote-card-${id}`) ||
            (id === currentParticipantId ? document.getElementById("localVideoCard") : null);
        const isMutedAudio = Boolean(participant.isMutedAudio);
        const isMutedVideo = Boolean(participant.isMutedVideo);

        if (item) {
            const icons = item.querySelector(".participant-status-icons");
            icons.replaceChildren();
            if (isMutedAudio) icons.appendChild(makeStatusIcon("audio", "Microphone muted"));
            if (isMutedVideo) icons.appendChild(makeStatusIcon("video", "Camera off"));
        }

        if (card) {
            let icons = card.querySelector(".video-status-icons");
            if (!icons) {
                icons = document.createElement("div");
                icons.className = "video-status-icons";
                card.appendChild(icons);
            }
            icons.replaceChildren();
            if (isMutedAudio) icons.appendChild(makeStatusIcon("audio", "Microphone muted"));
            if (isMutedVideo) icons.appendChild(makeStatusIcon("video", "Camera off"));
        }
    }

    function makeStatusIcon(kind, description) {
        const icon = document.createElement("span");
        icon.className = "participant-status-icon";
        icon.title = description;
        icon.setAttribute("aria-label", description);

        if (kind === "audio") {
            const image = document.createElement("img");
            image.src = "/images/Mute.png";
            image.alt = "";
            icon.appendChild(image);
        } else {
            const image = document.createElement("img");
            image.src = "/images/video%20off.png";
            image.alt = "";
            icon.appendChild(image);
        }
        return icon;
    }

    // Add a participant and their current media-status indicators.
    function addParticipant(participant) {
        const id = participant.participantId;
        if (!id) return;

        let item = document.getElementById(`participant-${id}`);
        if (!item) {
            item = document.createElement("li");
            item.id = `participant-${id}`;
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.gap = "8px";

            const name = document.createElement("span");
            name.className = "participant-display-name";
            name.textContent = participant.displayName || "Participant";

            const icons = document.createElement("span");
            icons.className = "participant-status-icons";
            item.append(name, icons);
            participantsList.appendChild(item);
        } else {
            const name = item.querySelector(".participant-display-name");
            if (name) name.textContent = participant.displayName || "Participant";
        }

        updateParticipantStatus(participant);
    }

    // Remove a participant from the visible list.
    function removeParticipant(participantId) {
        const item = document.getElementById(`participant-${participantId}`);

        if (item) {
            item.remove();
        }

        removePeerConnection(participantId);
    }

    // Receive the current participant list.
    meetingConnection.on("ParticipantsList", participants => {
        participantsList.replaceChildren();

        participants.forEach(participant => {
            addParticipant(participant);

            if (participant.participantId !== currentParticipantId) {
                createRemoteParticipantTile(
                    participant.participantId,
                    participant.displayName
                );
                updateParticipantStatus(participant);

                // The newly joined client initiates the connection.
                createOffer(participant.participantId).catch(error =>
                    console.error("Could not create offer:", error)
                );
            }
        });
    });

    // A newly joined participant is announced to everyone already in the meeting.
    // Existing participants create the tile only. The newcomer initiates offers
    // to the existing participants from ParticipantsList, preventing offer glare.
    meetingConnection.on("ParticipantJoined", participant => {
        if (participant.participantId === currentParticipantId) return;
        addParticipant(participant);
        createRemoteParticipantTile(
            participant.participantId,
            participant.displayName
        );
        updateParticipantStatus(participant);
    });

    // Receive microphone/camera status changes broadcast by the hub.
    meetingConnection.on("ParticipantMediaStatusChanged", participant => {
        addParticipant(participant);
        updateParticipantStatus(participant);
    });

    // A participant disconnected.
    meetingConnection.on("ParticipantDisconnected", participant => {
        removeParticipant(participant.participantId);
    });

    // Receive WebRTC signaling messages.
    meetingConnection.on("ReceiveOffer", async message => {
        try {
            await handleReceiveOffer(message);
        } catch (error) {
            console.error("Error handling WebRTC offer:", error);
        }
    });

    meetingConnection.on("ReceiveAnswer", async message => {
        try {
            await handleReceiveAnswer(message);
        } catch (error) {
            console.error("Error handling WebRTC answer:", error);
        }
    });

    meetingConnection.on("ReceiveIceCandidate", async message => {
        try {
            await handleReceiveIceCandidate(message);
        } catch (error) {
            console.error("Error handling ICE candidate:", error);
        }
    });

    try {
        await meetingConnection.start();

        await meetingConnection.invoke(
            "JoinMeeting",
            meetingCode,
            participantId
        );

        console.log("Connected to the meeting hub.");

    } catch (error) {
        console.error("SignalR connection error:", error);

        errorElement.textContent =
            "You joined the meeting, but the live participant list could not connect. Please refresh the page to try again.";

        throw error;
    }
}


function createRemoteParticipantTile(participantId, displayName) {
    const remoteVideos = document.getElementById("remoteVideos");

    if (!remoteVideos) {
        console.error("Remote videos container was not found.");
        return null;
    }

    // Avoid creating duplicate tiles.
    let card = document.getElementById(`remote-card-${participantId}`);

    if (card) {
        const label = card.querySelector(".video-label");

        if (label && displayName) {
            label.textContent = displayName;
        }

        return card;
    }

    // Create the participant card.
    card = document.createElement("div");
    card.className = "video-card";
    card.id = `remote-card-${participantId}`;

    // Create the video element.
    const video = document.createElement("video");
    video.id = `remote-video-${participantId}`;
    video.autoplay = true;
    video.playsInline = true;

    // Create a placeholder for participants without video.
    const placeholder = document.createElement("div");
    placeholder.className = "video-placeholder";
    placeholder.id = `remote-placeholder-${participantId}`;
    placeholder.textContent = displayName || "Participant";

    // Create the participant's name label.
    const label = document.createElement("div");
    label.className = "video-label";
    label.textContent = displayName || "Participant";

    // Create fullscreen button.
    const fullscreenButton = document.createElement("button");
    fullscreenButton.type = "button";
    fullscreenButton.className = "video-fullscreen-button";
    fullscreenButton.innerHTML = "⛶";
    fullscreenButton.title = "Full screen";
    fullscreenButton.setAttribute(
        "aria-label",
        `View ${displayName || "participant"} in full screen`
    );

  fullscreenButton.addEventListener("click", () => {
    toggleParticipantExpanded(card);
});

    // Add elements to the participant card.
    card.appendChild(video);
    card.appendChild(placeholder);
    card.appendChild(fullscreenButton);
    card.appendChild(label);

    remoteVideos.appendChild(card);

    updateVideoGridLayout();

    return card;
}




async function recoverPeerConnection(remoteParticipantId) {
    let state = peerRecoveryStates.get(remoteParticipantId);

    if (!state) {
        state = {
            inProgress: false,
            timer: null
        };

        peerRecoveryStates.set(remoteParticipantId, state);
    }

    if (state.inProgress) {
        return;
    }

    const pc = peerConnections.get(remoteParticipantId);

    if (!pc) {
        return;
    }

    state.inProgress = true;

    console.warn(
        `Attempting WebRTC recovery for peer ${remoteParticipantId}...`
    );

    try {
        /*
         * First attempt:
         * Restart ICE on the existing connection.
         */
        if (
            pc.connectionState !== "closed" &&
            pc.signalingState === "stable"
        ) {
            console.log(
                `Attempting ICE restart for peer ${remoteParticipantId}...`
            );

            const offer = await pc.createOffer({
                iceRestart: true
            });

            await pc.setLocalDescription(offer);

            await meetingConnection.invoke(
                "SendOffer",
                currentMeetingCode,
                remoteParticipantId,
                pc.localDescription
            );

            console.log(
                `ICE restart offer sent to peer ${remoteParticipantId}.`
            );

            /*
             * Give the restarted connection some time to recover.
             */
            if (state.timer) {
                clearTimeout(state.timer);
            }

            state.timer = setTimeout(async () => {
                const currentPc =
                    peerConnections.get(remoteParticipantId);

                if (!currentPc) {
                    state.inProgress = false;
                    return;
                }

                if (
                    currentPc.connectionState === "connected" ||
                    currentPc.iceConnectionState === "connected" ||
                    currentPc.iceConnectionState === "completed"
                ) {
                    console.log(
                        `Peer ${remoteParticipantId} recovered successfully.`
                    );

                    state.inProgress = false;
                    state.timer = null;
                    return;
                }

                console.warn(
                    `ICE restart did not recover peer ${remoteParticipantId}. Recreating connection...`
                );

                state.inProgress = false;
                state.timer = null;

                await recreatePeerConnection(remoteParticipantId);
            }, 8000);

            return;
        }

        /*
         * Existing peer connection is no longer usable.
         */
        await recreatePeerConnection(remoteParticipantId);

    } catch (error) {
        console.error(
            `WebRTC recovery failed for peer ${remoteParticipantId}:`,
            error
        );

        state.inProgress = false;

        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }

        /*
         * Try again after 5 seconds.
         */
        setTimeout(() => {
            const currentPc =
                peerConnections.get(remoteParticipantId);

            if (
                currentPc &&
                (
                    currentPc.connectionState === "disconnected" ||
                    currentPc.connectionState === "failed"
                )
            ) {
                recoverPeerConnection(remoteParticipantId);
            }
        }, 5000);
    }
}


async function recreatePeerConnection(remoteParticipantId) {
    const oldPc =
        peerConnections.get(remoteParticipantId);

    if (oldPc) {
        try {
            oldPc.close();
        } catch (error) {
            console.warn(
                `Could not close old peer connection for ${remoteParticipantId}:`,
                error
            );
        }

        peerConnections.delete(remoteParticipantId);
    }

    pendingIceCandidates.delete(remoteParticipantId);

    /*
     * Create a completely new peer connection.
     */
    const newPc =
        createPeerConnection(remoteParticipantId);

    /*
     * Add the current local audio/video tracks.
     */
    addOffererTransceivers(newPc);

    const offer =
        await newPc.createOffer();

    await newPc.setLocalDescription(offer);

    await meetingConnection.invoke(
        "SendOffer",
        currentMeetingCode,
        remoteParticipantId,
        newPc.localDescription
    );

    console.log(
        `New WebRTC offer sent to peer ${remoteParticipantId}.`
    );
}

// Create a peer connection for a remote participant.
// Create one peer connection per remote participant. Transceivers are
// added by the offerer; the answerer reuses the transceivers from the offer.
function createPeerConnection(remoteParticipantId) {
    if (peerConnections.has(remoteParticipantId)) {
        return peerConnections.get(remoteParticipantId);
    }

    const pc = new RTCPeerConnection(rtcConfiguration);

    // let recoveryTimer = null;
    // let recoveryInProgress = false;

    pc.ontrack = event => {
        const card = createRemoteParticipantTile(
            remoteParticipantId,
            document.getElementById(`remote-card-${remoteParticipantId}`)
                ?.querySelector(".video-label")?.textContent || "Participant"
        );

        if (!card) return;

        const video = card.querySelector("video");
        const placeholder = card.querySelector(".video-placeholder");

        let stream = video.srcObject instanceof MediaStream
            ? video.srcObject
            : (event.streams?.[0] || new MediaStream());

        if (
            !event.streams?.[0] &&
            !stream.getTracks().some(t => t.id === event.track.id)
        ) {
            stream.addTrack(event.track);
        }

        video.srcObject = stream;

        if (event.track.kind === "video" && placeholder) {
            placeholder.style.display =
                event.track.enabled ? "none" : "flex";

            event.track.onmute = () => {
                placeholder.style.display = "flex";
            };

            event.track.onunmute = () => {
                placeholder.style.display = "none";
            };

            event.track.onended = () => {
                placeholder.style.display = "flex";
            };
        }

        video.play().catch(() => { });
    };

    pc.onicecandidate = async event => {
        if (!event.candidate || !meetingConnection) return;

        try {
            await meetingConnection.invoke(
                "SendIceCandidate",
                currentMeetingCode,
                remoteParticipantId,
                event.candidate
            );
        } catch (error) {
            console.error(
                "Could not send ICE candidate:",
                error
            );
        }
    };

    pc.onconnectionstatechange = async () => {
        const state = pc.connectionState;

        console.log(
            `Peer ${remoteParticipantId} connection state:`,
            state
        );

        if (state === "connected") {
            const recoveryState =
                peerRecoveryStates.get(remoteParticipantId);

            if (recoveryState) {
                recoveryState.inProgress = false;

                if (recoveryState.timer) {
                    clearTimeout(recoveryState.timer);
                    recoveryState.timer = null;
                }
            }

            console.log(
                `Peer ${remoteParticipantId} connection recovered/connected.`
            );

            return;
        }

        if (state === "disconnected") {
            console.warn(
                `Peer ${remoteParticipantId} is disconnected. Waiting 3 seconds before recovery...`
            );

            const recoveryState =
                peerRecoveryStates.get(remoteParticipantId) || {
                    inProgress: false,
                    timer: null
                };

            peerRecoveryStates.set(
                remoteParticipantId,
                recoveryState
            );

            if (recoveryState.timer) {
                clearTimeout(recoveryState.timer);
            }

            recoveryState.timer = setTimeout(() => {
                const currentPc =
                    peerConnections.get(remoteParticipantId);

                if (
                    currentPc &&
                    (
                        currentPc.connectionState === "disconnected" ||
                        currentPc.connectionState === "failed"
                    )
                ) {
                    recoverPeerConnection(remoteParticipantId);
                }
            }, 3000);

            return;
        }

        if (state === "failed") {
            console.warn(
                `Peer ${remoteParticipantId} connection failed. Starting recovery...`
            );

            const recoveryState =
                peerRecoveryStates.get(remoteParticipantId);

            if (recoveryState?.timer) {
                clearTimeout(recoveryState.timer);
                recoveryState.timer = null;
            }

            await recoverPeerConnection(remoteParticipantId);
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(
            `Peer ${remoteParticipantId} ICE state:`,
            pc.iceConnectionState
        );
    };

    peerConnections.set(remoteParticipantId, pc);

    return pc;
}

function addOffererTransceivers(pc) {
    const audioTrack = localStream?.getAudioTracks().find(t => t.readyState === "live");
    const videoTrack = localStream?.getVideoTracks().find(t => t.readyState === "live");

    if (audioTrack) {
        pc.addTransceiver(audioTrack, { direction: "sendrecv", streams: [localStream] });
    } else {
        pc.addTransceiver("audio", { direction: "recvonly" });
    }

    if (videoTrack) {
        pc.addTransceiver(videoTrack, { direction: "sendrecv", streams: [localStream] });
    } else {
        pc.addTransceiver("video", { direction: "recvonly" });
    }
}

// On the answering side, set the offered description first, then attach
// available local tracks to its audio/video transceivers.
async function attachLocalTracksToOfferedTransceivers(pc) {
    const audioTrack = localStream?.getAudioTracks().find(t => t.readyState === "live");
    const videoTrack = localStream?.getVideoTracks().find(t => t.readyState === "live");

    for (const transceiver of pc.getTransceivers()) {
        const kind = transceiver.receiver.track.kind;
        const track = kind === "audio" ? audioTrack : kind === "video" ? videoTrack : null;

        if (track) {
            await transceiver.sender.replaceTrack(track);
            transceiver.direction = "sendrecv";
        } else if (kind === "audio" || kind === "video") {
            transceiver.direction = "recvonly";
        }
    }
}

async function createOffer(remoteParticipantId) {
    const pc = createPeerConnection(remoteParticipantId);

    // Avoid adding a second set of m-lines if this peer already negotiated.
    if (pc.signalingState !== "stable" || pc.getTransceivers().length > 0) return;

    addOffererTransceivers(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await meetingConnection.invoke(
        "SendOffer",
        currentMeetingCode,
        remoteParticipantId,
        pc.localDescription
    );
}

async function handleReceiveOffer(message) {
    const remoteParticipantId = message.fromParticipantId;
    const offer = message.payload.offer;
    const pc = createPeerConnection(remoteParticipantId);

    if (pc.signalingState !== "stable") {
        console.warn("Ignoring offer while peer connection is not stable:", pc.signalingState);
        return;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await attachLocalTracksToOfferedTransceivers(pc);
    await flushPendingIceCandidates(remoteParticipantId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await meetingConnection.invoke(
        "SendAnswer",
        currentMeetingCode,
        remoteParticipantId,
        pc.localDescription
    );
}

async function handleReceiveAnswer(message) {
    const remoteParticipantId = message.fromParticipantId;
    const answer = message.payload.answer;

    const peerConnection = peerConnections.get(remoteParticipantId);

    if (!peerConnection) {
        console.warn("No peer connection found for answer.");
        return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingIceCandidates(remoteParticipantId, peerConnection);
}


// Queue ICE candidates that arrive before the remote description is installed.
async function handleReceiveIceCandidate(message) {
    const remoteParticipantId = message.fromParticipantId;
    const candidate = message.payload.candidate;
    const peerConnection = peerConnections.get(remoteParticipantId);
    if (!peerConnection) {
        const queue = pendingIceCandidates.get(remoteParticipantId) || [];
        queue.push(candidate);
        pendingIceCandidates.set(remoteParticipantId, queue);
        return;
    }

    if (!peerConnection.remoteDescription) {
        const queue = pendingIceCandidates.get(remoteParticipantId) || [];
        queue.push(candidate);
        pendingIceCandidates.set(remoteParticipantId, queue);
        return;
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error("Could not add received ICE candidate:", error);
    }
}

async function flushPendingIceCandidates(participantId, peerConnection) {
    const queue = pendingIceCandidates.get(participantId) || [];
    pendingIceCandidates.delete(participantId);
    for (const candidate of queue) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error("Could not add queued ICE candidate:", error);
        }
    }
}

// Remove a peer connection when a participant disconnects.
function removePeerConnection(remoteParticipantId) {
    pendingIceCandidates.delete(remoteParticipantId);
    peerRecoveryStates.delete(remoteParticipantId);
    const peerConnection = peerConnections.get(remoteParticipantId);

    if (peerConnection) {
        peerConnection.close();
        peerConnections.delete(remoteParticipantId);
    }

    const remoteCard = document.getElementById(
        `remote-card-${remoteParticipantId}`
    );

    if (remoteCard) {
        remoteCard.remove();
    }

    updateVideoGridLayout();
}

// Handle the Join Meeting form.
const joinForm = document.getElementById("joinForm");



joinForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const displayNameInput = document.getElementById("displayName");
    const displayName = displayNameInput.value.trim();

    const joinButton = document.getElementById("joinButton");
    const errorElement = document.getElementById("errorMessage");

    // Get the meeting code from the URL.
    const params = new URLSearchParams(window.location.search);
    const meetingCode = params.get("id");

    // Validate the participant's name.
    if (!displayName) {
        errorElement.textContent = "Please enter your name.";
        displayNameInput.focus();
        return;
    }

    if (displayName.length > 100) {
        errorElement.textContent =
            "Your name cannot exceed 100 characters.";
        displayNameInput.focus();
        return;
    }

    if (!meetingCode) {
        errorElement.textContent =
            "Meeting code is missing. Please open a valid meeting link.";
        return;
    }

    // Prevent repeated submissions while the request is processing.
    joinButton.disabled = true;
    joinButton.textContent = "Joining...";
    errorElement.textContent = "";

    try {
        // Send the participant's name to the backend.
        const response = await fetch(
            `/api/meetings/${encodeURIComponent(meetingCode)}/participants`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    displayName: displayName
                })
            }
        );

        // Read the response from the server.
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                result.message || "Unable to join the meeting. Please try again."
            );
        }

        // Connect to SignalR after the participant is registered.
        // Start the camera and microphone before connecting to SignalR.
        // This ensures that newly created peer connections include local tracks.
        await startLocalMedia();

        // Connect to SignalR after the local media has started.
        await connectToMeetingHub(meetingCode, result.participantId);

        // Show the participant's name after the server confirms success.
        // document.getElementById("participantName").textContent =
        //     result.displayName || displayName;

        // Hide the form and show the joined interface.
        document.getElementById("joinSection").hidden = true;
        document.getElementById("joinedSection").hidden = false;

        // Display the conference popup.
        document.getElementById("conferencePopup").style.display = "flex";

        // Show the current user's name with the (me) indicator.
        document.getElementById("localParticipantName").textContent =
            `${result.displayName || displayName} (me)`;

        // Display the meeting title in the popup.
        document.getElementById("conferenceTitle").textContent =
            document.getElementById("meetingTitle").textContent;

    } catch (error) {
        errorElement.textContent =
            error.message || "An unexpected error occurred. Please try again.";

    } finally {
        // Restore the button if joining was unsuccessful.
        if (document.getElementById("joinSection").hidden === false) {
            joinButton.disabled = false;
            joinButton.textContent = "Join Meeting";
        }
    }
});


// Camera and microphone stream
let localStream = null;

let microphoneMuted = false;
let cameraDisabled = false;

const localVideo = document.getElementById("localVideo");
const micButton = document.getElementById("micButton");
const cameraButton = document.getElementById("cameraButton");
const leaveButton = document.getElementById("leaveButton");


// Request available media. Camera failure does not prevent audio-only joining,
// and absence of both devices does not prevent joining the participant list.
async function startLocalMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
        console.warn("Media capture is unavailable in this browser/context.");
        localStream = null;
        return;
    }

    const tracks = [];
    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        tracks.push(...audioStream.getAudioTracks());
    } catch (error) {
        console.warn("Microphone unavailable:", error);
    }

    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        tracks.push(...videoStream.getVideoTracks());
    } catch (error) {
        console.warn("Camera unavailable:", error);
    }

    localStream = new MediaStream(tracks);
    localVideo.srcObject = localStream;

    if (tracks.length === 0) {
        console.info("Joining without local audio/video.");
    }
}

// Shared icon factory used by the local controls and participant indicators.
function makeStatusIcon(kind, description) {
    const icon = document.createElement("span");
    icon.className = "participant-status-icon";
    icon.title = description;
    icon.setAttribute("aria-label", description);
    const image = document.createElement("img");
    image.src = kind === "audio" ? "/images/Mute.png" : "/images/video%20off.png";
    image.alt = "";
    icon.appendChild(image);
    return icon;
}

function renderMediaControlButtons() {
    const micIcon = document.getElementById("micButtonIcon");
    const micText = document.getElementById("micButtonText");
    const cameraIcon = document.getElementById("cameraButtonIcon");
    const cameraText = document.getElementById("cameraButtonText");

    if (micIcon && micText && micButton) {
        if (microphoneMuted) {
            micIcon.innerHTML = '<img src="/images/Mute.png" alt="">';
            micText.textContent = "Unmute microphone";
            micButton.title = "Unmute microphone";
            micButton.setAttribute("aria-label", "Unmute microphone");
            micButton.classList.add("is-off");
        } else {
            micIcon.textContent = "🎤";
            micText.textContent = "Mute microphone";
            micButton.title = "Mute microphone";
            micButton.setAttribute("aria-label", "Mute microphone");
            micButton.classList.remove("is-off");
        }
    }

    if (cameraIcon && cameraText && cameraButton) {
        if (cameraDisabled) {
            cameraIcon.innerHTML = '<img src="/images/video%20off.png" alt="">';
            cameraText.textContent = "Turn camera on";
            cameraButton.title = "Turn camera on";
            cameraButton.setAttribute("aria-label", "Turn camera on");
            cameraButton.classList.add("is-off");
        } else {
            cameraIcon.textContent = "📷";
            cameraText.textContent = "Turn camera off";
            cameraButton.title = "Turn camera off";
            cameraButton.setAttribute("aria-label", "Turn camera off");
            cameraButton.classList.remove("is-off");
        }
    }
}

async function sendMediaStatusToHub() {
    if (!meetingConnection || meetingConnection.state !== signalR.HubConnectionState.Connected) return;
    try {
        await meetingConnection.invoke("UpdateMediaStatus", microphoneMuted, cameraDisabled);
    } catch (error) {
        console.error("Could not update participant media status:", error);
    }
}

function refreshLocalMediaStatus() {
    const status = {
        participantId: currentParticipantId,
        displayName: document.getElementById("localParticipantName").textContent.replace(/ \(me\)$/, ""),
        isMutedAudio: microphoneMuted,
        isMutedVideo: cameraDisabled
    };
    // Update the local participant row/tile immediately.
    const localItem = document.getElementById(`participant-${currentParticipantId}`);
    if (localItem) {
        const icons = localItem.querySelector(".participant-status-icons");
        if (icons) {
            icons.replaceChildren();
            if (microphoneMuted) icons.appendChild(makeStatusIcon("audio", "Microphone muted"));
            if (cameraDisabled) icons.appendChild(makeStatusIcon("video", "Camera off"));
        }
    }
    const localCard = document.getElementById("localVideoCard");

    // Local video fullscreen button
    const localFullscreenButton =
        document.querySelector(
            '#localVideoCard .video-fullscreen-button'
        );

  if (localFullscreenButton) {
    localFullscreenButton.addEventListener(
        "click",
        () => {
            toggleParticipantExpanded(
                document.getElementById("localVideoCard")
            );
        }
    );
}



    if (localCard) {
        let icons = localCard.querySelector(".video-status-icons");
        if (!icons) {
            icons = document.createElement("div");
            icons.className = "video-status-icons";
            localCard.appendChild(icons);
        }
        icons.replaceChildren();
        if (microphoneMuted) icons.appendChild(makeStatusIcon("audio", "Microphone muted"));
        if (cameraDisabled) icons.appendChild(makeStatusIcon("video", "Camera off"));
    }
    sendMediaStatusToHub();
}

// Mute and unmute microphone.
if (micButton) {
    micButton.addEventListener("click", () => {
        if (!localStream) {
            alert("Your microphone has not started yet.");
            return;
        }

        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length === 0) {
            alert("No microphone audio track is available.");
            return;
        }

        microphoneMuted = !microphoneMuted;
        audioTracks.forEach(track => { track.enabled = !microphoneMuted; });
        renderMediaControlButtons();
        refreshLocalMediaStatus();
    });
}

// Turn camera on and off.
if (cameraButton) {
    cameraButton.addEventListener("click", () => {
        if (!localStream) {
            alert("Your camera has not started yet.");
            return;
        }

        const videoTracks = localStream.getVideoTracks();
        if (videoTracks.length === 0) {
            alert("No camera video track is available.");
            return;
        }

        cameraDisabled = !cameraDisabled;
        videoTracks.forEach(track => { track.enabled = !cameraDisabled; });
        renderMediaControlButtons();
        refreshLocalMediaStatus();
    });
}

renderMediaControlButtons();

// Stop camera and microphone
function stopLocalMedia() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());

        localStream = null;
        localVideo.srcObject = null;
    }
}

// Close conference popup = Leave meeting
const closeConferenceButton =
    document.getElementById("closeConferenceButton");

if (closeConferenceButton) {
    closeConferenceButton.addEventListener("click", () => {
        leaveButton.click();
    });
}

// =========================
// Chat / Participants toggle
// =========================

const chatToggleButton =
    document.getElementById("chatToggleButton");

const participantsToggleButton =
    document.getElementById("participantsToggleButton");

const chatSidebar =
    document.getElementById("chatSidebar");

const participantsSidebar =
    document.getElementById("participantsSidebar");



function updateConferenceLayout() {
    const conferenceMain =
        document.querySelector(".conference-main");

    if (!conferenceMain) return;

    const chatVisible =
        chatSidebar && !chatSidebar.hidden;

    const participantsVisible =
        participantsSidebar && !participantsSidebar.hidden;

    const sidePanelVisible =
        chatVisible || participantsVisible;

    conferenceMain.classList.toggle(
        "side-panel-visible",
        sidePanelVisible
    );

    // Recalculate video sizes/columns
    updateVideoGridLayout();
}

function updateVideoGridLayout() {
    const videoGrid = document.getElementById("videoGrid");
    const conferenceMain =
        document.querySelector(".conference-main");

    if (!videoGrid || !conferenceMain) return;

    const videoCards =
        videoGrid.querySelectorAll(".video-card");

    const participantCount = videoCards.length;

    const sidePanelVisible =
        conferenceMain.classList.contains("side-panel-visible");

    // Reset layout classes
    videoGrid.classList.remove("single-video");

    if (participantCount === 0) {
        videoGrid.style.gridTemplateColumns = "1fr";
        return;
    }

    /*
     * ONE PARTICIPANT
     */
    if (participantCount === 1) {

        videoGrid.style.gridTemplateColumns = "1fr";

        /*
         * When there is no sidebar, the single participant
         * fills the entire conference video area.
         */
        if (!sidePanelVisible) {
            videoGrid.classList.add("single-video");
        }

        return;
    }

    /*
     * MULTIPLE PARTICIPANTS
     */

    const maxColumns = sidePanelVisible ? 2 : 3;

    const columns =
        Math.min(participantCount, maxColumns);

    videoGrid.style.gridTemplateColumns =
        `repeat(${columns}, minmax(0, 1fr))`;
}


// Show / hide Chat
if (chatToggleButton) {
    chatToggleButton.addEventListener("click", () => {
        if (!chatSidebar) return;

        chatSidebar.hidden = !chatSidebar.hidden;

        chatToggleButton.classList.toggle(
            "is-active",
            !chatSidebar.hidden
        );

        updateConferenceLayout();
    });
}


if (participantsToggleButton) {
    participantsToggleButton.addEventListener("click", () => {
        if (!participantsSidebar) return;

        participantsSidebar.hidden =
            !participantsSidebar.hidden;

        participantsToggleButton.classList.toggle(
            "is-active",
            !participantsSidebar.hidden
        );

        updateConferenceLayout();
    });
}

// =========================================
// Video Fullscreen
// =========================================

// async function enterVideoFullscreen(videoCard) {
//     if (!videoCard) return;

//     try {
//         if (document.fullscreenElement) {
//             await document.exitFullscreen();
//         }

//         if (videoCard.requestFullscreen) {
//             await videoCard.requestFullscreen();
//         }
//     } catch (error) {
//         console.error(
//             "Unable to enter video fullscreen:",
//             error
//         );
//     }
// }


function toggleParticipantExpanded(videoCard) {
    const videoGrid = document.getElementById("videoGrid");

    if (!videoGrid || !videoCard) return;

    const isExpanded =
        videoGrid.classList.contains("single-participant-view");

    if (isExpanded) {

        // Return to normal grid
        videoGrid.classList.remove(
            "single-participant-view"
        );

        videoGrid
            .querySelectorAll(".video-card")
            .forEach(card => {
                card.style.display = "";
            });

        updateVideoGridLayout();

    } else {

        // Expand selected participant
        videoGrid.classList.add(
            "single-participant-view"
        );

        // Hide all other participant cards
        videoGrid
            .querySelectorAll(".video-card")
            .forEach(card => {
                card.style.display =
                    card === videoCard ? "" : "none";
            });

        // Make sure selected card is visible
        videoCard.style.display = "";
    }
}



document.addEventListener("click", (event) => {

    const button =
        event.target.closest(
            ".video-fullscreen-button"
        );

    if (!button) return;

    const videoCard =
        button.closest(".video-card");

    if (!videoCard) return;

    enterVideoFullscreen(videoCard);
});


document.addEventListener(
    "fullscreenchange",
    () => {

        const fullscreenCard =
            document.fullscreenElement;

        document
            .querySelectorAll(
                ".video-fullscreen-button"
            )
            .forEach(button => {

                if (fullscreenCard &&
                    button.closest(".video-card")
                    === fullscreenCard) {

                    button.textContent = "⛶";
                    button.title = "Exit full screen";

                } else {

                    button.textContent = "⛶";
                    button.title = "Full screen";
                }
            });
    }
);

// Leave the meeting
if (leaveButton) {
    leaveButton.addEventListener("click", () => {
        const confirmLeave = confirm("Are you sure you want to leave the meeting?");

        if (confirmLeave) {
            stopLocalMedia();
            window.location.href = "/";
        }
    });
}

loadMeeting();