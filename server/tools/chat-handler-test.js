import 'dotenv/config';
import { handleChat } from '../../app/server/chat.js';

const SAMPLE_TEXT =
  process.argv.slice(2).join(' ') ||
  'Design a short onboarding workflow for a new automation client with crm + analytics.';

function createRequest(message) {
  return {
    method: 'POST',
    headers: {
      'accept-language': 'en-US,en;q=0.9',
    },
    body: {
      message,
      history: [],
    },
    ip: '127.0.0.1',
    socket: {
      remoteAddress: '127.0.0.1',
    },
  };
}

function createResponse(resolve) {
  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolve({
        statusCode: this.statusCode ?? 200,
        payload,
      });
      return this;
    },
  };
  return response;
}

async function main() {
  const req = createRequest(SAMPLE_TEXT);
  const result = await new Promise((resolve) => {
    const res = createResponse(resolve);
    handleChat(req, res).catch((error) => {
      console.error('Handler threw an error:', error);
      resolve({
        statusCode: 500,
        payload: { error: error.message },
      });
    });
  });

  console.log('Chat handler result:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Unexpected failure:', error);
  process.exitCode = 1;
});
