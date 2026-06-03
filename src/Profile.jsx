import { useState, useEffect, useRef, useCallback } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'

const PAGE_SIZE = 20

export default function Profile({ username }) {
  const { user, profile: myProfile } = useAuth()
  const [profile, setProfile] = useState(null)
  const [opinions, setOpinions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const pageRef = useRef(0)
  const sentinelRef = useRef(null)
  const isMe = myProfile?.username === username

  useEffect(() => {
    loadProfile()
  }, [username])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loadingMore && !loading) loadMore()
    }, { threshold: 0.1 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadingMore, loading, hasMore])

  async function loadProfile() {
    setLoading(true)
    setOpinions([])
    pageRef.current = 0

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (error || !data) { setNotFound(true); setLoading(false); return }
    setProfile(data)

    const { data: ops } = await supabase
      .from('opinions')
      .select('*')
      .eq('user_id', data.id)
      .neq('status', 'flagged')
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1)

    if (ops) {
      setOpinions(ops)
      setHasMore(ops.length === PAGE_SIZE)
      pageRef.current = 1
    }
    setLoading(false)
  }

  async function loadMore() {
    if (!hasMore || loadingMore || !profile) return
    setLoadingMore(true)
    const from = pageRef.current * PAGE_SIZE
    const { data } = await supabase
      .from('opinions')
      .select('*')
      .eq('user_id', profile.id)
      .neq('status', 'flagged')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (data) {
      setOpinions(prev => [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
      pageRef.current += 1
    }
    setLoadingMore(false)
  }

  if (loading) return <div className="profile-loading">Loading...</div>
  if (notFound) return (
    <div className="profile-loading">
      <p>User not found.</p>
      <button className="auth-link" onClick={() => window.location.hash = '/'}>← Back</button>
    </div>
  )

  return (
    <div className="profile-wrap">
      <nav className="navbar">
        <div className="navbar-inner">
          <button className="auth-link" style={{ fontSize: 14 }} onClick={() => window.location.hash = '/'}>← pladoxa</button>
          {isMe && myProfile && (
            <div className="nav-profile" style={{ marginLeft: 'auto' }}>
              <div className="avatar avatar-sm" style={{ background: myProfile.avatar_color }}>
                {myProfile.avatar_url
                  ? <img src={myProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  : initials(myProfile.display_name)}
              </div>
              <span className="nav-username">@{myProfile.username}</span>
            </div>
          )}
        </div>
      </nav>

      <div className="profile-header">
        <AvatarSection profile={profile} isMe={isMe} onUpdate={setProfile} />
        <div className="profile-info">
          <div className="profile-name-row">
            <h1 className="profile-display-name">{profile.display_name}</h1>
            {isMe && <EditNameButton profile={profile} onUpdate={setProfile} />}
          </div>
          <span className="profile-username">@{profile.username}</span>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          {isMe && <EditBioButton profile={profile} onUpdate={setProfile} />}
          <span className="profile-joined">Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      <div className="profile-opinions">
        <h2 className="profile-section-title">Opinions ({opinions.length}{hasMore ? '+' : ''})</h2>
        {opinions.length === 0 && !loading && (
          <div className="feed-empty">No opinions yet.</div>
        )}
        {opinions.map(op => (
          <div
            key={op.id}
            className="opinion-card profile-opinion-card"
            onClick={() => window.location.hash = `/debate/${op.id}`}
          >
            <div className="card-badges" style={{ marginBottom: 8 }}>
              <span className={`intensity-badge ${op.intensity}`}>
                {op.intensity === 'hard' ? '🔥 Hard Take' : '💭 Soft Take'}
              </span>
              <span className="topic-badge">{op.topic}</span>
              <span className="card-time">{timeAgo(op.created_at)}</span>
            </div>
            <p className="card-text">{op.text}</p>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
              <span>👍 {op.agrees_count}</span>
              <span>👎 {op.disagrees_count}</span>
              <span>⚡ {op.debates_count}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>Open debate →</span>
            </div>
          </div>
        ))}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {loadingMore && <div className="feed-empty" style={{ padding: '12px 0' }}>Loading more...</div>}
        {!hasMore && opinions.length > 0 && <div className="feed-empty" style={{ padding: '12px 0', fontSize: 12 }}>That's everything.</div>}
      </div>
    </div>
  )
}

function AvatarSection({ profile, isMe, onUpdate }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [cropSrc, setCropSrc] = useState(null)
  const [cropMime, setCropMime] = useState('image/jpeg')
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setError('')
    if (file.size > 10 * 1024 * 1024) { setError('Image must be under 10MB.'); return }
    const reader = new FileReader()
    reader.onload = () => { setCropSrc(reader.result); setCropMime(file.type) }
    reader.readAsDataURL(file)
  }

  async function handleCropDone(croppedBlob) {
    setCropSrc(null)
    setUploading(true)
    setError('')

    // Moderate
    try {
      const base64 = await blobToBase64(croppedBlob)
      const modRes = await fetch('/api/moderate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64.split(',')[1], mimeType: 'image/jpeg' }),
      })
      const modData = await modRes.json()
      const result = modData.results?.[0]
      if (result) {
        const maxScore = Math.max(...Object.values(result.category_scores || {}))
        console.log('[IMG MOD] flagged:', result.flagged, 'maxScore:', maxScore)
        if (maxScore >= 0.5 || result.flagged) {
          setError('Image rejected — does not meet content guidelines.')
          setUploading(false)
          return
        }
      }
    } catch (e) { console.error('[IMG MOD]', e) }

    // Upload
    const path = `${profile.id}/avatar.jpg`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, croppedBlob, { upsert: true, contentType: 'image/jpeg' })

    if (uploadError) { setError('Upload failed: ' + uploadError.message); setUploading(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const cacheBust = `${publicUrl}?t=${Date.now()}`

    const { data: updated, error: updateError } = await supabase
      .from('profiles').update({ avatar_url: cacheBust }).eq('id', profile.id).select().single()

    if (updateError) setError('Failed to save avatar.')
    else onUpdate(updated)
    setUploading(false)
  }

  return (
    <div className="profile-avatar-wrap">
      <div className="avatar-xl-wrap">
        <div className="avatar avatar-xl" style={{ background: profile.avatar_color }}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : initials(profile.display_name)}
        </div>
        {isMe && (
          <button className="avatar-upload-btn" onClick={() => inputRef.current?.click()} title="Change photo">
            {uploading ? '…' : '📷'}
          </button>
        )}
      </div>
      {isMe && <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />}
      {error && <p className="auth-error" style={{ maxWidth: 200, textAlign: 'center' }}>{error}</p>}
      {cropSrc && <CropModal src={cropSrc} mime={cropMime} onDone={handleCropDone} onCancel={() => setCropSrc(null)} />}
    </div>
  )
}

function CropModal({ src, onDone, onCancel }) {
  const [crop, setCrop] = useState()
  const [completedCrop, setCompletedCrop] = useState()
  const imgRef = useRef(null)

  function onImageLoad(e) {
    const { width, height } = e.currentTarget
    const c = centerCrop(makeAspectCrop({ unit: '%', width: 80 }, 1, width, height), width, height)
    setCrop(c)
  }

  async function apply() {
    if (!completedCrop || !imgRef.current) return
    const canvas = document.createElement('canvas')
    const size = 400
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const img = imgRef.current
    const scaleX = img.naturalWidth / img.width
    const scaleY = img.naturalHeight / img.height
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, size, size
    )
    canvas.toBlob(blob => { if (blob) onDone(blob) }, 'image/jpeg', 0.9)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Crop your photo</span>
          <button className="modal-close" onClick={onCancel}>x</button>
        </div>
        <div className="create-body" style={{ alignItems: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>Drag to reposition. The crop is always square.</p>
          <div style={{ maxWidth: '100%', marginTop: 8 }}>
            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={1} circularCrop>
              <img ref={imgRef} src={src} onLoad={onImageLoad} style={{ maxWidth: '100%', maxHeight: 360 }} alt="crop" />
            </ReactCrop>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="submit-btn" onClick={apply}>Apply & Upload</button>
            <button className="auth-link" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function EditNameButton({ profile, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(profile.display_name)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!val.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: val.trim() })
      .eq('id', profile.id)
      .select()
      .single()
    if (!error) { onUpdate(data); setEditing(false) }
    setSaving(false)
  }

  if (!editing) return (
    <button className="auth-link" style={{ fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>
  )

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        className="auth-input"
        style={{ padding: '4px 8px', fontSize: 13, width: 160 }}
        value={val}
        onChange={e => setVal(e.target.value)}
        autoFocus
      />
      <button className="submit-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={save} disabled={saving}>
        {saving ? '...' : 'Save'}
      </button>
      <button className="auth-link" onClick={() => { setEditing(false); setVal(profile.display_name) }}>Cancel</button>
    </div>
  )
}

function EditBioButton({ profile, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(profile.bio || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ bio: val.trim() })
      .eq('id', profile.id)
      .select()
      .single()
    if (!error) { onUpdate(data); setEditing(false) }
    setSaving(false)
  }

  if (!editing) return (
    <button className="auth-link" style={{ fontSize: 12, marginTop: 2 }} onClick={() => setEditing(true)}>
      {profile.bio ? 'Edit bio' : '+ Add bio'}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
      <textarea
        className="opinion-textarea"
        style={{ fontSize: 13, minHeight: 60, padding: '6px 10px' }}
        value={val}
        onChange={e => setVal(e.target.value)}
        maxLength={160}
        placeholder="Write a short bio..."
        autoFocus
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="submit-btn" style={{ padding: '4px 12px', fontSize: 12 }} onClick={save} disabled={saving}>
          {saving ? '...' : 'Save'}
        </button>
        <button className="auth-link" onClick={() => { setEditing(false); setVal(profile.bio || '') }}>Cancel</button>
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
