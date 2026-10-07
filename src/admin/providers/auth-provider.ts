import type { AuthProvider } from '@refinedev/core'

import { supabaseClient } from '@admin/lib/supabase'

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password })
    if (error || !data?.user) {
      return {
        success: false,
        error: { name: 'LoginError', message: error?.message ?? 'Invalid email or password' },
      }
    }
    return { success: true, redirectTo: '/' }
  },
  logout: async () => {
    await supabaseClient.auth.signOut()
    return { success: true, redirectTo: '/login' }
  },
  check: async () => {
    const { data } = await supabaseClient.auth.getSession()
    if (data.session) return { authenticated: true }
    return { authenticated: false, redirectTo: '/login' }
  },
  onError: async (error) => {
    return { error }
  },
  getIdentity: async () => {
    const { data } = await supabaseClient.auth.getUser()
    if (!data.user) return null
    return { id: data.user.id, name: data.user.email }
  },
}
