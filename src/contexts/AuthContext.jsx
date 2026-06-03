import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [needsUsername, setNeedsUsername] = useState(false)

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
        setNeedsUsername(false)
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchUnread(user.id))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function fetchUnread(userId) {
    const { count } = await supabase
      .from('notifications').select('*', { count: 'exact', head: true })
      .eq('user_id', userId).eq('read', false)
    setUnreadCount(count ?? 0)
  }

  async function markAllRead() {
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setUnreadCount(0)
  }

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (data) {
      setProfile(data)
      setNeedsUsername(!data.username)
    } else {
      setNeedsUsername(true)
    }
    setLoading(false)
  }

  // ─── SIGN UP (email + username) ────────────────────────────────
  async function signUp(username, password, displayName, email) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return error

    // Upsert full profile — more reliable than doing it inside a DB trigger
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          username,
          display_name: displayName || username,
          avatar_color: '#8b5cf6',
          real_email: email,
          auth_mode: 'email',
        }, { onConflict: 'id' })
      if (profileError) return profileError
    }

    return null
  }

  // ─── SIGN IN (email OR username, works for legacy accounts) ────
  async function signIn(usernameOrEmail, password) {
    const isEmail = usernameOrEmail.includes('@') && !usernameOrEmail.endsWith('@pladoxa.app')

    // Real email entered → try directly
    if (isEmail) {
      const { error } = await supabase.auth.signInWithPassword({ email: usernameOrEmail, password })
      return error
    }

    // Username entered → look up real email first
    const { data: p } = await supabase
      .from('profiles').select('real_email').eq('username', usernameOrEmail).single()
    if (p?.real_email) {
      const { error } = await supabase.auth.signInWithPassword({ email: p.real_email, password })
      return error
    }

    // Legacy account fallback (fake email pattern)
    const { error } = await supabase.auth.signInWithPassword({
      email: `${usernameOrEmail}@pladoxa.app`,
      password,
    })
    return error
  }

  // ─── COMPLETE PROFILE (for users without username) ─────────────
  async function completeProfile(username, displayName) {
    if (!user) return 'Not logged in'

    // Check uniqueness
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('username', username).single()
    if (existing) return 'Username already taken'

    const { data, error } = await supabase
      .from('profiles')
      .update({ username, display_name: displayName, real_email: user.email, auth_mode: 'google' })
      .eq('id', user.id)
      .select().single()

    if (error) return error.message
    setProfile(data)
    setNeedsUsername(false)
    return null
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signUp, signIn, signOut,
      needsUsername, completeProfile,
      unreadCount, markAllRead,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
