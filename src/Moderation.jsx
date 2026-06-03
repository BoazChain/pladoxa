import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

const MOD_PASSWORD = import.meta.env.VITE_MOD_PASSWORD || 'admin123'

// Service role client — bypasses RLS for mod actions
const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, storageKey: 'admin-auth' } }
)

export default function Moderation() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  function tryLogin(e) {
    e.preventDefault()
    if (pw === MOD_PASSWORD) setAuthed(true)
    else setPwError('Incorrect password.')
  }

  if (!authed) {
    return (
      <div className="mod-gate">
        <div className="mod-gate-box">
          <h2 className="mod-gate-title">Moderation</h2>
          <form onSubmit={tryLogin}>
            <input
              className="auth-input"
              type="password"
              placeholder="Password"
              value={pw}
              onChange={e => setPw(e.target.value)}
              autoFocus
            />
            {pwError && <p className="auth-error">{pwError}</p>}
            <button className="submit-btn" type="submit">Enter</button>
          </form>
          <button className="auth-link" style={{ marginTop: 12, display: 'block' }} onClick={() => window.location.hash = '/'}>
            ← Back to site
          </button>
        </div>
      </div>
    )
  }

  return <ModDashboard />
}

const MOD_PAGE_SIZE = 20

function ModDashboard() {
  const [tab, setTab] = useState('flagged')
  const [opinions, setOpinions] = useState([])
  const [flagged, setFlagged] = useState([])
  const [debates, setDebates] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState({ opinions: true, debates: true, users: true, flagged: true })
  const pageRef = useRef({ opinions: 0, debates: 0, users: 0, flagged: 0 })
  const sentinelRef = useRef(null)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    resetTab(tab)
  }, [tab])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && !loading) loadMoreTab(tab)
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [tab, loadingMore, loading])

  function resetTab(t) {
    pageRef.current[t] = 0
    setHasMore(h => ({ ...h, [t]: true }))
    if (t === 'opinions') { setOpinions([]); loadOpinions(0, true) }
    else if (t === 'flagged') { setFlagged([]); loadFlagged(0, true) }
    else if (t === 'debates') { setDebates([]); loadDebates(0, true) }
    else if (t === 'users') { setUsers([]); loadUsers(0, true) }
  }

  function loadMoreTab(t) {
    if (!hasMore[t] || loadingMore) return
    const page = pageRef.current[t]
    if (t === 'opinions') loadOpinions(page, false)
    else if (t === 'flagged') loadFlagged(page, false)
    else if (t === 'debates') loadDebates(page, false)
    else if (t === 'users') loadUsers(page, false)
  }

  function showToast(msg, type = '') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  async function loadFlagged(page = 0, reset = false) {
    reset ? setLoading(true) : setLoadingMore(true)
    const from = page * MOD_PAGE_SIZE
    const { data, error } = await adminSupabase
      .from('opinions')
      .select('*, profiles(display_name, username)')
      .eq('status', 'flagged')
      .order('created_at', { ascending: false })
      .range(from, from + MOD_PAGE_SIZE - 1)
    if (!error && data) {
      setFlagged(prev => reset ? data : [...prev, ...data])
      setHasMore(h => ({ ...h, flagged: data.length === MOD_PAGE_SIZE }))
      pageRef.current.flagged = page + 1
    } else if (error) showToast('Failed to load flagged.', 'error')
    reset ? setLoading(false) : setLoadingMore(false)
  }

  async function approveOpinion(id) {
    const { error } = await adminSupabase.from('opinions').update({ status: 'approved' }).eq('id', id)
    if (error) showToast('Failed to approve.', 'error')
    else { showToast('Opinion approved ✓'); resetTab('flagged') }
  }

  async function loadOpinions(page = 0, reset = false) {
    reset ? setLoading(true) : setLoadingMore(true)
    const from = page * MOD_PAGE_SIZE
    const { data, error } = await adminSupabase
      .from('opinions')
      .select('*, profiles(display_name, username)')
      .order('created_at', { ascending: false })
      .range(from, from + MOD_PAGE_SIZE - 1)
    if (!error && data) {
      setOpinions(prev => reset ? data : [...prev, ...data])
      setHasMore(h => ({ ...h, opinions: data.length === MOD_PAGE_SIZE }))
      pageRef.current.opinions = page + 1
    } else if (error) showToast('Failed to load opinions.', 'error')
    reset ? setLoading(false) : setLoadingMore(false)
  }

  async function loadDebates(page = 0, reset = false) {
    reset ? setLoading(true) : setLoadingMore(true)
    const from = page * MOD_PAGE_SIZE
    const { data, error } = await adminSupabase
      .from('debate_replies')
      .select('*, profiles(display_name, username), opinions(text)')
      .order('created_at', { ascending: false })
      .range(from, from + MOD_PAGE_SIZE - 1)
    if (!error && data) {
      setDebates(prev => reset ? data : [...prev, ...data])
      setHasMore(h => ({ ...h, debates: data.length === MOD_PAGE_SIZE }))
      pageRef.current.debates = page + 1
    } else if (error) showToast('Failed to load debates.', 'error')
    reset ? setLoading(false) : setLoadingMore(false)
  }

  async function loadUsers(page = 0, reset = false) {
    reset ? setLoading(true) : setLoadingMore(true)
    const from = page * MOD_PAGE_SIZE
    const { data, error } = await adminSupabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + MOD_PAGE_SIZE - 1)
    if (!error && data) {
      setUsers(prev => reset ? data : [...prev, ...data])
      setHasMore(h => ({ ...h, users: data.length === MOD_PAGE_SIZE }))
      pageRef.current.users = page + 1
    } else if (error) showToast('Failed to load users.', 'error')
    reset ? setLoading(false) : setLoadingMore(false)
  }

  async function deleteOpinion(id) {
    if (!confirm('Delete this opinion and all its replies?')) return
    await adminSupabase.from('votes').delete().eq('opinion_id', id)
    await adminSupabase.from('debate_replies').delete().eq('opinion_id', id)
    const { error } = await adminSupabase.from('opinions').delete().eq('id', id)
    if (error) { showToast('Failed to delete: ' + error.message, 'error'); console.error(error) }
    else { showToast('Opinion deleted.'); resetTab(tab) }
  }

  async function deleteDebate(id) {
    if (!confirm('Delete this reply?')) return
    const { error } = await adminSupabase.from('debate_replies').delete().eq('id', id)
    if (error) showToast('Failed: ' + error.message, 'error')
    else { showToast('Reply deleted.'); resetTab('debates') }
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user profile?')) return
    const { error } = await adminSupabase.from('profiles').delete().eq('id', id)
    if (error) showToast('Failed: ' + error.message, 'error')
    else { showToast('Profile deleted.'); resetTab('users') }
  }

  return (
    <div className="mod-wrap">
      <div className="mod-header">
        <span className="brand-name">pladoxa</span>
        <span style={{ color: 'var(--text-2)', fontSize: 13, marginLeft: 8 }}>moderation</span>
        <button className="sign-out-btn" style={{ marginLeft: 'auto' }} onClick={() => window.location.hash = '/'}>
          ← Back to site
        </button>
      </div>

      <div className="mod-tabs">
        <button className={`mod-tab${tab === 'flagged' ? ' active' : ''}`} onClick={() => setTab('flagged')}>
          🚩 Flagged ({flagged.length})
        </button>
        <button className={`mod-tab${tab === 'opinions' ? ' active' : ''}`} onClick={() => setTab('opinions')}>
          Opinions ({opinions.length})
        </button>
        <button className={`mod-tab${tab === 'debates' ? ' active' : ''}`} onClick={() => setTab('debates')}>
          Debates ({debates.length})
        </button>
        <button className={`mod-tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>
          Users ({users.length})
        </button>
      </div>

      <div className="mod-body">
        {loading && <div className="feed-empty">Loading...</div>}

        {!loading && tab === 'flagged' && (
          flagged.length === 0
            ? <div className="feed-empty">No flagged opinions. All clear ✓</div>
            : flagged.map(op => (
              <div key={op.id} className="mod-row" style={{ borderColor: '#f59e0b' }}>
                <div className="mod-row-meta">
                  <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>🚩 FLAGGED</span>
                  <span className="mod-user">@{op.profiles?.username ?? 'unknown'}</span>
                  <span className="topic-badge">{op.topic}</span>
                  <span className="card-time">{new Date(op.created_at).toLocaleString()}</span>
                </div>
                <p className="mod-text">{op.text}</p>
                <div className="mod-row-actions">
                  <button
                    style={{ background: 'none', border: '1px solid #22c55e', borderRadius: 6, color: '#22c55e', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
                    onClick={() => approveOpinion(op.id)}
                  >
                    ✓ Approve
                  </button>
                  <button className="mod-delete-btn" onClick={() => deleteOpinion(op.id)}>Delete</button>
                </div>
              </div>
            ))
        )}

        {!loading && tab === 'opinions' && (
          opinions.length === 0
            ? <div className="feed-empty">No opinions.</div>
            : opinions.map(op => (
              <div key={op.id} className="mod-row">
                <div className="mod-row-meta">
                  <span className="mod-user">@{op.profiles?.username ?? 'unknown'}</span>
                  <span className="topic-badge">{op.topic}</span>
                  <span className={`intensity-badge ${op.intensity}`} style={{ fontSize: 10 }}>
                    {op.intensity === 'hard' ? '🔥 Hard' : '💭 Soft'}
                  </span>
                  <span className="card-time">{new Date(op.created_at).toLocaleString()}</span>
                </div>
                <p className="mod-text">{op.text}</p>
                <div className="mod-row-actions">
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>
                    👍 {op.agrees_count} · 👎 {op.disagrees_count} · ⚡ {op.debates_count}
                  </span>
                  <button className="mod-delete-btn" onClick={() => deleteOpinion(op.id)}>Delete</button>
                </div>
              </div>
            ))
        )}

        {!loading && tab === 'debates' && (
          debates.length === 0
            ? <div className="feed-empty">No debate replies.</div>
            : debates.map(d => (
              <div key={d.id} className="mod-row">
                <div className="mod-row-meta">
                  <span className="mod-user">@{d.profiles?.username ?? 'unknown'}</span>
                  <span className="card-time">{new Date(d.created_at).toLocaleString()}</span>
                </div>
                {d.opinions?.text && (
                  <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, fontStyle: 'italic' }}>
                    On: "{d.opinions.text.slice(0, 80)}{d.opinions.text.length > 80 ? '…' : ''}"
                  </p>
                )}
                <p className="mod-text">{d.text}</p>
                <div className="mod-row-actions">
                  <span />
                  <button className="mod-delete-btn" onClick={() => deleteDebate(d.id)}>Delete</button>
                </div>
              </div>
            ))
        )}

        {!loading && tab === 'users' && (
          users.length === 0
            ? <div className="feed-empty">No users.</div>
            : users.map(u => (
              <div key={u.id} className="mod-row">
                <div className="mod-row-meta">
                  <div className="avatar avatar-sm" style={{ background: u.avatar_color }}>
                    {(u.display_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <span className="mod-user">{u.display_name}</span>
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>@{u.username}</span>
                  <span className="card-time">{new Date(u.created_at).toLocaleString()}</span>
                </div>
                <div className="mod-row-actions">
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{u.id}</span>
                  <button className="mod-delete-btn" onClick={() => deleteUser(u.id)}>Delete Profile</button>
                </div>
              </div>
            ))
        )}

        <div ref={sentinelRef} style={{ height: 1 }} />
        {loadingMore && <div className="feed-empty" style={{ padding: '12px 0' }}>Loading more...</div>}
        {!hasMore[tab] && (opinions.length > 0 || debates.length > 0 || users.length > 0 || flagged.length > 0) &&
          <div className="feed-empty" style={{ padding: '12px 0', fontSize: 12 }}>End of list.</div>
        }
      </div>

      {toast && <div className={`toast${toast.type ? ' ' + toast.type : ''}`}>{toast.msg}</div>}
    </div>
  )
}
