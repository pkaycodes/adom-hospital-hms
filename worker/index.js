import { handleApi } from './api.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'same-origin');
    headers.set('X-Frame-Options', 'DENY');
    if (response.status === 404 && (request.headers.get('Accept') || '').includes('text/html')) {
      const fallback = await env.ASSETS.fetch(new Request(new URL('/', url).toString(), request));
      if (fallback.ok) return fallback;
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
