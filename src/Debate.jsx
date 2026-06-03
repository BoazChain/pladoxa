import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'

export default function Debate({ opinionId }) {
  const { user, profile } = useAuth()
  const [opinion, setOpinion] = useState(null)
  const [replies, setReplies] = useState([])
  const [likedIds, setLikedIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [authNeeded, setAuthNeeded] = useState(false)
  const [replyError, setReplyError] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    loadAll()
    if (user) loadLikedIds()

    // Realtime subscription
    const channel = supabase
      .channel(`debate-${opinionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'debate_replies',
        filter: `opinion_id=eq.${opinionId}`,
      }, () => loadReplies())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [opinionId])

  async function loadLikedIds() {
    const { data } = await supabase
      .from('reply_likes')
      .select('reply_id')
      .eq('user_id', user.id)
    if (data) setLikedIds(new Set(data.map(r => r.reply_id)))
  }

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadOpinion(), loadReplies()])
    setLoading(false)
  }

  async function loadOpinion() {
    const { data, error } = await supabase
      .from('opinions')
      .select('*, profiles(display_name, username, avatar_color, avatar_url)')
      .eq('id', opinionId)
      .single()
    if (error || !data) { setNotFound(true); return }
    setOpinion(data)
  }

  async function loadReplies() {
    const { data, error } = await supabase
      .from('debate_replies')
      .select('*, profiles!debate_replies_user_id_fkey(display_name, username, avatar_color, avatar_url)')
      .eq('opinion_id', opinionId)
      .is('parent_reply_id', null)
      .order('created_at', { ascending: true })

    if (error) return
    if (!data) return

    // Load sub-replies for each top-level reply
    const withSubs = await Promise.all(data.map(async reply => {
      const { data: subs } = await supabase
        .from('debate_replies')
        .select('*, profiles!debate_replies_user_id_fkey(display_name, username, avatar_color, avatar_url)')
        .eq('parent_reply_id', reply.id)
        .order('created_at', { ascending: true })
      return { ...reply, subReplies: subs || [] }
    }))

    setReplies(withSubs)
  }

  async function submitReply(text, parentReplyId = null, parentReply = null) {
    if (!user) { setAuthNeeded(true); return false }
    if (!text.trim()) return false

    setReplyError('')
    const { error } = await supabase.from('debate_replies').insert({
      opinion_id: opinionId,
      user_id: user.id,
      text: text.trim(),
      parent_reply_id: parentReplyId || null,
    })

    if (error) {
      if (error.message?.includes('rate_limit_exceeded')) {
        setReplyError('Slow down — wait 10 seconds between replies.')
      } else {
        setReplyError('Failed to post reply: ' + error.message)
      }
      return false
    }

    await loadReplies()
    return true
  }

  async function submitTopLevel(e) {
    e.preventDefault()
    if (!replyText.trim() || submitting) return
    setSubmitting(true)
    const ok = await submitReply(replyText)
    if (ok) setReplyText('')
    setSubmitting(false)
  }

  async function likeReply(replyId, ownerId) {
    if (!user) { setAuthNeeded(true); return }
    if (ownerId === user.id) return // no self-likes
    const liked = likedIds.has(replyId)
    const delta = liked ? -1 : 1

    // Optimistic UI update
    setLikedIds(prev => {
      const n = new Set(prev)
      liked ? n.delete(replyId) : n.add(replyId)
      return n
    })
    setReplies(prev => prev.map(r => {
      if (r.id === replyId) return { ...r, likes_count: Math.max(0, (r.likes_count || 0) + delta) }
      return { ...r, subReplies: r.subReplies?.map(s => s.id === replyId ? { ...s, likes_count: Math.max(0, (s.likes_count || 0) + delta) } : s) }
    }))

    if (liked) {
      await supabase.from('reply_likes').delete().eq('reply_id', replyId).eq('user_id', user.id)
    } else {
      await supabase.from('reply_likes').insert({ reply_id: replyId, user_id: user.id })
    }
  }

  if (loading) return (
    <div className="debate-page">
      <DebateNav />
      <div className="feed-empty" style={{ marginTop: 60 }}>Loading...</div>
    </div>
  )

  if (notFound) return (
    <div className="debate-page">
      <DebateNav />
      <div className="feed-empty" style={{ marginTop: 60 }}>Opinion not found.</div>
    </div>
  )

  const total = (opinion.agrees_count || 0) + (opinion.disagrees_count || 0)
  const pct = total > 0 ? Math.round((opinion.agrees_count / total) * 100) : 50

  return (
    <div className="debate-page">
      <DebateNav />

      <div className="debate-layout">
        {/* Pinned opinion */}
        <div className="debate-opinion-pin">
          <div className="debate-opinion-header">
            <div className="avatar avatar-md" style={{ background: opinion.profiles?.avatar_color ?? '#8b5cf6', cursor: 'pointer' }}
              onClick={() => window.location.hash = `/profile/${opinion.profiles?.username}`}>
              {opinion.profiles?.avatar_url
                ? <img src={opinion.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : initials(opinion.profiles?.display_name ?? '?')}
            </div>
            <div>
              <span className="card-name" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = `/profile/${opinion.profiles?.username}`}>
                {opinion.profiles?.display_name ?? 'Unknown'}
              </span>
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <span className={`intensity-badge ${opinion.intensity}`} style={{ fontSize: 10 }}>
                  {opinion.intensity === 'hard' ? '🔥 Hard' : '💭 Soft'}
                </span>
                <span className="topic-badge" style={{ fontSize: 10 }}>{opinion.topic}</span>
              </div>
            </div>
          </div>
          <p className="debate-opinion-text">{opinion.text}</p>
          <div className="heat-wrap" style={{ marginTop: 10 }}>
            <div className="heat-track"><div className="heat-fill" style={{ width: `${pct}%` }} /></div>
            <div className="heat-labels">
              <span className="heat-agree-lbl">{pct}% agree</span>
              <span className="heat-dis-lbl">{100 - pct}% disagree</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
          </div>
        </div>

        {/* Reply composer */}
        {user ? (
          <form className="debate-compose" onSubmit={submitTopLevel}>
            <div className="avatar avatar-sm" style={{ background: profile?.avatar_color ?? '#8b5cf6', flexShrink: 0 }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                : initials(profile?.display_name ?? '?')}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <textarea
                className="reply-textarea"
                placeholder="Make your case..."
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                maxLength={280}
                rows={2}
                style={{ width: '100%' }}
              />
              <div className={`char-counter${280 - replyText.length < 20 ? ' char-counter-warn' : ''}`}>{280 - replyText.length}</div>
            </div>
            <button className="submit-btn" type="submit" disabled={!replyText.trim() || submitting} style={{ alignSelf: 'flex-start', padding: '8px 16px' }}>
              {submitting ? '...' : 'Reply'}
            </button>
          </form>
        ) : null}
        {replyError && (
          <div style={{ color: '#f87171', fontSize: 13, padding: '6px 4px' }}>{replyError}</div>
        )}
        {!user ? (
          <div className="debate-signin-prompt">
            <button className="submit-btn" onClick={() => setAuthNeeded(true)}>Sign in to join the debate</button>
          </div>
        ) : null}

        {/* Replies */}
        <div className="debate-replies">
          {replies.length === 0 ? (
            <div className="feed-empty">No one has taken a stance yet. Go first.</div>
          ) : replies.map(reply => (
            <ReplyCard
              key={reply.id}
              reply={reply}
              user={user}
              profile={profile}
              likedIds={likedIds}
              onReply={(text, parentId) => submitReply(text, parentId, reply)}
              onLike={likeReply}
              onAuthNeeded={() => setAuthNeeded(true)}
            />
          ))}
        </div>

        <div ref={bottomRef} />
      </div>

      {authNeeded && <AuthPrompt onClose={() => setAuthNeeded(false)} />}
    </div>
  )
}

function ReplyCard({ reply, user, profile, likedIds, onReply, onLike, onAuthNeeded }) {
  const [showReplies, setShowReplies] = useState(false)
  const [replying, setReplying] = useState(false)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isMe = user?.id === reply.user_id
  const cardRef = useRef(null)
  const touchStartX = useRef(null)

  // Swipe-to-reply on mobile
  function onTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }
  function onTouchEnd(e) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (dx > 60) {
      if (!user) { onAuthNeeded(); return }
      setReplying(true)
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!text.trim() || submitting) return
    if (!user) { onAuthNeeded(); return }
    setSubmitting(true)
    const ok = await onReply(text, reply.id)
    if (ok) { setText(''); setReplying(false); setShowReplies(true) }
    setSubmitting(false)
  }

  const charsLeft = 280 - text.length

  return (
    <div
      ref={cardRef}
      className={`reply-thread${isMe ? ' reply-thread-me' : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="reply-main">
        <div className="avatar avatar-sm" style={{ background: reply.profiles?.avatar_color ?? '#8b5cf6', flexShrink: 0, cursor: 'pointer' }}
          onClick={() => window.location.hash = `/profile/${reply.profiles?.username}`}>
          {reply.profiles?.avatar_url
            ? <img src={reply.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            : initials(reply.profiles?.display_name ?? '?')}
        </div>
        <div className="reply-content">
          <div className="reply-meta">
            <span className="reply-name" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = `/profile/${reply.profiles?.username}`}>
              {reply.profiles?.display_name ?? 'Unknown'}
            </span>
            <span className="reply-time">{timeAgo(reply.created_at)}</span>
          </div>
          <p className="reply-text">{reply.text}</p>
          <div className="reply-actions">
            <button
              className="reply-action-btn"
              onClick={() => onLike(reply.id, reply.user_id)}
              disabled={user?.id === reply.user_id}
              style={{ color: likedIds?.has(reply.id) ? '#f43f5e' : undefined, opacity: user?.id === reply.user_id ? 0.4 : 1 }}
            >
              {likedIds?.has(reply.id) ? '❤️' : '🤍'} {reply.likes_count > 0 ? reply.likes_count : ''}
            </button>
            <button className="reply-action-btn" onClick={() => { if (!user) { onAuthNeeded(); return } setReplying(r => !r) }}>
              💬 Reply
            </button>
            {reply.subReplies?.length > 0 && (
              <button className="reply-action-btn" onClick={() => setShowReplies(v => !v)}>
                {showReplies ? '▲ Hide' : `▼ ${reply.subReplies.length} ${reply.subReplies.length === 1 ? 'reply' : 'replies'}`}
              </button>
            )}
          </div>

          {replying && (
            <form className="sub-reply-form" onSubmit={submit}>
              <div className="reply-context-hint">
                Replying to <strong>@{reply.profiles?.username ?? 'unknown'}</strong>: <em>"{(reply.text ?? '').slice(0, 60)}{(reply.text ?? '').length > 60 ? '…' : ''}"</em>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div className="avatar avatar-sm" style={{ background: profile?.avatar_color ?? '#8b5cf6', flexShrink: 0 }}>
                  {profile?.avatar_url
                    ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    : initials(profile?.display_name ?? '?')}
                </div>
                <div style={{ flex: 1 }}>
                  <textarea
                    className="reply-textarea"
                    placeholder={`Reply to ${reply.profiles?.display_name ?? 'this'}...`}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    maxLength={280}
                    rows={2}
                    autoFocus
                    style={{ width: '100%' }}
                  />
                  <div className={`char-counter${charsLeft < 20 ? ' char-counter-warn' : ''}`}>{charsLeft}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="submit-btn" type="submit" disabled={!text.trim() || submitting} style={{ padding: '6px 14px', fontSize: 12 }}>
                  {submitting ? '...' : 'Reply'}
                </button>
                <button type="button" className="auth-link" onClick={() => { setReplying(false); setText('') }}>Cancel</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Sub-replies */}
      {showReplies && reply.subReplies?.length > 0 && (
        <div className="sub-replies">
          {reply.subReplies.map(sub => (
            <div key={sub.id} className="sub-reply">
              <div className="avatar avatar-sm" style={{ background: sub.profiles?.avatar_color ?? '#8b5cf6', flexShrink: 0, cursor: 'pointer' }}
                onClick={() => window.location.hash = `/profile/${sub.profiles?.username}`}>
                {sub.profiles?.avatar_url
                  ? <img src={sub.profiles.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  : initials(sub.profiles?.display_name ?? '?')}
              </div>
              <div className="reply-content">
                <div className="reply-meta">
                  <span className="reply-name" style={{ cursor: 'pointer' }} onClick={() => window.location.hash = `/profile/${sub.profiles?.username}`}>
                    {sub.profiles?.display_name ?? 'Unknown'}
                  </span>
                  <span className="reply-time">{timeAgo(sub.created_at)}</span>
                </div>
                {/* Discord-style context: show what they're replying to */}
                <div className="reply-context">
                  <span className="reply-context-arrow">↩</span>
                  <span className="reply-context-name">@{reply.profiles?.username ?? 'unknown'}</span>
                  <span className="reply-context-quote">"{(reply.text ?? '').slice(0, 60)}{(reply.text ?? '').length > 60 ? '…' : ''}"</span>
                </div>
                <p className="reply-text">{sub.text}</p>
                <div className="reply-actions">
                  <button
                    className="reply-action-btn"
                    onClick={() => onLike(sub.id, sub.user_id)}
                    disabled={user?.id === sub.user_id}
                    style={{ color: likedIds?.has(sub.id) ? '#f43f5e' : undefined, opacity: user?.id === sub.user_id ? 0.4 : 1 }}
                  >
                    {likedIds?.has(sub.id) ? '❤️' : '🤍'} {sub.likes_count > 0 ? sub.likes_count : ''}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DebateNav() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <button className="auth-link" style={{ fontSize: 14 }} onClick={() => history.back()}>← Back</button>
        <span className="brand-name" style={{ marginLeft: 12 }}>debate room</span>
      </div>
    </nav>
  )
}

function AuthPrompt({ onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Join the debate</span>
          <button className="modal-close" onClick={onClose}>x</button>
        </div>
        <div className="create-body">
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>Sign in to reply, like, and get notified when people respond.</p>
          <button className="submit-btn" onClick={() => { onClose(); window.location.hash = '/' }}>Go sign in</button>
        </div>
      </div>
    </div>
  )
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
