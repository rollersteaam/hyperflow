// Date/time helpers for the week timeline grid. All math happens in the
// user's local timezone; only ISO conversion at the API boundary cares about UTC.

export const MINUTES_PER_DAY = 24 * 60
export const SNAP_MINUTES = 15
export const DAYS_PER_WEEK = 7

/** Returns midnight on the Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  const day = result.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diffToMonday)
  return result
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Minutes elapsed since local midnight for the given date. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

export function snapToQuarterHour(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/** Returns a new Date at local midnight of `date`, plus `minutes` added on top. */
export function dateAtMinutes(date: Date, minutes: number): Date {
  const result = new Date(date)
  result.setHours(0, minutes, 0, 0)
  return result
}

export function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour} ${period}`
}

export function formatDayHeader(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

export function formatWeekRange(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6)
  const startLabel = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${startLabel} – ${endLabel}`
}
