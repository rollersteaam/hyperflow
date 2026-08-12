// Thin wrapper around the Google Calendar API v3 REST endpoints.
// All calls go straight from the browser to Google using the access token
// obtained from `googleAuth.ts` — Hyperflow has no backend of its own.

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'

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

  return response.json() as Promise<T>
}

/** Lists upcoming events on the user's primary calendar. */
export function listUpcomingEvents(
  accessToken: string,
  maxResults = 10,
): Promise<ListEventsResult> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  })
  return calendarFetch<ListEventsResult>(accessToken, `/calendars/primary/events?${params}`)
}

/** Creates an event on the user's primary calendar. */
export function createEvent(
  accessToken: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(accessToken, '/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  })
}

/** Patches an existing event on the user's primary calendar. */
export function updateEvent(
  accessToken: string,
  eventId: string,
  event: Partial<CalendarEvent>,
): Promise<CalendarEvent> {
  return calendarFetch<CalendarEvent>(accessToken, `/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  })
}

/** Deletes an event from the user's primary calendar. */
export function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  return calendarFetch<void>(accessToken, `/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
  })
}
