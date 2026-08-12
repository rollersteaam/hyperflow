// Thin wrapper around the Google Calendar API v3 REST endpoints.
// All calls go straight from the browser to Google using the access token
// obtained from `googleAuth.ts` — Hyperflow has no backend of its own.

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

/** Name of the dedicated calendar Hyperflow creates events on (never the user's primary calendar). */
export const HYPERFLOW_CALENDAR_NAME = 'Hyperflow'

export interface CalendarEvent {
  id: string
  summary?: string
  description?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  [key: string]: unknown
}

interface ListEventsResult {
  items: CalendarEvent[]
  nextPageToken?: string
}

interface CalendarListEntry {
  id: string
  summary: string
}

interface CalendarListResult {
  items: CalendarListEntry[]
}

async function calendarFetch<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${CALENDAR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Google Calendar API error (${response.status}): ${body}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

/**
 * Finds the user's dedicated "Hyperflow" calendar, creating it if it doesn't
 * exist yet. Hyperflow never reads or writes the user's primary calendar.
 */
export async function ensureHyperflowCalendar(accessToken: string): Promise<string> {
  const list = await calendarFetch<CalendarListResult>(accessToken, '/users/me/calendarList')
  const existing = list.items?.find((entry) => entry.summary === HYPERFLOW_CALENDAR_NAME)
  if (existing) return existing.id

  const created = await calendarFetch<{ id: string }>(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: HYPERFLOW_CALENDAR_NAME }),
  })
  return created.id
}

/** Lists events on the given calendar within a time range (used for a week's worth of the timeline). */
export function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<ListEventsResult> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  return calendarFetch<ListEventsResult>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
  )
}

/** Creates an event on the given calendar. */
export function createEvent(
  accessToken: string,
  calendarId: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      body: JSON.stringify(event),
    },
  )
}

/** Patches an existing event on the given calendar. */
export function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(event),
    },
  )
}

/** Deletes an event from the given calendar. */
export function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  return calendarFetch<void>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
    },
  )
}
