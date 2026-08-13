// Hyperflow stores its own time-tracking fields (Expected/Actual/Slippage) as
// plain-text lines appended to a Google Calendar event's description, since
// Hyperflow has no backend or database of its own to store this separately.

export interface EventTracking {
  expectedMin?: number
  /** Actual minutes accumulated by a previous play/stop session, carried onto a replay copy until it is stopped. */
  carriedActualMin?: number
  actualMin?: number
  slippageMin?: number
}

const LINE_PATTERNS: Record<keyof EventTracking, RegExp> = {
  expectedMin: /^Expected time:\s*([-+]?\d+)\s*min$/i,
  carriedActualMin: /^Carried actual:\s*([-+]?\d+)\s*min$/i,
  actualMin: /^Actual time:\s*([-+]?\d+)\s*min$/i,
  slippageMin: /^Slippage:\s*([-+]?\d+)\s*min$/i,
}

/** Splits a description into free-form user text and Hyperflow's own time-tracking fields. */
export function parseTracking(description?: string): { prefix: string; tracking: EventTracking } {
  const lines = (description ?? '').split('\n')
  const prefixLines: string[] = []
  const tracking: EventTracking = {}

  for (const line of lines) {
    const trimmed = line.trim()
    let matched = false
    for (const [key, pattern] of Object.entries(LINE_PATTERNS) as [keyof EventTracking, RegExp][]) {
      const match = trimmed.match(pattern)
      if (match) {
        tracking[key] = Number(match[1])
        matched = true
        break
      }
    }
    if (!matched) prefixLines.push(line)
  }

  const prefix = prefixLines.join('\n').replace(/\n+$/, '').trim()
  return { prefix, tracking }
}

/** Rebuilds a description string from free-form text plus time-tracking fields. */
export function buildDescription(prefix: string, tracking: EventTracking): string {
  const lines: string[] = []
  if (tracking.expectedMin != null) lines.push(`Expected time: ${tracking.expectedMin} min`)
  if (tracking.carriedActualMin != null) lines.push(`Carried actual: ${tracking.carriedActualMin} min`)
  if (tracking.actualMin != null) lines.push(`Actual time: ${tracking.actualMin} min`)
  if (tracking.slippageMin != null) {
    const sign = tracking.slippageMin > 0 ? '+' : ''
    lines.push(`Slippage: ${sign}${tracking.slippageMin} min`)
  }

  if (!lines.length) return prefix
  return prefix ? `${prefix}\n\n${lines.join('\n')}` : lines.join('\n')
}

/** An event is "playing" once it has an Expected time but hasn't been stopped (no Actual time) yet. */
export function isEventPlaying(description?: string): boolean {
  const { tracking } = parseTracking(description)
  return tracking.expectedMin != null && tracking.actualMin == null
}
