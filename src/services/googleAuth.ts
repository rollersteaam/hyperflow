// Client-side Google OAuth via Google Identity Services (GIS).
// Hyperflow has no backend: the browser talks to Google Calendar directly
// using an access token requested from the user's own Google account.

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'

let gisScriptPromise: Promise<void> | null = null

function loadGisScript(): Promise<void> {
  if (gisScriptPromise) return gisScriptPromise

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`)
    if (existing) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = GIS_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })

  return gisScriptPromise
}

export interface GoogleAccessToken {
  accessToken: string
  expiresAt: number
}

/**
 * Requests a Calendar-scoped access token via the GIS token client.
 * Resolves with an access token the caller can attach to Calendar API
 * requests as `Authorization: Bearer <token>`.
 */
export async function requestCalendarAccessToken(): Promise<GoogleAccessToken> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID is not set. Copy .env.example to .env and add your Google OAuth client ID.',
    )
  }

  await loadGisScript()

  return new Promise((resolve, reject) => {
    if (!window.google) {
      reject(new Error('Google Identity Services failed to initialize'))
      return
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: CALENDAR_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error ?? 'Google sign-in failed'))
          return
        }
        resolve({
          accessToken: response.access_token,
          expiresAt: Date.now() + response.expires_in * 1000,
        })
      },
      error_callback: (error) => {
        reject(new Error(error.message ?? error.type))
      },
    })

    tokenClient.requestAccessToken()
  })
}

export function revokeAccessToken(accessToken: string): Promise<void> {
  return new Promise((resolve) => {
    if (!window.google) {
      resolve()
      return
    }
    window.google.accounts.oauth2.revoke(accessToken, () => resolve())
  })
}
