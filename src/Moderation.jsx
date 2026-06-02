import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

const MOD_PASSWORD = import.meta.env.VITE_MOD_PASSWORD || 'admin123'

export default function Moderation() {
  const [authed, setAuthed] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')

  function tryLogin(e) {
    e.preventDefault()
    if (pw === MOD_PASSWORD) {
      setAuthed(true)
    } else {
      setPwError('Incorrect password.')
    }
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

function ModDashboard() {
  const [tab, setTab] = useState('opinions')
  const [opinions, setOpinions] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (tab === 'opinions') loadOpinions()
    if (tab === 'users') loadUsers()
  }, [tab])

  function showToast(msg, type = '') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  async function loadOpinions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('opinions')
      .select('*, profiles(display_name, username)')
      .order('created_at', { ascending: false })
    if (!error) setOpinions(data)
    setLoading(false)
  }

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setUsers(data)
    setLoading(false)
  }

  async function deleteOpinion(id) {
    if (!confirm('Delete this opinion?')) return
    const { error } = await supabase.from('opinions').delete().eq('id', id)
    if (error) showToast('Failed to delete.', 'error')
    else { showToast('Opinion deleted.'); loadOpinions() }
  }

  async function deleteUser(id) {
    if (!confirm('Delete this user profile? (does not delete auth account)')) return
    const { error } = await supabase.from('profiles').delete().eq('id', id)
    if (error) showToast('Failed to delete.', 'error')
    else { showToast('Profile deleted.'); loadUsers() }
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
        <button className={`mod-tab${tab === 'opinions' ? ' active' : ''}`} onClick={() => setTab('opinions')}>
          Opinions ({opinions.length})
        </button>
        <button className={`mod-tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>
          Users ({users.length})
        </button>
      </div>

      <div className="mod-body">
        {loading && <div className="feed-empty">Loading...</div>}

        {!loading && tab === 'opinions' && (
          opinions.length === 0
            ? <div className="feed-empty">No opinions.</div>
            : opinions.map(op => (
              <div key={op.id} className="mod-row">
                <div className="mod-row-meta">
                  <span className="mod-user">@{op.profiles?.username ?? 'unknown'}</span>
                  <span className="mod-topic topic-badge">{op.topic}</span>
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
      </div>

      {toast && <div className={`toast${toast.type ? ' ' + toast.type : ''}`}>{toast.msg}</div>}
    </div>
  )
}
