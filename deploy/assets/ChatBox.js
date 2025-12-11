import { MessageList } from './MessageList.js';
import { FooterComposer } from './FooterComposer.js';

export class ChatBox {
  constructor({ onSend }) {
    this.onSend = onSend;
    this.element = document.createElement('section');
    this.element.className = 'chat-shell';

    this.header = document.createElement('header');
    this.header.className = 'chat-header';
    this.header.innerHTML = `
      <div class="chat-header-top">
        <h1>CoolBits.AI Live Chat</h1>
        <p class="chat-subtitle" data-subtitle>Status: LEVEL-0</p>
      </div>
      <div class="chat-pills">
        <p class="chat-pill" data-level-pill>Guest tier</p>
        <span class="reasoning-chip" data-reasoning-badge>Reasoning inactive</span>
      </div>
    `;
    this.levelPill = this.header.querySelector('[data-level-pill]');
    this.subtitle = this.header.querySelector('[data-subtitle]');
    this.statusNotice = this.header.querySelector('[data-reasoning-badge]');

    this.body = document.createElement('div');
    this.body.className = 'chat-body';

    this.messageList = new MessageList();
    this.body.appendChild(this.messageList.element);

    this.composer = new FooterComposer({
      onSubmit: (text) => this.onSend && this.onSend(text),
    });

    this.element.append(this.header, this.body, this.composer.element);
  }

  addMessage(role, content) {
    this.messageList.addMessage({ role, content });
  }

  setDraft(value) {
    if (this.composer?.setDraft) {
      this.composer.setDraft(value);
    }
  }

  setSending(state) {
    this.composer.setBusy(state);
  }

  getHistory() {
    return this.messageList.getHistory();
  }

  setError(message) {
    this.composer.setError(message);
  }

  setProfile(profile = {}) {
    if (this.levelPill) {
      this.levelPill.textContent = profile.capabilities?.label || 'Guest tier';
    }
  }

  setStatusMeta({ level, flags } = {}) {
    const levelLabel = level ? String(level).toUpperCase() : 'LEVEL-0';
    if (this.subtitle) {
      this.subtitle.textContent = `Status: ${levelLabel}`;
    }
    if (this.statusNotice) {
      if (flags?.wantsPlan) {
        this.statusNotice.textContent = 'Exploring full campaign plan potential.';
        this.statusNotice.dataset.state = 'active';
      } else if (flags?.hasEmailIntent) {
        this.statusNotice.textContent = 'Lead intent detected via email.';
        this.statusNotice.dataset.state = 'active';
      } else {
        this.statusNotice.textContent = "Tell us what you're trying to improve.";
        this.statusNotice.dataset.state = 'idle';
      }
    }
  }
}
