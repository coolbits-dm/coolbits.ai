export class MessageList {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'chat-messages';
    this.messages = [];
    this.renderEmpty();
  }

  renderEmpty() {
    this.element.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'chat-message system';
    placeholder.textContent = 'No conversation yet. Describe your automation idea to begin.';
    this.element.appendChild(placeholder);
  }

  addMessage(message) {
    if (!message || !message.content) {
      return;
    }
    this.messages.push(message);
    this.render();
  }

  getHistory() {
    return this.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  render() {
    this.element.innerHTML = '';
    if (!this.messages.length) {
      this.renderEmpty();
      return;
    }

    this.messages.forEach(({ role, content }) => {
      const bubble = document.createElement('div');
      const normalizedRole = ['user', 'bot', 'assistant'].includes(role)
        ? (role === 'assistant' ? 'bot' : role)
        : 'system';
      bubble.className = `chat-message ${normalizedRole}`;
      bubble.textContent = content;
      this.element.appendChild(bubble);
    });

    this.element.scrollTop = this.element.scrollHeight;
  }
}
