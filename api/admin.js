import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

const PAGE_SIZE = 20

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Verify password server-side — never exposed to client
  const auth = req.headers.authorization
  const password = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { action, ...params } = req.body

  try {
    // ── fetch tab data ──────────────────────────────────────────
    if (action === 'fetch') {
      const { tab, page = 0 } = params
      const from = page * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      if (tab === 'flagged') {
        const { data, error } = await adminSupabase
          .from('opinions')
          .select('*, profiles(display_name, username)')
          .eq('status', 'flagged')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) return res.status(500).json({ error: error.message })
        return res.json({ data })
      }

      if (tab === 'opinions') {
        const { data, error } = await adminSupabase
          .from('opinions')
          .select('*, profiles(display_name, username)')
          .order('mod_score', { ascending: false, nullsFirst: false })
          .range(from, to)
        if (error) return res.status(500).json({ error: error.message })
        return res.json({ data })
      }

      if (tab === 'debates') {
        const { data, error } = await adminSupabase
          .from('debate_replies')
          .select('*, profiles!debate_replies_user_id_fkey(display_name, username), opinions(text)')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) return res.status(500).json({ error: error.message })
        return res.json({ data })
      }

      if (tab === 'users') {
        const { data, error } = await adminSupabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to)
        if (error) return res.status(500).json({ error: error.message })
        return res.json({ data })
      }

      return res.status(400).json({ error: 'Unknown tab' })
    }

    // ── approve opinion ─────────────────────────────────────────
    if (action === 'approve') {
      const { id } = params
      const { error } = await adminSupabase.from('opinions').update({ status: 'approved' }).eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── delete opinion ──────────────────────────────────────────
    if (action === 'delete_opinion') {
      const { id } = params
      await adminSupabase.from('votes').delete().eq('opinion_id', id)
      await adminSupabase.from('debate_replies').delete().eq('opinion_id', id)
      const { error } = await adminSupabase.from('opinions').delete().eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── delete reply ────────────────────────────────────────────
    if (action === 'delete_debate') {
      const { id } = params
      const { error } = await adminSupabase.from('debate_replies').delete().eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ── delete user profile ─────────────────────────────────────
    if (action === 'delete_user') {
      const { id } = params
      const { error } = await adminSupabase.from('profiles').delete().eq('id', id)
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
