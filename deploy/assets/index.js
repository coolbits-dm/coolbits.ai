import { ChatLayout } from './ChatLayout.js';

const root = document.getElementById('chat-root');
if (root) {
  new ChatLayout(root);
} else {
  console.error('Chat root not found.');
}
