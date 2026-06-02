import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import './App.css'

const TOPICS = ['All', 'Tech', 'Society', 'Food', 'Philosophy', 'Entertainment', 'Culture', 'Politics', 'Science']

export default function App() {
  return (
    <AuthProvider>
      <Feed />
    </AuthProvider>
  )
}

function Feed() {
  const { user, profile, loading: authLoading, signOut } = useAuth()
  const [opinions, setOpinions] = useState([])
  const [userVotes, setUserVotes] = useState({})
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('hot')
  const [createOpen, setCreateOpen] = useState(false)
  const [debateId, setDebateId] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    loadOpinions()
  }, [])

  useEffect(() => {
    if (user) loadUserVotes()
    else setUserVotes({})
  }, [user])

  async function loadOpinions() {
    setFetching(true)
    const { data, error } = await supabase
      .from('opinions')
      .select(`*, profiles(display_name, username, avatar_color)`)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setOpinions(data.map(normalizeOpinion))
    }
    setFetching(false)
  }

  async function loadUserVotes() {
    const { data } = await supabase
      .from('votes')
      .select('opinion_id, vote_type')
      .eq('user_id', user.id)

    if (data) {
      const map = {}
      data.forEach(v => { map[v.opinion_id] = v.vote_type })
      setUserVotes(map)
    }
  }

  function normalizeOpinion(row) {
    return {
      id: row.id,
      text: row.text,
      intensity: row.intensity,
      topic: row.topic,
      ts: timeAgo(row.created_at),
      agrees: row.agrees_count,
      disagrees: row.disagrees_count,
      debates: row.debates_count,
      user: {
        name: row.profiles?.display_name ?? 'Unknown',
        handle: row.profiles?.username ?? 'unknown',
        initials: initials(row.profiles?.display_name ?? '?'),
        color: row.profiles?.avatar_color ?? '#8b5cf6',
      },
      replies: [],
    }
  }

  function showToast(msg, type = '') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  function requireAuth(action) {
    if (!user) { setAuthOpen(true); return false }
    return true
  }

  async function vote(opinionId, type) {
    if (!requireAuth()) return

    const prev = userVotes[opinionId]
    const unvoting = prev === type

    setUserVotes(v => {
      const next = { ...v }
      if (unvoting) delete next[opinionId]
      else next[opinionId] = type
      return next
    })

    setOpinions(ops => ops.map(op => {
      if (op.id !== opinionId) return op
      let a = op.agrees
      let d = op.disagrees
      if (prev === 'agree') a--
      if (prev === 'disagree') d--
      if (!unvoting && type === 'agree') a++
      if (!unvoting && type === 'disagree') d++
      return { ...op, agrees: a, disagrees: d }
    }))

    const { error } = await supabase.rpc('handle_vote', {
      p_opinion_id: opinionId,
      p_user_id: user.id,
      p_vote_type: type,
    })

    if (error) {
      loadOpinions()
      loadUserVotes()
      showToast('Something went wrong.', 'error')
    } else {
      if (unvoting) showToast('Vote removed.')
      else if (type === 'agree') showToast('You agreed with this.', 'agree')
      else showToast('You disagreed with this.', 'disagree')
    }
  }

  async function create(data) {
    if (!requireAuth()) return

    const { error } = await supabase.from('opinions').insert({
      user_id: user.id,
      text: data.text,
      intensity: data.intensity,
      topic: data.topic,
    })

    if (error) {
      showToast('Failed to post opinion.', 'error')
    } else {
      setCreateOpen(false)
      showToast('Opinion dropped.', 'success')
      loadOpinions()
    }
  }

  async function loadReplies(opinionId) {
    const { data } = await supabase
      .from('debate_replies')
      .select(`*, profiles(display_name, avatar_color)`)
      .eq('opinion_id', opinionId)
      .order('created_at', { ascending: true })

    if (data) {
      setOpinions(ops => ops.map(op => {
        if (op.id !== opinionId) return op
        return {
          ...op,
          replies: data.map(r => ({
            id: r.id,
            text: r.text,
            time: timeAgo(r.created_at),
            user: {
              name: r.profiles?.display_name ?? 'Unknown',
              initials: initials(r.profiles?.display_name ?? '?'),
              color: r.profiles?.avatar_color ?? '#8b5cf6',
            },
          })),
        }
      }))
    }
  }

  async function addReply(opinionId, text) {
    if (!requireAuth()) return

    const { error } = await supabase.from('debate_replies').insert({
      opinion_id: opinionId,
      user_id: user.id,
      text,
    })

    if (error) {
      showToast('Failed to post reply.', 'error')
    } else {
      await supabase
        .from('opinions')
        .update({ debates_count: (opinions.find(o => o.id === opinionId)?.debates ?? 0) + 1 })
        .eq('id', opinionId)

      showToast('You entered the debate.', 'success')
      loadReplies(opinionId)
      setOpinions(ops => ops.map(op =>
        op.id === opinionId ? { ...op, debates: op.debates + 1 } : op
      ))
    }
  }

  const debateOp = opinions.find(op => op.id === debateId)

  const filtered = opinions.filter(op => filter === 'All' || op.topic === filter)
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'new') return 0
    if (sort === 'controversial') return b.debates - a.debates
    return (b.agrees + b.debates * 2) - (a.agrees + a.debates * 2)
  })

  return (
    <div>
      <Navbar
        profile={profile}
        onNew={() => user ? setCreateOpen(true) : setAuthOpen(true)}
        onAuth={() => setAuthOpen(true)}
        onSignOut={signOut}
      />

      <div className="layout">
        <main className="feed-area">
          <div className="feed-controls">
            <div className="topic-scroll">
              {TOPICS.map(t => (
                <button
                  key={t}
                  className={`topic-chip${filter === t ? ' active' : ''}`}
                  onClick={() => setFilter(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="sort-row">
              {[['hot', '🔥 Hot'], ['new', '✨ New'], ['controversial', '⚡ Controversial']].map(([val, label]) => (
                <button
                  key={val}
                  className={`sort-btn${sort === val ? ' active' : ''}`}
                  onClick={() => setSort(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="feed">
            {fetching || authLoading ? (
              <div className="feed-empty">Loading...</div>
            ) : sorted.length === 0 ? (
              <div className="feed-empty">No opinions here yet. Drop the first one.</div>
            ) : sorted.map(op => (
              <OpinionCard
                key={op.id}
                op={op}
                vote={userVotes[op.id] ?? null}
                onVote={type => vote(op.id, type)}
                onDebate={() => {
                  setDebateId(op.id)
                  loadReplies(op.id)
                }}
              />
            ))}
          </div>
        </main>
      </div>

      <button className="fab" onClick={() => user ? setCreateOpen(true) : setAuthOpen(true)} title="Drop an opinion">+</button>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreate={create} />}

      {debateId && debateOp && (
        <DebateModal
          op={debateOp}
          onClose={() => setDebateId(null)}
          onReply={text => addReply(debateId, text)}
          loggedIn={!!user}
          onAuthNeeded={() => { setDebateId(null); setAuthOpen(true) }}
        />
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {toast && <div className={`toast${toast.type ? ' ' + toast.type : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function Navbar({ profile, onNew, onAuth, onSignOut }) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand-name">pladoxa</span>
        <span className="navbar-tagline">drop your take.</span>
        <div className="navbar-actions">
          {profile ? (
            <>
              <div className="nav-profile">
                <div className="avatar avatar-sm" style={{ background: profile.avatar_color }}>
                  {initials(profile.display_name)}
                </div>
                <span className="nav-username">@{profile.username}</span>
              </div>
              <button className="new-opinion-btn" onClick={onNew}>+ New Opinion</button>
              <button className="sign-out-btn" onClick={onSignOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="sign-in-btn" onClick={onAuth}>Sign in</button>
              <button className="new-opinion-btn" onClick={onNew}>+ New Opinion</button>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}

function OpinionCard({ op, vote, onVote, onDebate }) {
  const total = op.agrees + op.disagrees
  const pct = total > 0 ? Math.round((op.agrees / total) * 100) : 50

  return (
    <article className="opinion-card">
      <div className="card-top">
        <div className="card-user-row">
          <div className="avatar avatar-md" style={{ background: op.user.color }}>{op.user.initials}</div>
          <div className="card-user-info">
            <span className="card-name">{op.user.name}</span>
            <span className="card-handle">@{op.user.handle}</span>
          </div>
        </div>
        <div className="card-badges">
          <span className={`intensity-badge ${op.intensity}`}>
            {op.intensity === 'hard' ? '🔥 Hard Take' : '💭 Soft Take'}
          </span>
          <span className="topic-badge">{op.topic}</span>
          <span className="card-time">{op.ts}</span>
        </div>
      </div>

      <p className="card-text">{op.text}</p>

      <div className="heat-wrap">
        <div className="heat-track">
          <div className="heat-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="heat-labels">
          <span className="heat-agree-lbl">{pct}% agree</span>
          <span className="heat-dis-lbl">{100 - pct}% disagree</span>
        </div>
      </div>

      <div className="card-actions">
        <button
          className={`action-btn agree-btn${vote === 'agree' ? ' voted' : ''}`}
          onClick={() => onVote('agree')}
        >
          <span className="btn-icon">👍</span>
          <span className="btn-count">{op.agrees.toLocaleString()}</span>
          <span className="btn-label">Agree</span>
        </button>
        <button
          className={`action-btn disagree-btn${vote === 'disagree' ? ' voted' : ''}`}
          onClick={() => onVote('disagree')}
        >
          <span className="btn-icon">👎</span>
          <span className="btn-count">{op.disagrees.toLocaleString()}</span>
          <span className="btn-label">Disagree</span>
        </button>
        <button className="action-btn debate-btn" onClick={onDebate}>
          <span className="btn-icon">⚡</span>
          <span className="btn-count">{op.debates.toLocaleString()}</span>
          <span className="btn-label">Debate</span>
        </button>
      </div>
    </article>
  )
}

function CreateModal({ onClose, onCreate }) {
  const [text, setText] = useState('')
  const [intensity, setIntensity] = useState('soft')
  const [topic, setTopic] = useState('Tech')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || submitting) return
    setSubmitting(true)
    await onCreate({ text: text.trim(), intensity, topic })
    setSubmitting(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Drop Your Opinion</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form className="create-body" onSubmit={submit}>
          <textarea
            className="opinion-textarea"
            placeholder="What's your take? Soft or hard, say it."
            value={text}
            onChange={e => setText(e.target.value)}
            maxLength={280}
            autoFocus
          />
          <div className="char-count">{text.length} / 280</div>

          <div className="form-row">
            <div className="intensity-group">
              <span className="field-label">Intensity</span>
              <button type="button" className={`int-btn${intensity === 'soft' ? ' active-soft' : ''}`} onClick={() => setIntensity('soft')}>
                💭 Soft Take
              </button>
              <button type="button" className={`int-btn${intensity === 'hard' ? ' active-hard' : ''}`} onClick={() => setIntensity('hard')}>
                🔥 Hard Take
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="topic-sel-group">
              <span className="field-label">Topic</span>
              <select className="topic-sel" value={topic} onChange={e => setTopic(e.target.value)}>
                {TOPICS.filter(t => t !== 'All').map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={!text.trim() || submitting}>
            {submitting ? 'Posting...' : 'Drop It 🔥'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DebateModal({ op, onClose, onReply, loggedIn, onAuthNeeded }) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || submitting) return
    if (!loggedIn) { onAuthNeeded(); return }
    setSubmitting(true)
    await onReply(text.trim())
    setText('')
    setSubmitting(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Debate Room</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>

        <div className="debate-body">
          <div className="debate-op-preview">
            <div className="debate-op-header">
              <div className="avatar avatar-sm" style={{ background: op.user.color }}>{op.user.initials}</div>
              <span className="card-name" style={{ fontSize: 13 }}>{op.user.name}</span>
              <span className={`intensity-badge ${op.intensity}`} style={{ fontSize: 10 }}>
                {op.intensity === 'hard' ? '🔥 Hard' : '💭 Soft'}
              </span>
            </div>
            <p className="debate-op-text">{op.text}</p>
          </div>

          <div className="replies-scroll">
            {op.replies.length === 0 ? (
              <div className="no-debates">No one has challenged this yet. You go first.</div>
            ) : op.replies.map(r => (
              <div key={r.id} className="reply-card">
                <div className="avatar avatar-sm" style={{ background: r.user.color }}>{r.user.initials}</div>
                <div className="reply-bubble">
                  <div className="reply-meta">
                    <span className="reply-name">{r.user.name}</span>
                    <span className="reply-time">{r.time}</span>
                  </div>
                  <p className="reply-text">{r.text}</p>
                </div>
              </div>
            ))}
          </div>

          <form className="reply-form" onSubmit={submit}>
            <textarea
              className="reply-textarea"
              placeholder={loggedIn ? 'Make your case...' : 'Sign in to join the debate.'}
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={280}
              disabled={!loggedIn}
            />
            <button type="submit" className="submit-btn" disabled={!text.trim() || submitting}>
              {submitting ? 'Posting...' : loggedIn ? 'Enter Debate' : 'Sign in to debate'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function AuthModal({ onClose }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (mode === 'signin') {
      const err = await signIn(email, password)
      if (err) setError(err.message)
      else onClose()
    } else {
      if (!username.match(/^[a-z0-9_]{3,20}$/)) {
        setError('Username must be 3-20 characters: letters, numbers, underscores only.')
        setSubmitting(false)
        return
      }
      const err = await signUp(email, password, username, displayName)
      if (err) setError(err.message)
      else setDone(true)
    }

    setSubmitting(false)
  }

  if (done) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <span className="modal-title">Check your email</span>
            <button className="modal-close" onClick={onClose}>x</button>
          </div>
          <div className="create-body">
            <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.6 }}>
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and sign in.
            </p>
            <button className="submit-btn" onClick={onClose}>Got it</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <form className="create-body" onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <input
                className="auth-input"
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
              />
              <input
                className="auth-input"
                type="text"
                placeholder="Username (letters, numbers, _)"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase())}
                required
              />
            </>
          )}
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? '...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <p className="auth-switch">
            {mode === 'signin' ? (
              <>No account? <button type="button" className="auth-link" onClick={() => { setMode('signup'); setError('') }}>Sign up</button></>
            ) : (
              <>Already have one? <button type="button" className="auth-link" onClick={() => { setMode('signin'); setError('') }}>Sign in</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}

function initials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
