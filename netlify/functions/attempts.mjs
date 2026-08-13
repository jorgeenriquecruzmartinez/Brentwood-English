import { getStore } from '@netlify/blobs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
const safeId = value => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);

export default async (request) => {
  const store = getStore({ name: 'brentwood-attempts', consistency: 'strong' });
  const url = new URL(request.url);

  if (request.method === 'POST') {
    const attempt = await request.json();
    const id = safeId(attempt?.id);
    if (!id || !attempt?.student || !attempt?.label) return json({ error: 'Invalid attempt payload' }, 400);
    attempt.id = id;
    await store.setJSON(`attempt/${id}`, attempt, {
      metadata: {
        student: String(attempt.student).slice(0, 120),
        label: String(attempt.label).slice(0, 120),
        completedAt: String(attempt.completedAt || attempt.startedAt || '').slice(0, 40),
        kind: String(attempt.kind || '').slice(0, 30),
      }
    });
    return json({ ok: true, id });
  }

  if (request.method === 'PATCH') {
    const body = await request.json();
    const id = safeId(body?.id);
    if (!id) return json({ error: 'Missing id' }, 400);
    const key = `attempt/${id}`;
    const current = await store.get(key, { type: 'json', consistency: 'strong' });
    if (!current) return json({ error: 'Attempt not found' }, 404);
    current.teacher = body.teacher || {};
    await store.setJSON(key, current, {
      metadata: {
        student: String(current.student || '').slice(0, 120),
        label: String(current.label || '').slice(0, 120),
        completedAt: String(current.completedAt || current.startedAt || '').slice(0, 40),
        kind: String(current.kind || '').slice(0, 30),
      }
    });
    return json({ ok: true });
  }

  if (request.method === 'GET') {
    const requestedId = safeId(url.searchParams.get('id'));
    if (requestedId) {
      const attempt = await store.get(`attempt/${requestedId}`, { type: 'json', consistency: 'strong' });
      return attempt ? json(attempt) : json({ error: 'Attempt not found' }, 404);
    }

    const { blobs } = await store.list({ prefix: 'attempt/' });
    const attempts = (await Promise.all(blobs.map(async ({ key }) => {
      try { return await store.get(key, { type: 'json' }); } catch { return null; }
    }))).filter(Boolean);
    attempts.sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
    return json(attempts);
  }

  return json({ error: 'Method not allowed' }, 405);
};
