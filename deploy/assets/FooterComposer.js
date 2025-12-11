export class FooterComposer {
  constructor({ onSubmit }) {
    this.onSubmit = onSubmit;
    this.element = document.createElement('footer');
    this.element.className = 'chat-composer';

    this.form = document.createElement('form');
    this.form.className = 'composer-form';

    this.textarea = document.createElement('textarea');
    this.textarea.placeholder = 'Type your message... (Enter to send, Shift+Enter for new line)';
    this.textarea.rows = 1;
    this.textarea.required = true;
    this.textarea.setAttribute('aria-label', 'Chat message');

    this.button = document.createElement('button');
    this.button.type = 'submit';
    this.button.textContent = 'Send';

    this.form.append(this.textarea, this.button);
    this.error = document.createElement('p');
    this.error.className = 'composer-error';
    this.error.hidden = true;
    this.element.append(this.form, this.error);

    // Handle Enter key behavior
    this.textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        this.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    });

    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = this.textarea.value.trim();
      if (!value) {
        return;
      }
      this.textarea.value = '';
      this.onSubmit?.(value);
      this.textarea.focus();
    });
  }

  setBusy(state) {
    this.button.disabled = !!state;
    this.textarea.disabled = !!state;
    if (!state) {
      this.textarea.focus();
    }
  }

  setError(message = '') {
    if (!this.error) return;
    if (message) {
      this.error.textContent = message;
      this.error.hidden = false;
    } else {
      this.error.textContent = '';
      this.error.hidden = true;
    }
  }

  setDraft(value = '') {
    if (!this.textarea) return;
    this.textarea.value = value || '';
    const cursor = this.textarea.value.length;
    this.textarea.setSelectionRange(cursor, cursor);
  }
}
