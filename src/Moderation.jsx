import { useState, useEffect, useRef } from 'react'

const MOD_PAGE_SIZE = 20

// All admin calls go through /api/admin — service key never leaves the server
async function adminCall(password, action, params = {}) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${password}`,
    },
    body: JSON.stringify({ action, ...params }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}

export default function Moderation() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [checking, setChecking] = useState(false)

  async function tryLogin(e) {
    e.preventDefault()
    setChecking(true)
    setPwError('')
    try {
      // Verify password by making a real API call
      await adminCall(pw, 'fetch', { tab: 'flagged', page: 0 })
      setPassword(pw)
      setAuthed(true)
    } catch {
      setPwError('Incorrect password.')
    }
    setChecking(false)
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
            <button className="submit-btn" type="submit" disabled={checking}>
              {checking ? 'Checking...' : 'Enter'}
            </button>
          </form>
          <button className="auth-link" style={{ marginTop: 12, display: 'block' }} onClick={() => window.location.hash = '/'}>
            ← Back to site
          </button>
        </div>
      </div>
    )
  }

  return <ModDashboard password={password} />
}

function ModDashboard({ password }) {
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
  const [confirmState, setConfirmState] = useState(null)

  useEffect(() => { resetTab(tab) }, [tab])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && !loading) loadMoreTab(tab)
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [tab, loadingMore, loading])

  function showToast(msg, type = '') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  function askConfirm(message, onConfirm) {
    setConfirmState({ message, onConfirm })
  }

  function resetTab(t) {
    pageRef.current[t] = 0
    setHasMore(h => ({ ...h, [t]: true }))
    if (t === 'flagged') { setFlagged([]); loadTab('flagged', 0, true) }
    else if (t === 'opinions') { setOpinions([]); loadTab('opinions', 0, true) }
    else if (t === 'debates') { setDebates([]); loadTab('debates', 0, true) }
    else if (t === 'users') { setUsers([]); loadTab('users', 0, true) }
  }

  function loadMoreTab(t) {
    if (!hasMore[t] || loadingMore) return
    loadTab(t, pageRef.current[t], false)
  }

  async function loadTab(t, page, reset) {
    reset ? setLoading(true) : setLoadingMore(true)
    try {
      const { data } = await adminCall(password, 'fetch', { tab: t, page })
      const setter = { flagged: setFlagged, opinions: setOpinions, debates: setDebates, users: setUsers }[t]
      setter(prev => reset ? data : [...prev, ...data])
      setHasMore(h => ({ ...h, [t]: data.length === MOD_PAGE_SIZE }))
      pageRef.current[t] = page + 1
    } catch (e) {
      showToast('Failed to load: ' + e.message, 'error')
    }
    reset ? setLoading(false) : setLoadingMore(false)
  }

  async function approveOpinion(id) {
    try {
      await adminCall(password, 'approve', { id })
      showToast('Opinion approved ✓')
      resetTab('flagged')
    } catch (e) { showToast('Failed: ' + e.message, 'error') }
  }

  async function deleteOpinion(id) {
    askConfirm('Delete this opinion and all its replies?', async () => {
      try {
        await adminCall(password, 'delete_opinion', { id })
        showToast('Opinion deleted.')
        resetTab(tab)
      } catch (e) { showToast('Failed: ' + e.message, 'error') }
    })
  }

  async function deleteDebate(id) {
    askConfirm('Delete this reply?', async () => {
      try {
        await adminCall(password, 'delete_debate', { id })
        showToast('Reply deleted.')
        resetTab('debates')
      } catch (e) { showToast('Failed: ' + e.message, 'error') }
    })
  }

  async function deleteUser(id) {
    askConfirm('Delete this user profile?', async () => {
      try {
        await adminCall(password, 'delete_user', { id })
        showToast('Profile deleted.')
        resetTab('users')
      } catch (e) { showToast('Failed: ' + e.message, 'error') }
    })
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
        {[['flagged', `🚩 Flagged (${flagged.length})`], ['opinions', `Opinions (${opinions.length})`], ['debates', `Debates (${debates.length})`], ['users', `Users (${users.length})`]].map(([key, label]) => (
          <button key={key} className={`mod-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
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
                  <button style={{ background: 'none', border: '1px solid #22c55e', borderRadius: 6, color: '#22c55e', fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
                    onClick={() => approveOpinion(op.id)}>✓ Approve</button>
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
                  <span style={{ color: 'var(--text-2)', fontSize: 12 }}>👍 {op.agrees_count} · 👎 {op.disagrees_count} · ⚡ {op.debates_count}</span>
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

      {confirmState && (
        <div className="modal-backdrop" onClick={() => setConfirmState(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div className="modal-head">
              <span className="modal-title">Are you sure?</span>
              <button className="modal-close" onClick={() => setConfirmState(null)}>x</button>
            </div>
            <div className="create-body" style={{ gap: 16 }}>
              <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>{confirmState.message}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="submit-btn" style={{ background: '#ef4444', flex: 1 }}
                  onClick={() => { setConfirmState(null); confirmState.onConfirm() }}>Delete</button>
                <button className="submit-btn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', flex: 1 }}
                  onClick={() => setConfirmState(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
