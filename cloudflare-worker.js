export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/:\d+$/, '');

    if (url.pathname.startsWith('/api/')) {
      const target = `https://cloud.cblm.ai${url.pathname}${url.search}`;
      return fetch(target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
