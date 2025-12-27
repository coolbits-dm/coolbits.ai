import { createApp } from './app.js';

console.log('[COOLBITS_BOOT]', import.meta.url);

const app = createApp();
const PORT = process.env.PORT || 8788;
app.listen(PORT, () => {
  console.log(`CoolBits.ai server running on port ${PORT}`);
});
