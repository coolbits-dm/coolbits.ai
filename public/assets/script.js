document.addEventListener("DOMContentLoaded", () => {
  const composer = document.querySelector("[data-chat-composer]");
  if (!composer) return;

  const input = composer.querySelector("input[name='question']");
  const button = composer.querySelector("button");

  const redirectToChat = (message) => {
    const trimmed = message.trim();
    const query = trimmed ? `?first=${encodeURIComponent(trimmed)}` : "";
    window.location.href = `/chat${query}`;
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
});
