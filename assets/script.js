// Landing page script - handles redirect to chat
function initLandingComposer() {
  const composer = document.querySelector("[data-chat-composer]");
  if (!composer) return;

  const input = composer.querySelector("input[name='question']");
  const button = composer.querySelector("button");

  const redirectToChat = (message) => {
    const trimmed = message.trim();
    const query = trimmed ? `?first=${encodeURIComponent(trimmed)}` : "";
    window.location.href = `/chat.html${query}`;
  };

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input) {
      redirectToChat("");
      return;
    }

    const value = input.value || "";
    button?.setAttribute("disabled", "true");
    redirectToChat(value);
  });
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLandingComposer);
} else {
  initLandingComposer();
}
