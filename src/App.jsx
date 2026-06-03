import { useState, useEffect, useRef, useCallback } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import './App.css'

const TOPICS = ['All', 'Tech', 'Society', 'Food', 'Philosophy', 'Entertainment', 'Culture', 'Politics', 'Science', 'Sports', 'Animals']

export default function App() {
  return (
    <AuthProvider>
      <Feed />
    </AuthProvider>
  )
}

const PAGE_SIZE = 20

function Feed() {
  const { user, profile, loading: authLoading, signOut, unreadCount, markAllRead } = useAuth()
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [opinions, setOpinions] = useState([])
  const [userVotes, setUserVotes] = useState({})
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('new')
  const [createOpen, setCreateOpen] = useState(false)
  const [debateId, setDebateId] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [confirmState, setConfirmState] = useState(null)
  const [fetching, setFetching] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const pageRef = useRef(0)
  const sentinelRef = useRef(null)

  useEffect(() => {
    resetAndLoad()
  }, [sort, filter])

  useEffect(() => {
    if (user) loadUserVotes()
    else setUserVotes({})
  }, [user])

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && !fetching) {
        loadMore()
      }
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadingMore, fetching, hasMore])

  function buildQuery(from, to) {
    let q = supabase
      .from('opinions')
      .select(`*, profiles(display_name, username, avatar_color, avatar_url)`)
      .not('status', 'in', '("flagged","deleted")')
      .range(from, to)

    if (filter !== 'All') q = q.eq('topic', filter)

    if (sort === 'new') q = q.order('created_at', { ascending: false })
    else if (sort === 'top') q = q.order('agrees_count', { ascending: false }).order('disagrees_count', { ascending: false })

    return q
  }

  async function resetAndLoad() {
    setFetching(true)
    setOpinions([])
    setHasMore(true)
    pageRef.current = 0

    const { data, error } = await buildQuery(0, PAGE_SIZE - 1)
    if (!error && data) {
      setOpinions(data.map(normalizeOpinion))
      setHasMore(data.length === PAGE_SIZE)
      pageRef.current = 1
    }
    setFetching(false)
  }

  async function loadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    const from = pageRef.current * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (!error && data) {
      setOpinions(prev => [...prev, ...data.map(normalizeOpinion)])
      setHasMore(data.length === PAGE_SIZE)
      pageRef.current += 1
    }
    setLoadingMore(false)
  }

  function deleteOpinion(id) {
    setConfirmState({
      message: 'Delete this opinion? The debate thread will stay but your text will be removed.',
      onConfirm: async () => {
        const { error } = await supabase
          .from('opinions')
          .update({ status: 'deleted', text: null })
          .eq('id', id)
          .eq('user_id', user.id)
        if (error) showToast('Failed to delete.', 'error')
        else { showToast('Opinion deleted.'); resetAndLoad() }
      }
    })
  }

  async function loadOpinions() {
    await resetAndLoad()
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
      createdAt: row.created_at,
      agrees: row.agrees_count,
      disagrees: row.disagrees_count,
      debates: row.debates_count,
      rawUserId: row.user_id,
      user: {
        name: row.profiles?.display_name ?? 'Unknown',
        handle: row.profiles?.username ?? 'unknown',
        initials: initials(row.profiles?.display_name ?? '?'),
        color: row.profiles?.avatar_color ?? '#8b5cf6',
        avatarUrl: row.profiles?.avatar_url ?? null,
      },
      replies: [],
    }
  }

  async function openNotifs() {
    setNotifOpen(v => !v)
    if (!user) return
    const { data } = await supabase
      .from('notifications')
      .select('*, from_profile:from_user_id(display_name, username), opinions(text)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setNotifs(data)
    markAllRead()
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

      // Notify opinion owner (skip if unvoting or voting on own opinion)
      if (!unvoting) {
        const op = opinions.find(o => o.id === opinionId)
        if (op) {
          const { data: opData } = await supabase.from('opinions').select('user_id').eq('id', opinionId).single()
          if (opData && opData.user_id !== user.id) {
            await supabase.from('notifications').insert({
              user_id: opData.user_id,
              from_user_id: user.id,
              type,
              opinion_id: opinionId,
            })
          }
        }
      }
    }
  }

  async function moderateText(text) {
    try {
      const res = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json()
      const result = json.results?.[0]
      if (!result) return { action: 'allow', reason: 'no_result' }

      const scores = result.category_scores
      const maxScore = Math.max(...Object.values(scores))

      // Hard remove: OpenAI explicitly flagged it, or very high score
      if (result.flagged || maxScore >= 0.7) return { action: 'remove', score: maxScore }
      // Flag for review: moderate score on any category
      if (maxScore >= 0.3) return { action: 'flag', score: maxScore }
      return { action: 'allow', score: maxScore }
    } catch (e) {
      return { action: 'allow', reason: 'error' }
    }
  }

  async function create(data) {
    if (!requireAuth()) return

    const { data: inserted, error } = await supabase.from('opinions').insert({
      user_id: user.id,
      text: data.text,
      intensity: data.intensity,
      topic: data.topic,
    }).select().single()

    if (error) {
      if (error.message?.includes('rate_limit_exceeded')) {
        showToast('Slow down — wait 30 seconds between posts.', 'error')
      } else {
        showToast('Failed to post opinion.', 'error')
      }
      return
    }

    setCreateOpen(false)

    const mod = await moderateText(data.text)

    if (mod.action === 'remove') {
      await supabase.from('opinions').delete().eq('id', inserted.id)
      showToast('Post removed — content policy violation.', 'error')
    } else if (mod.action === 'flag') {
      await supabase.from('opinions').update({ status: 'flagged' }).eq('id', inserted.id)
      showToast('Opinion dropped.', 'success')
      loadOpinions()
    } else {
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

  return (
    <div>
      <Navbar
        profile={profile}
        onNew={() => user ? setCreateOpen(true) : setAuthOpen(true)}
        onAuth={() => setAuthOpen(true)}
        onSignOut={signOut}
        unreadCount={unreadCount}
        onBell={openNotifs}
        notifOpen={notifOpen}
        notifs={notifs}
        onCloseNotifs={() => setNotifOpen(false)}
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
              {[['new', '✨ New'], ['top', '🔥 Top']].map(([val, label]) => (
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
            ) : opinions.length === 0 ? (
              <div className="feed-empty">No opinions here yet. Drop the first one.</div>
            ) : opinions.map(op => (
              <OpinionCard
                key={op.id}
                op={op}
                vote={userVotes[op.id] ?? null}
                isOwner={user?.id === op.rawUserId}
                onVote={type => vote(op.id, type)}
                onDelete={() => deleteOpinion(op.id)}
              />
            ))}
            <div ref={sentinelRef} style={{ height: 1 }} />
            {loadingMore && <div className="feed-empty" style={{ padding: '12px 0' }}>Loading more...</div>}
            {!hasMore && opinions.length > 0 && <div className="feed-empty" style={{ padding: '12px 0', fontSize: 12 }}>You've seen it all.</div>}
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
      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onConfirm={() => { setConfirmState(null); confirmState.onConfirm() }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  )
}

function Navbar({ profile, onNew, onAuth, onSignOut, unreadCount, onBell, notifOpen, notifs, onCloseNotifs }) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand-name">pladoxa</span>
        <span className="navbar-tagline">drop your take.</span>
        <div className="navbar-actions">
          {profile ? (
            <>
              <div className="nav-profile" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = `/profile/${profile.username}`}>
                <div className="avatar avatar-sm" style={{ background: profile.avatar_color }}>
                  {profile.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : initials(profile.display_name)}
                </div>
                <span className="nav-username">@{profile.username}</span>
              </div>
              <div style={{ position: 'relative' }}>
                <button className="sign-out-btn" onClick={onBell} style={{ fontSize: 16, padding: '6px 10px' }}>
                  🔔{unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
                {notifOpen && <NotifDropdown notifs={notifs} onClose={onCloseNotifs} />}
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

function NotifDropdown({ notifs, onClose }) {
  const labels = { debate: '⚡ debated your opinion', reply: '💬 replied to you', agree: '👍 agreed with you', disagree: '👎 disagreed with you' }

  return (
    <div className="notif-dropdown" onClick={e => e.stopPropagation()}>
      <div className="notif-head">
        <span>Notifications</span>
        <button className="modal-close" onClick={onClose}>x</button>
      </div>
      {notifs.length === 0
        ? <div className="notif-empty">Nothing yet.</div>
        : notifs.map(n => (
          <div key={n.id} className={`notif-row${n.read ? '' : ' unread'}`}
            onClick={() => { if (n.opinion_id) window.location.hash = `/debate/${n.opinion_id}`; onClose() }}>
            <span className="notif-text">
              <strong>{n.from_profile?.display_name ?? 'Someone'}</strong> {labels[n.type] ?? 'interacted with you'}
            </span>
            {n.opinions?.text && (
              <span className="notif-preview">"{n.opinions.text.slice(0, 60)}{n.opinions.text.length > 60 ? '…' : ''}"</span>
            )}
            <span className="notif-time">{timeAgo(n.created_at)}</span>
          </div>
        ))
      }
    </div>
  )
}

function OpinionCard({ op, vote, onVote, isOwner, onDelete }) {
  const total = op.agrees + op.disagrees
  const pct = total > 0 ? Math.round((op.agrees / total) * 100) : 50

  return (
    <article className="opinion-card">
      <div className="card-top">
        <div className="card-user-row" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = `/profile/${op.user.handle}`}>
          <div className="avatar avatar-md" style={{ background: op.user.color }}>
            {op.user.avatarUrl
              ? <img src={op.user.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              : op.user.initials}
          </div>
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
          {isOwner && (
            <button
              className="card-delete-btn"
              title="Delete opinion"
              onClick={e => { e.stopPropagation(); onDelete() }}
            >🗑</button>
          )}
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
        <button className="action-btn debate-btn" onClick={() => window.location.hash = `/debate/${op.id}`}>
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

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
        <div className="modal-head">
          <span className="modal-title">Are you sure?</span>
          <button className="modal-close" onClick={onCancel}>x</button>
        </div>
        <div className="create-body" style={{ gap: 16 }}>
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="submit-btn" style={{ background: '#ef4444', flex: 1 }} onClick={onConfirm}>Delete</button>
            <button className="submit-btn" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-2)', flex: 1 }} onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AuthModal({ onClose }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (mode === 'signin') {
      const err = await signIn(username, password)
      if (err) setError('Invalid username or password.')
      else onClose()
    } else {
      if (!username.match(/^[a-z0-9_]{3,20}$/)) {
        setError('Username must be 3-20 characters: letters, numbers, underscores only.')
        setSubmitting(false)
        return
      }
      const err = await signUp(username, password, displayName)
      if (err) setError(err.message)
      else onClose()
    }

    setSubmitting(false)
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
            <input
              className="auth-input"
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
            />
          )}
          <input
            className="auth-input"
            type="text"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())}
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
