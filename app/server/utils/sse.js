export function initSse(res) {
  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }
}

export function sendSse(res, event, data) {
  if (!res || res.writableEnded) return;
  const payload = data == null ? '' : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

export function endSse(res) {
  if (!res || res.writableEnded) return;
  res.end();
}

export default { initSse, sendSse, endSse };
