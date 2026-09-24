const createMeetingForm = document.getElementById("createMeetingForm");

if (createMeetingForm) {
    createMeetingForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const title = document.getElementById("title").value.trim();
        const description = document.getElementById("description").value.trim();

        const createButton = document.getElementById("createMeetingButton");
        const message = document.getElementById("message");
        const meetingResult = document.getElementById("meetingResult");

        message.hidden = true;
        meetingResult.hidden = true;

        createButton.disabled = true;
        createButton.textContent = "Creating Meeting...";

        try {
            const response = await fetch("/api/meetings", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    title: title,
                    description: description || null
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Unable to create meeting.");
            }

            const meetingLink = `${window.location.origin}/meeting.html?id=${encodeURIComponent(result.meetingId)}`;

            document.getElementById("meetingLink").value = meetingLink;
            document.getElementById("enterMeetingButton").href = meetingLink;

            meetingResult.hidden = false;

        } catch (error) {
            message.textContent = error.message || "Something went wrong.";
            message.hidden = false;

        } finally {
            createButton.disabled = false;
            createButton.textContent = "Create Meeting";
        }
    });
}

const copyLinkButton = document.getElementById("copyLinkButton");

if (copyLinkButton) {
    copyLinkButton.addEventListener("click", async function () {
        const meetingLink = document.getElementById("meetingLink").value;

        try {
            await navigator.clipboard.writeText(meetingLink);

            copyLinkButton.textContent = "Copied!";

            setTimeout(() => {
                copyLinkButton.textContent = "Copy Link";
            }, 2000);

        } catch {
            const input = document.getElementById("meetingLink");
            input.select();

            const copied = document.execCommand("copy");

            copyLinkButton.textContent = copied ? "Copied!" : "Select and copy";

            setTimeout(() => {
                copyLinkButton.textContent = "Copy Link";
            }, 2000);
        }
    });
}