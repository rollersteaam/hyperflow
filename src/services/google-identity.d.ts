export {}

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: string
  error?: string
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: { type: string; message?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient
          revoke: (accessToken: string, callback?: () => void) => void
        }
      }
    }
  }
}
