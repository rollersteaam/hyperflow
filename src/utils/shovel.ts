// Scheduling logic for the "Shovel" action: takes every calendar event that
// has never been started and lines them up back-to-back starting from now,
// skipping over any busy time already claimed by other calendars (or by
// Hyperflow events that were already started/finished, which stay put).

import { SNAP_MINUTES } from './date'

export interface ShovelEvent {
  id: string
  start: Date
  end: Date
}

export interface BusyInterval {
  start: Date
  end: Date
}

export interface ShovelResult {
  id: string
  start: Date
  end: Date
}

/** Rounds a date up to the next quarter-hour, matching the timeline's drag/resize snapping. */
export function snapUpToGrid(date: Date): Date {
  const ms = SNAP_MINUTES * 60000
  return new Date(Math.ceil(date.getTime() / ms) * ms)
}

function overlaps(start: Date, end: Date, busy: BusyInterval): boolean {
  return start.getTime() < busy.end.getTime() && end.getTime() > busy.start.getTime()
}

/**
 * Packs `eligibleEvents` sequentially from `now`, preserving each event's
 * original duration and relative order (by original start time). Whenever a
 * candidate slot clashes with a busy interval, the event is pushed to start
 * right after that interval — which, because every following event starts
 * where the previous one ended, naturally cascades the shift onto the rest
 * of the sequence.
 */
export function computeShovelSchedule(
  eligibleEvents: ShovelEvent[],
  busyIntervals: BusyInterval[],
  now: Date,
): ShovelResult[] {
  const sortedEvents = [...eligibleEvents].sort((a, b) => a.start.getTime() - b.start.getTime())
  const sortedBusy = [...busyIntervals].sort((a, b) => a.start.getTime() - b.start.getTime())

  const results: ShovelResult[] = []
  let cursor = snapUpToGrid(now)

  for (const event of sortedEvents) {
    const durationMs = event.end.getTime() - event.start.getTime()
    let start = cursor

    // Repeatedly push past whichever busy interval the current slot lands
    // in, until the slot is clear of all of them.
    let clashed = true
    while (clashed) {
      clashed = false
      const end = new Date(start.getTime() + durationMs)
      for (const busy of sortedBusy) {
        if (overlaps(start, end, busy)) {
          start = busy.end
          clashed = true
        }
      }
    }

    const end = new Date(start.getTime() + durationMs)
    results.push({ id: event.id, start, end })
    cursor = end
  }

  return results
}
