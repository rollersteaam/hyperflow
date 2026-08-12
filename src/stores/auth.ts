import { defineStore } from 'pinia'
import {
  requestCalendarAccessToken,
  requestCalendarAccessTokenSilently,
  revokeAccessToken,
} from '@/services/googleAuth'
import { ensureHyperflowCalendar } from '@/services/googleCalendar'

const STORAGE_KEY = 'hyperflow.auth'

interface PersistedAuth {
  accessToken: string
  expiresAt: number
  calendarId: string
}

function loadPersistedAuth(): PersistedAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedAuth>
    if (!parsed.accessToken || !parsed.expiresAt || !parsed.calendarId) return null
    return parsed as PersistedAuth
  } catch {
    return null
  }
}

function savePersistedAuth(auth: PersistedAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
}

function clearPersistedAuth() {
  localStorage.removeItem(STORAGE_KEY)
}

interface AuthState {
  accessToken: string | null
  expiresAt: number | null
  calendarId: string | null
  isSigningIn: boolean
  isRestoring: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    expiresAt: null,
    calendarId: null,
    isSigningIn: false,
    isRestoring: false,
    error: null,
  }),

  getters: {
    isSignedIn(state): boolean {
      return Boolean(state.accessToken && state.expiresAt && state.expiresAt > Date.now())
    },
  },

  actions: {
    /**
     * Called once on app startup. Restores a previously signed-in session
     * without going through the OAuth flow: reuses the stored access token
     * while it's still valid, or silently requests a fresh one. Leaves the
     * user signed out (so the "Connect Google Calendar" button shows) if
     * neither is possible.
     */
    async restoreSession() {
      const persisted = loadPersistedAuth()
      if (!persisted) return

      if (persisted.expiresAt > Date.now()) {
        this.accessToken = persisted.accessToken
        this.expiresAt = persisted.expiresAt
        this.calendarId = persisted.calendarId
        return
      }

      this.isRestoring = true
      try {
        const { accessToken, expiresAt } = await requestCalendarAccessTokenSilently()
        this.accessToken = accessToken
        this.expiresAt = expiresAt
        this.calendarId = persisted.calendarId
        savePersistedAuth({ accessToken, expiresAt, calendarId: persisted.calendarId })
      } catch {
        clearPersistedAuth()
      } finally {
        this.isRestoring = false
      }
    },

    async signIn() {
      this.isSigningIn = true
      this.error = null
      try {
        const { accessToken, expiresAt } = await requestCalendarAccessToken()
        this.accessToken = accessToken
        this.expiresAt = expiresAt
        this.calendarId = await ensureHyperflowCalendar(accessToken)
        savePersistedAuth({ accessToken, expiresAt, calendarId: this.calendarId })
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to sign in with Google'
        this.accessToken = null
        this.expiresAt = null
        this.calendarId = null
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
      this.calendarId = null
      clearPersistedAuth()
    },
  },
})
