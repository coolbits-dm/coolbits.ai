import http from 'node:http';
import { PassThrough } from 'node:stream';
import supertest from 'supertest';

process.env.USE_REAL_LLM = '0';

const ok = (message) => console.log(`[ok] ${message}`);
const fail = (message, detail = '') => {
  console.error(`[fail] ${message}${detail ? `: ${detail}` : ''}`);
  process.exit(1);
};

const expect = (condition, message, detail = '') => {
  if (condition) {
    ok(message);
  } else {
    fail(message, detail);
  }
};

const getErrorCode = (body) => body?.error || body?.code || body?.errorCode || null;

const normalizeHeaders = (headers = {}) => {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[String(key).toLowerCase()] = value;
  }
  return normalized;
};

const buildInProcessRequester = (app) => {
  const send = ({ method, url, headers = {}, body }) =>
    new Promise((resolve, reject) => {
      const socket = new PassThrough();
      socket.readable = true;
      socket.writable = true;
      socket.remoteAddress = '127.0.0.1';
      socket.setTimeout = () => {};
      socket.setNoDelay = () => {};
      socket.cork = () => {};
      socket.uncork = () => {};
      socket.destroy = () => {};

      const req = new http.IncomingMessage(socket);
      req.method = method.toUpperCase();
      req.url = url;
      req.headers = normalizeHeaders(headers);
      req.connection = socket;
      req.socket = socket;

      if (body !== undefined) {
        const payload =
          typeof body === 'string' ? body : JSON.stringify(body);
        if (!req.headers['content-type']) {
          req.headers['content-type'] = 'application/json';
        }
        req.headers['content-length'] = Buffer.byteLength(payload);
        req.push(payload);
      }
      req.push(null);

      const res = new http.ServerResponse(req);
      res.assignSocket(socket);
      const chunks = [];
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);
      res.write = (chunk, encoding, cb) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }
        return originalWrite(chunk, encoding, cb);
      };
      res.end = (chunk, encoding, cb) => {
        if (chunk) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
        }
        return originalEnd(chunk, encoding, cb);
      };

      res.on('finish', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.getHeaders(),
          text,
          body: parsed,
        });
      });
      res.on('error', reject);

      app.handle(req, res);
    });

  return {
    get: (url, headers = {}) => send({ method: 'GET', url, headers }),
    post: (url, headers = {}, body) => send({ method: 'POST', url, headers, body }),
  };
};

const buildSupertestRequester = (app) => ({
  get: (url, headers = {}) => supertest(app).get(url).set(headers),
  post: (url, headers = {}, body) => supertest(app).post(url).set(headers).send(body),
});

const run = async () => {
  const { createApp } = await import('../app/server/app.js');
  const app = createApp();
  const request = process.env.PBAD_USE_SUPERTEST === '1'
    ? buildSupertestRequester(app)
    : buildInProcessRequester(app);
  let token = '';
  try {
    const smokeEmail = `smoke+workspaces+${Date.now()}@coolbits.ai`;
    const loginRes = await request.post(
      '/api/auth/mock-login',
      {},
      { email: smokeEmail },
    );
    expect(loginRes.status === 200, 'mock-login returns 200', `status=${loginRes.status}`);
    token = loginRes.body?.token || '';
    expect(Boolean(token), 'mock-login returns token');
  } catch (err) {
    fail('mock-login request failed', err?.message || String(err));
  }

  if (!token) {
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}` };

  // A) PBAD auto-seed + order
  try {
    const wsRes = await request.get('/api/workspaces', auth);
    expect(wsRes.status === 200, 'workspaces list returns 200', `status=${wsRes.status}`);
    const items = Array.isArray(wsRes.body?.items) ? wsRes.body.items : [];
    expect(items.length >= 4, 'workspaces list returns items');

    const system = items.filter((ws) => ws?.workspaceType === 'system');
    const systemIds = system.map((ws) => ws.id).sort();
    const expectedIds = ['agency', 'business', 'developer', 'personal'].sort();
    expect(
      system.length === 4,
      'four system workspaces exist',
      `count=${system.length}`,
    );
    expect(
      JSON.stringify(systemIds) === JSON.stringify(expectedIds),
      'system workspaces include PBAD ids',
      `ids=${systemIds.join(',')}`,
    );

    const slugMap = {
      personal: 'p',
      business: 'b',
      agency: 'a',
      developer: 'd',
    };
    const slugMismatch = system
      .filter((ws) => slugMap[ws.id] !== ws.slug)
      .map((ws) => `${ws.id}:${ws.slug}`)
      .join(',');
    expect(!slugMismatch, 'system slugs match PBAD mapping', slugMismatch);

    const systemFirst = items.slice(0, system.length).every((ws) => ws?.workspaceType === 'system');
    expect(systemFirst, 'system workspaces listed first');
  } catch (err) {
    fail('workspaces list failed', err?.message || String(err));
  }

  // B) Custom workspace cap
  try {
    const first = await request.post('/api/workspaces', auth, { name: 'Client Alpha' });
    expect(first.status >= 200 && first.status < 300, 'create first custom workspace succeeds');

    const second = await request.post('/api/workspaces', auth, { name: 'Client Beta' });
    const secondCode = getErrorCode(second.body);
    expect(
      second.status >= 400,
      'second custom workspace blocked on starter cap',
      `status=${second.status}`,
    );
    expect(
      secondCode === 'workspace_limit_reached',
      'workspace_limit_reached error code returned',
      `code=${secondCode || 'missing'}`,
    );
  } catch (err) {
    fail('workspace cap test failed', err?.message || String(err));
  }

  // C) Cross-workspace payload attach must fail
  try {
    const cbpl = {
      schemaVersion: 'cbpl.v1',
      kind: 'selection',
      intent: 'read_only',
      selection: { workspaceId: 'business' },
    };
    const payloadRes = await request.post(
      '/api/payloads',
      auth,
      { name: 'smoke-payload', kind: 'selection', cbpl },
    );
    expect(payloadRes.status === 201, 'payload create returns 201', `status=${payloadRes.status}`);
    const payloadId = payloadRes.body?.payloadId || '';
    expect(Boolean(payloadId), 'payloadId returned');

    const previewRes = await request.post(
      '/api/runs/preview',
      auth,
      { objective: 'smoke', workspaceId: 'agency', payloadIds: [payloadId] },
    );
    const previewCode = getErrorCode(previewRes.body);
    expect(
      previewRes.status >= 400,
      'cross-workspace preview blocked',
      `status=${previewRes.status}`,
    );
    expect(
      previewCode === 'workspace_mismatch',
      'workspace_mismatch error code returned',
      `code=${previewCode || 'missing'}`,
    );
  } catch (err) {
    fail('cross-workspace payload test failed', err?.message || String(err));
  }

  process.exit(0);
};

run().catch((err) => {
  fail('unexpected error', err?.message || String(err));
});
