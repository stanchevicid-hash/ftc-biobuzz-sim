// Who played, on the Netlify site: same contract as /api/teams in SimServer.java.
// POST {team, name} counts a visit; any POST returns {teams: [{team, name, visits, last}]}.
import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const store = getStore({ name: 'teams', consistency: 'strong' });
  const list = (await store.get('all', { type: 'json' })) || [];
  const body = await req.json().catch(() => ({}));
  const team = String(body.team ?? ''), name = String(body.name ?? '').replace(/[\p{Cc}<>]/gu, '').trim();
  if (/^\d{1,5}$/.test(team) && name && name.length <= 24) {
    // ponytail: read-modify-write of one blob, two visits in the same instant can lose one count; fine for a team list
    let hit = list.find(m => m.team === team && m.name.toLowerCase() === name.toLowerCase());
    if (!hit) list.push(hit = { team, name, visits: 0 });
    hit.visits++; hit.last = Date.now();
    await store.setJSON('all', list);
  }
  return Response.json({ teams: list });
};

export const config = { path: '/api/teams' };
