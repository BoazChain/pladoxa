import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Moderation from './Moderation.jsx'
import Profile from './Profile.jsx'
import Debate from './Debate.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'

function Root() {
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onHash = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (hash === '#/mod') return <Moderation />

  const profileMatch = hash.match(/^#\/profile\/(.+)$/)
  if (profileMatch) {
    return (
      <AuthProvider>
        <Profile username={decodeURIComponent(profileMatch[1])} />
      </AuthProvider>
    )
  }

  const debateMatch = hash.match(/^#\/debate\/(.+)$/)
  if (debateMatch) {
    return (
      <AuthProvider>
        <Debate opinionId={debateMatch[1]} />
      </AuthProvider>
    )
  }

  return <App />
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
