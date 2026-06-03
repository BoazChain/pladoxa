import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// AUTH MODE — flip this to 'email' when ready
// 'username' = username + fake email (current)
// 'email'    = real email + username (future)
// ─────────────────────────────────────────────
export const AUTH_MODE = 'username'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setUnreadCount(0)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    fetchUnread(user.id)

    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => fetchUnread(user.id))
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user])

  async function fetchUnread(userId) {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }

  async function markAllRead() {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setUnreadCount(0)
  }

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  // ─── SIGN UP ───────────────────────────────
  // username mode:  username + fake email
  // email mode:     real email + username (swap AUTH_MODE to enable)
  async function signUp(username, password, displayName, realEmail = null) {
    if (AUTH_MODE === 'email' && realEmail) {
      // Future: real email auth
      const { data, error } = await supabase.auth.signUp({
        email: realEmail,
        password,
        options: { data: { username, display_name: displayName } },
      })
      if (!error && data.user) {
        // Store real email in profile
        await supabase.from('profiles')
          .update({ real_email: realEmail, auth_mode: 'email' })
          .eq('id', data.user.id)
      }
      return error
    }

    // Default: username-only mode (legacy + current)
    const fakeEmail = `${username}@pladoxa.app`
    const { error } = await supabase.auth.signUp({
      email: fakeEmail,
      password,
      options: { data: { username, display_name: displayName } },
    })
    return error
  }

  // ─── SIGN IN ───────────────────────────────
  // username mode:  reconstruct fake email from username
  // email mode:     sign in with real email directly
  async function signIn(usernameOrEmail, password) {
    if (AUTH_MODE === 'email') {
      // Future: try real email first, fall back to username lookup
      const isEmail = usernameOrEmail.includes('@') && !usernameOrEmail.endsWith('@pladoxa.app')
      if (isEmail) {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameOrEmail, password })
        return error
      }
      // Username entered in email mode — look up their real email
      const { data: p } = await supabase.from('profiles').select('real_email, auth_mode').eq('username', usernameOrEmail).single()
      if (p?.real_email) {
        const { error } = await supabase.auth.signInWithPassword({ email: p.real_email, password })
        return error
      }
      // Legacy account — fall through to fake email
    }

    // Default + legacy accounts: construct fake email from username
    const fakeEmail = `${usernameOrEmail}@pladoxa.app`
    const { error } = await supabase.auth.signInWithPassword({ email: fakeEmail, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, unreadCount, markAllRead }}>
      {children}
    </AuthContext.Provider>
  )
}
