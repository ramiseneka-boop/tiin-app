import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

// Public capability endpoint, NOT a public database. PKCE verifiers and sessions
// never enter this relay. Every claim requires a separate 256-bit device secret.
const origin = 'https://tiin-app.vercel.app';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer', 'Vary': 'Origin'
};
const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
const hex = /^[a-f0-9]{64}$/;
async function hash(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });
  if (req.headers.get('origin') !== origin) return respond(403, { error: 'Origin not allowed' });
  try {
    const raw = await req.text();
    if (raw.length > 4096) return respond(413, { error: 'Request too large' });
    const body = JSON.parse(raw);
    if (!hex.test(body.id || '')) return respond(400, { error: 'Invalid challenge' });
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const now = new Date().toISOString();
    if (body.action === 'create') {
      if (!hex.test(body.claimHash || '')) return respond(400, { error: 'Invalid device secret hash' });
      const ipHash = await hash(req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown');
      const { count, error: rateError } = await db.from('auth_pkce_handoffs').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gt('expires_at', now);
      if (rateError) throw rateError;
      if ((count || 0) >= 20) return respond(429, { error: 'Подождите несколько минут перед новым входом' });
      // Clear only expired authentication challenges; never financial records.
      await db.from('auth_pkce_handoffs').delete().lt('expires_at', now);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const { error } = await db.from('auth_pkce_handoffs').insert({ id: body.id, claim_hash: body.claimHash, ip_hash: ipHash, expires_at: expiresAt });
      if (error) throw error;
      return respond(201, { expiresAt });
    }
    if (body.action === 'complete') {
      if (typeof body.code !== 'string' || !/^[a-zA-Z0-9_-]{10,2000}$/.test(body.code)) return respond(400, { error: 'Invalid PKCE code' });
      const { data, error } = await db.from('auth_pkce_handoffs').update({ code: body.code }).eq('id', body.id).gt('expires_at', now).is('code', null).select('id');
      if (error) throw error;
      if (!data?.length) return respond(410, { error: 'Подтверждение истекло или уже принято. Начните вход заново в TIIN.' });
      return respond(200, { ready: true });
    }
    if (!hex.test(body.secret || '')) return respond(403, { error: 'Device secret required' });
    const claimHash = await hash(body.secret);
    if (body.action === 'claim') {
      const { data, error } = await db.from('auth_pkce_handoffs').select('code').eq('id', body.id).eq('claim_hash', claimHash).gt('expires_at', now).maybeSingle();
      if (error) throw error;
      if (!data) return respond(403, { error: 'Подтверждение недоступно. Начните вход заново в TIIN.' });
      return respond(200, { code: data.code || null });
    }
    if (body.action === 'ack') {
      const { error } = await db.from('auth_pkce_handoffs').delete().eq('id', body.id).eq('claim_hash', claimHash);
      if (error) throw error;
      return respond(200, { removed: true });
    }
    return respond(400, { error: 'Unknown action' });
  } catch (_) {
    // Never log bodies, codes, secrets or tokens.
    return respond(500, { error: 'Подтверждение входа временно недоступно' });
  }
});
