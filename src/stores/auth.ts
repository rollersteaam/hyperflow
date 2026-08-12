import { defineStore } from 'pinia'
import { requestCalendarAccessToken, revokeAccessToken } from '@/services/googleAuth'

interface AuthState {
  accessToken: string | null
  expiresAt: number | null
  isSigningIn: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    expiresAt: null,
    isSigningIn: false,
    error: null,
  }),

  getters: {
    isSignedIn(state): boolean {
      return Boolean(state.accessToken && state.expiresAt && state.expiresAt > Date.now())
    },
  },

  actions: {
    async signIn() {
      this.isSigningIn = true
      this.error = null
      try {
        const { accessToken, expiresAt } = await requestCalendarAccessToken()
        this.accessToken = accessToken
        this.expiresAt = expiresAt
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to sign in with Google'
      } finally {
        this.isSigningIn = false
      }
    },

    async signOut() {
      if (this.accessToken) {
        await revokeAccessToken(this.accessToken)
      }
      this.accessToken = null
      this.expiresAt = null
    },
  },
})
