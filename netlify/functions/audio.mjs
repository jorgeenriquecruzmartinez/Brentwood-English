import { getStore } from '@netlify/blobs';

const safe = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
const fail = (message, status = 400) => Response.json({ error: message }, { status });

export default async (request) => {
  const url = new URL(request.url);
  const attemptId = safe(url.searchParams.get('attemptId'));
  const slot = safe(url.searchParams.get('slot'));
  if (!attemptId || !slot) return fail('Missing attemptId or slot');

  const store = getStore({ name: 'brentwood-speaking-audio', consistency: 'strong' });
  const key = `${attemptId}/${slot}`;

  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || 'audio/webm';
    const data = await request.arrayBuffer();
    if (!data.byteLength) return fail('Empty audio upload');
    await store.set(key, data, { metadata: { contentType: type, bytes: data.byteLength } });
    return Response.json({ ok: true, bytes: data.byteLength });
  }

  if (request.method === 'GET') {
    const entry = await store.getWithMetadata(key, { type: 'arrayBuffer', consistency: 'strong' });
    if (!entry?.data) return fail('Recording not found', 404);
    return new Response(entry.data, {
      headers: {
        'content-type': entry.metadata?.contentType || 'audio/webm',
        'cache-control': 'private, max-age=60',
      }
    });
  }

  return fail('Method not allowed', 405);
};
