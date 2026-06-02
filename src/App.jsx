import { useState } from 'react'
import './App.css'

const SEED = [
  {
    id: 1,
    user: { name: 'Maya Chen', handle: 'mayaopines', initials: 'MC', color: '#7c3aed' },
    intensity: 'hard',
    topic: 'Tech',
    text: "Hot take.... remote work is better than in person work",
    agrees: 847,
    disagrees: 312,
    debates: 89,
    ts: '2h ago',
    vote: null,
    replies: [
      {
        id: 11,
        user: { name: 'Alex Rivera', initials: 'AR', color: '#2563eb' },
        text: "Serendipitous hallway conversations that spark real ideas just don't happen over Slack.",
        time: '1h ago',
      },
      {
        id: 12,
        user: { name: 'Sam Park', initials: 'SP', color: '#059669' },
        text: "Company culture was always a dressed-up word for surveillance and conformity. Good riddance.",
        time: '45m ago',
      },
    ],
  },
  {
    id: 2,
    user: { name: 'Jordan Plex', handle: 'jplex', initials: 'JP', color: '#dc2626' },
    intensity: 'soft',
    topic: 'Food',
    text: "Pineapple on pizza is genuinely good and people only hate it because they think theyre supposed to",
    agrees: 1203,
    disagrees: 2891,
    debates: 445,
    ts: '4h ago',
    vote: null,
    replies: [
      {
        id: 21,
        user: { name: 'Felix Wu', initials: 'FW', color: '#7c3aed' },
        text: "The moisture from pineapple makes the crust soggy",
        time: '3h ago',
      },
    ],
  },
  {
    id: 3,
    user: { name: 'Priya Nair', handle: 'priyatakes', initials: 'PN', color: '#0891b2' },
    intensity: 'hard',
    topic: 'Society',
    text: "Ketchup isnt as good as hot sauce",
    agrees: 3421,
    disagrees: 892,
    debates: 267,
    ts: '6h ago',
    vote: null,
    replies: [],
  },
  {
    id: 4,
    user: { name: 'Theo Black', handle: 'theoblack', initials: 'TB', color: '#d97706' },
    intensity: 'soft',
    topic: 'Entertainment',
    text: "Movie theatres gotta go, i can watch the same thing at home on some russian website and buy popcorn for a dollar",
    agrees: 5678,
    disagrees: 1234,
    debates: 198,
    ts: '8h ago',
    vote: null,
    replies: [],
  },
  {
    id: 5,
    user: { name: 'Zara Ahmed', handle: 'zaraopines', initials: 'ZA', color: '#16a34a' },
    intensity: 'hard',
    topic: 'Philosophy',
    text: "\"Everything happens for a reason\" is one of the most harmful beliefs EVER tell me im wrong",
    agrees: 7823,
    disagrees: 2341,
    debates: 892,
    ts: '12h ago',
    vote: null,
    replies: [
      {
        id: 51,
        user: { name: 'Omar Khalid', initials: 'OK', color: '#dc2626' },
        text: "yeah ur f'ed up",
        time: '10h ago',
      },
      {
        id: 52,
        user: { name: 'Lucy Stone', initials: 'LS', color: '#7c3aed' },
        text: "idkkk broooooooooo",
        time: '9h ago',
      },
    ],
  },
  {
    id: 6,
    user: { name: 'Dev Kumar', handle: 'devkumar', initials: 'DK', color: '#8b5cf6' },
    intensity: 'soft',
    topic: 'Tech',
    text: "I think nokias are better than iphones and samsungs",
    agrees: 2341,
    disagrees: 3456,
    debates: 1234,
    ts: '1d ago',
    vote: null,
    replies: [],
  },
  {
    id: 7,
    user: { name: 'Nora Walsh', handle: 'noraopines', initials: 'NW', color: '#be185d' },
    intensity: 'hard',
    topic: 'Culture',
    text: "WE HUSTLE EVERY DAYYYY YOOOOOOO",
    agrees: 4512,
    disagrees: 1023,
    debates: 334,
    ts: '2d ago',
    vote: null,
    replies: [],
  },
]

const TOPICS = ['All', 'Tech', 'Society', 'Food', 'Philosophy', 'Entertainment', 'Culture', 'Politics', 'Science']

export default function App() {
  const [opinions, setOpinions] = useState(SEED)
  const [filter, setFilter] = useState('All')
  const [sort, setSort] = useState('hot')
  const [createOpen, setCreateOpen] = useState(false)
  const [debateId, setDebateId] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg, type = '') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  function vote(id, type) {
    setOpinions(prev => prev.map(op => {
      if (op.id !== id) return op
      if (op.vote === type) {
        return {
          ...op,
          vote: null,
          agrees: type === 'agree' ? op.agrees - 1 : op.agrees,
          disagrees: type === 'disagree' ? op.disagrees - 1 : op.disagrees,
        }
      }
      const fromAgree = op.vote === 'agree'
      const fromDis = op.vote === 'disagree'
      return {
        ...op,
        vote: type,
        agrees: type === 'agree' ? op.agrees + 1 : fromAgree ? op.agrees - 1 : op.agrees,
        disagrees: type === 'disagree' ? op.disagrees + 1 : fromDis ? op.disagrees - 1 : op.disagrees,
      }
    }))
    if (type === 'agree') showToast('You agreed with this.', 'agree')
    else showToast('You disagreed with this.', 'disagree')
  }

  // function createAcc() {
  //   const newacc = {
  //     id: Date.now(),
  //     user: { name: prompt("TEST PURPOSE input name"), handle: 'you', initials: 'YO', color: '#8b5cf6' }
  //   }
  // }

  function create(data) {
    const newOp = {
      ...data,
      id: Date.now(),
      user: { name: 'You', handle: 'you', initials: 'YO', color: '#8b5cf6' },
      agrees: 0, disagrees: 0, debates: 0,
      ts: 'just now',
      vote: null,
      replies: [],
    }
    setOpinions(prev => [newOp, ...prev])
    setCreateOpen(false)
    showToast('Opinion dropped.', 'success')
  }

  function addReply(opId, text) {
    setOpinions(prev => prev.map(op => {
      if (op.id !== opId) return op
      return {
        ...op,
        debates: op.debates + 1,
        replies: [
          ...op.replies,
          { id: Date.now(), user: { name: 'You', initials: 'YO', color: '#8b5cf6' }, text, time: 'just now' },
        ],
      }
    }))
    showToast('You entered the debate.', 'success')
  }

  const debateOp = opinions.find(op => op.id === debateId)

  const filtered = opinions.filter(op => filter === 'All' || op.topic === filter)
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'new') return b.id - a.id
    if (sort === 'controversial') return b.debates - a.debates
    return (b.agrees + b.debates * 2) - (a.agrees + a.debates * 2)
  })

  return (
    <div>
      <Navbar onNew={() => setCreateOpen(true)} />

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
            {sorted.length === 0 ? (
              <div className="feed-empty">No opinions here yet. Drop the first one.</div>
            ) : sorted.map(op => (
              <OpinionCard
                key={op.id}
                op={op}
                onVote={type => vote(op.id, type)}
                onDebate={() => setDebateId(op.id)}
              />
            ))}
          </div>
        </main>
      </div>

      <button className="fab" onClick={() => setCreateOpen(true)} title="Drop an opinion">+</button>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreate={create} />}
      {debateId && debateOp && (
        <DebateModal
          op={debateOp}
          onClose={() => setDebateId(null)}
          onReply={text => addReply(debateId, text)}
        />
      )}
      {toast && <div className={`toast${toast.type ? ' ' + toast.type : ''}`}>{toast.msg}</div>}
    </div>
  )
}

function Navbar({ onNew }) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="brand-name">pladoxa</span>
        <span className="navbar-tagline">drop your take.</span>
        <button className="new-opinion-btn" onClick={onNew}>+ New Opinion</button>
        <button className="signin-btn">Sign Up</button>
      </div>
    </nav>
  )
}

function OpinionCard({ op, onVote, onDebate }) {
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
          className={`action-btn agree-btn${op.vote === 'agree' ? ' voted' : ''}`}
          onClick={() => onVote('agree')}
        >
          <span className="btn-icon">👍</span>
          <span className="btn-count">{op.agrees.toLocaleString()}</span>
          <span className="btn-label">Agree</span>
        </button>
        <button
          className={`action-btn disagree-btn${op.vote === 'disagree' ? ' voted' : ''}`}
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

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onCreate({ text: text.trim(), intensity, topic })
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
              <button
                type="button"
                className={`int-btn${intensity === 'soft' ? ' active-soft' : ''}`}
                onClick={() => setIntensity('soft')}
              >
                Soft Take
              </button>
              <button
                type="button"
                className={`int-btn${intensity === 'hard' ? ' active-hard' : ''}`}
                onClick={() => setIntensity('hard')}
              >
                Hard Take
              </button>
            </div>
          </div>

          <div className="form-row">
            <div className="topic-sel-group">
              <span className="field-label">Topic</span>
              <select
                className="topic-sel"
                value={topic}
                onChange={e => setTopic(e.target.value)}
              >
                {TOPICS.filter(t => t !== 'All').map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={!text.trim()}>
            Post
          </button>
        </form>
      </div>
    </div>
  )
}

function DebateModal({ op, onClose, onReply }) {
  const [text, setText] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!text.trim()) return
    onReply(text.trim())
    setText('')
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
              placeholder="Make your case..."
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={280}
              autoFocus
            />
            <button type="submit" className="submit-btn" disabled={!text.trim()}>
              Enter Debate
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
