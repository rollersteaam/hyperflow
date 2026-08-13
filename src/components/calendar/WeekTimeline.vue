<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  listEvents,
  listCalendars,
  createEvent,
  updateEvent,
  deleteEvent,
  type CalendarEvent,
} from '@/services/googleCalendar'
import { parseTracking, buildDescription, isEventPlaying } from '@/utils/eventTracking'
import { computeShovelSchedule, type ShovelEvent, type BusyInterval } from '@/utils/shovel'
import CreateEventPopover from './CreateEventPopover.vue'
import EventActionMenu from './EventActionMenu.vue'
import EditEventModal from './EditEventModal.vue'
import {
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  DAYS_PER_WEEK,
  startOfDay,
  startOfWeek,
  addDays,
  isSameDay,
  minutesSinceMidnight,
  snapToQuarterHour,
  dateAtMinutes,
  formatHourLabel,
  formatDayHeader,
  formatWeekRange,
} from '@/utils/date'

const HOUR_HEIGHT = 48
const MINUTE_HEIGHT = HOUR_HEIGHT / 60
const COLUMN_PERCENT = 100 / DAYS_PER_WEEK
const DEFAULT_DURATION_MINUTES = 30
const DRAG_THRESHOLD_PX = 3

const auth = useAuthStore()

const anchorDate = ref(new Date())
const weekStart = computed(() => startOfWeek(anchorDate.value))
const days = computed(() => Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(weekStart.value, i)))
const today = new Date()

const events = ref<CalendarEvent[]>([])
const isLoading = ref(false)
const loadError = ref<string | null>(null)

const daysRef = ref<HTMLElement | null>(null)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

async function loadEvents() {
  if (!auth.accessToken || !auth.calendarId) return
  isLoading.value = true
  loadError.value = null
  try {
    const result = await listEvents(
      auth.accessToken,
      auth.calendarId,
      weekStart.value.toISOString(),
      addDays(weekStart.value, DAYS_PER_WEEK).toISOString(),
    )
    events.value = result.items
    await resumePlayingEvents()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load calendar events'
  } finally {
    isLoading.value = false
  }
}

watch(() => [auth.isSignedIn, auth.calendarId, weekStart.value.getTime()], loadEvents)
onMounted(loadEvents)
onUnmounted(() => {
  for (const eventId of tickIntervals.keys()) stopTicking(eventId)
})

function goToPreviousWeek() {
  anchorDate.value = addDays(weekStart.value, -DAYS_PER_WEEK)
}
function goToNextWeek() {
  anchorDate.value = addDays(weekStart.value, DAYS_PER_WEEK)
}
function goToToday() {
  anchorDate.value = new Date()
}

const hours = Array.from({ length: 24 }, (_, i) => i)

// --- Drag-to-move state ---

interface DragState {
  eventId: string
  originDayIndex: number
  originStartMinutes: number
  durationMinutes: number
  startClientX: number
  startClientY: number
  deltaDayIndex: number
  deltaMinutes: number
  moved: boolean
}

const dragState = ref<DragState | null>(null)

function dayColumnWidth(): number {
  const width = daysRef.value?.getBoundingClientRect().width ?? 0
  return width / DAYS_PER_WEEK
}

function onEventPointerDown(e: PointerEvent, event: CalendarEvent, dayIndex: number) {
  if (!event.start.dateTime || !event.end.dateTime) return
  e.preventDefault()
  const start = new Date(event.start.dateTime)
  const end = new Date(event.end.dateTime)
  dragState.value = {
    eventId: event.id,
    originDayIndex: dayIndex,
    originStartMinutes: minutesSinceMidnight(start),
    durationMinutes: (end.getTime() - start.getTime()) / 60000,
    startClientX: e.clientX,
    startClientY: e.clientY,
    deltaDayIndex: 0,
    deltaMinutes: 0,
    moved: false,
  }
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  const state = dragState.value
  if (!state) return
  const dx = e.clientX - state.startClientX
  const dy = e.clientY - state.startClientY
  if (!state.moved && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
    state.moved = true
  }
  if (!state.moved) return

  const colWidth = dayColumnWidth() || 1
  state.deltaDayIndex = clamp(
    Math.round(dx / colWidth),
    -state.originDayIndex,
    DAYS_PER_WEEK - 1 - state.originDayIndex,
  )
  state.deltaMinutes = snapToQuarterHour(dy / MINUTE_HEIGHT)
}

async function onDragEnd(e: PointerEvent) {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  const state = dragState.value
  dragState.value = null
  if (!state) return

  if (!state.moved) {
    openActionMenu(state.eventId, e.clientX, e.clientY)
    return
  }

  const event = events.value.find((ev) => ev.id === state.eventId)
  if (!event || !auth.accessToken || !auth.calendarId) return

  const newDayIndex = clamp(state.originDayIndex + state.deltaDayIndex, 0, DAYS_PER_WEEK - 1)
  const newStartMinutes = clamp(
    state.originStartMinutes + state.deltaMinutes,
    0,
    MINUTES_PER_DAY - state.durationMinutes,
  )
  const newStart = dateAtMinutes(days.value[newDayIndex], newStartMinutes)
  const newEnd = new Date(newStart.getTime() + state.durationMinutes * 60000)

  const previousStart = event.start
  const previousEnd = event.end
  event.start = { dateTime: newStart.toISOString() }
  event.end = { dateTime: newEnd.toISOString() }

  try {
    await updateEvent(auth.accessToken, auth.calendarId, event.id, {
      start: { dateTime: newStart.toISOString() },
      end: { dateTime: newEnd.toISOString() },
    })
  } catch (err) {
    event.start = previousStart
    event.end = previousEnd
    loadError.value = err instanceof Error ? err.message : 'Failed to move event'
  }
}

const positionedEvents = computed(() => {
  return events.value
    .map((event) => {
      if (!event.start.dateTime || !event.end.dateTime) return null
      const start = new Date(event.start.dateTime)
      const end = new Date(event.end.dateTime)
      const homeDayIndex = days.value.findIndex((d) => isSameDay(d, start))
      if (homeDayIndex === -1) return null

      const durationMinutes = Math.max((end.getTime() - start.getTime()) / 60000, SNAP_MINUTES)
      const dragging = dragState.value?.moved && dragState.value.eventId === event.id
      const resizing = resizeState.value?.resizing && resizeState.value.eventId === event.id

      const dayIndex = dragging
        ? clamp(homeDayIndex + dragState.value!.deltaDayIndex, 0, DAYS_PER_WEEK - 1)
        : homeDayIndex
      const startMinutes = dragging
        ? clamp(
            minutesSinceMidnight(start) + dragState.value!.deltaMinutes,
            0,
            MINUTES_PER_DAY - durationMinutes,
          )
        : minutesSinceMidnight(start)
      const effectiveDuration = resizing
        ? durationMinutes + resizeState.value!.deltaMinutes
        : durationMinutes

      return {
        event,
        dayIndex,
        dragging: Boolean(dragging),
        resizing: Boolean(resizing),
        style: {
          left: `${dayIndex * COLUMN_PERCENT}%`,
          width: `${COLUMN_PERCENT}%`,
          top: `${startMinutes * MINUTE_HEIGHT}px`,
          height: `${effectiveDuration * MINUTE_HEIGHT}px`,
        },
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
})

// --- Drag-to-resize state ---

interface ResizeState {
  eventId: string
  originDurationMinutes: number
  startMinutes: number
  startClientY: number
  deltaMinutes: number
  resizing: boolean
}

const resizeState = ref<ResizeState | null>(null)

function onResizePointerDown(e: PointerEvent, event: CalendarEvent) {
  if (!event.start.dateTime || !event.end.dateTime) return
  e.preventDefault()
  const start = new Date(event.start.dateTime)
  const end = new Date(event.end.dateTime)
  resizeState.value = {
    eventId: event.id,
    originDurationMinutes: (end.getTime() - start.getTime()) / 60000,
    startMinutes: minutesSinceMidnight(start),
    startClientY: e.clientY,
    deltaMinutes: 0,
    resizing: false,
  }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
}

function onResizeMove(e: PointerEvent) {
  const state = resizeState.value
  if (!state) return
  const dy = e.clientY - state.startClientY
  if (!state.resizing && Math.abs(dy) > DRAG_THRESHOLD_PX) {
    state.resizing = true
  }
  if (!state.resizing) return

  state.deltaMinutes = clamp(
    snapToQuarterHour(dy / MINUTE_HEIGHT),
    SNAP_MINUTES - state.originDurationMinutes,
    MINUTES_PER_DAY - state.startMinutes - state.originDurationMinutes,
  )
}

async function onResizeEnd() {
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  const state = resizeState.value
  resizeState.value = null
  if (!state || !state.resizing) return

  const event = events.value.find((ev) => ev.id === state.eventId)
  if (!event || !event.start.dateTime || !auth.accessToken || !auth.calendarId) return

  const newDurationMinutes = state.originDurationMinutes + state.deltaMinutes
  const start = new Date(event.start.dateTime)
  const newEnd = new Date(start.getTime() + newDurationMinutes * 60000)

  const previousEnd = event.end
  event.end = { dateTime: newEnd.toISOString() }

  try {
    await updateEvent(auth.accessToken, auth.calendarId, event.id, {
      end: { dateTime: newEnd.toISOString() },
    })
  } catch (err) {
    event.end = previousEnd
    loadError.value = err instanceof Error ? err.message : 'Failed to resize event'
  }
}

// --- Play / stop timers ---
//
// Playing an event stamps its description with an "Expected time" (the
// event's scheduled duration at the moment Play was clicked) and moves its
// start to now. Every minute while playing, its end time is nudged forward
// by a minute so the block visibly grows. Stopping sets the end to now and
// records the "Actual time" spent plus the "Slippage" against what was
// expected. Playing an event that was already played-and-stopped before
// starts a fresh copy so the original's finished session is preserved, and
// the copy's Expected/Actual time accumulate on top of the previous session.

const tickIntervals = new Map<string, ReturnType<typeof setInterval>>()

function startTicking(eventId: string) {
  stopTicking(eventId)
  const interval = setInterval(async () => {
    const ev = events.value.find((e) => e.id === eventId)
    if (!ev || !ev.end.dateTime || !auth.accessToken || !auth.calendarId) {
      stopTicking(eventId)
      return
    }
    const newEnd = new Date(new Date(ev.end.dateTime).getTime() + 60000)
    ev.end = { ...ev.end, dateTime: newEnd.toISOString() }
    try {
      await updateEvent(auth.accessToken, auth.calendarId, eventId, { end: ev.end })
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to update event timer'
    }
  }, 60000)
  tickIntervals.set(eventId, interval)
}

function stopTicking(eventId: string) {
  const interval = tickIntervals.get(eventId)
  if (interval) {
    clearInterval(interval)
    tickIntervals.delete(eventId)
  }
}

/** Resumes ticking (and catches up the end time) for any event still mid-play after a page reload. */
async function resumePlayingEvents() {
  if (!auth.accessToken || !auth.calendarId) return
  const accessToken = auth.accessToken
  const calendarId = auth.calendarId

  for (const event of events.value) {
    if (tickIntervals.has(event.id)) continue
    if (!event.start.dateTime || !event.end.dateTime) continue
    if (!isEventPlaying(event.description)) continue

    const now = new Date()
    if (new Date(event.end.dateTime).getTime() < now.getTime()) {
      const previousEnd = event.end
      event.end = { dateTime: now.toISOString(), timeZone: event.end.timeZone }
      try {
        await updateEvent(accessToken, calendarId, event.id, { end: event.end })
      } catch {
        event.end = previousEnd
      }
    }
    startTicking(event.id)
  }
}

async function handlePlayRequest() {
  const menu = actionMenu.value
  actionMenu.value = null
  if (!menu || !auth.accessToken || !auth.calendarId) return
  const accessToken = auth.accessToken
  const calendarId = auth.calendarId

  const source = events.value.find((ev) => ev.id === menu.event.id)
  if (!source || !source.start.dateTime || !source.end.dateTime) return

  const { prefix, tracking } = parseTracking(source.description)
  const durationMin = Math.round(
    (new Date(source.end.dateTime).getTime() - new Date(source.start.dateTime).getTime()) / 60000,
  )

  let target = source
  let baseExpected = 0
  let baseActual = 0

  if (tracking.actualMin != null) {
    // Already played to completion before — start a fresh copy that
    // accumulates on top of the previous session(s), leaving the original
    // event's finished record untouched.
    baseExpected = tracking.expectedMin ?? 0
    baseActual = tracking.actualMin

    try {
      const copy = await createEvent(accessToken, calendarId, {
        summary: source.summary,
        description: prefix || undefined,
        start: source.start,
        end: source.end,
      })
      events.value.push(copy)
      target = copy
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : 'Failed to start a new tracking session'
      return
    }
  }

  const now = new Date()
  const newDescription = buildDescription(prefix, {
    expectedMin: baseExpected + durationMin,
    carriedActualMin: baseActual || undefined,
  })

  const previousStart = target.start
  const previousEnd = target.end
  const previousDescription = target.description
  target.start = { dateTime: now.toISOString(), timeZone: target.start.timeZone }
  target.end = { dateTime: now.toISOString(), timeZone: target.end.timeZone }
  target.description = newDescription

  try {
    await updateEvent(accessToken, calendarId, target.id, {
      start: target.start,
      end: target.end,
      description: newDescription,
    })
    startTicking(target.id)
  } catch (err) {
    target.start = previousStart
    target.end = previousEnd
    target.description = previousDescription
    loadError.value = err instanceof Error ? err.message : 'Failed to start event timer'
  }
}

async function handleStopRequest() {
  const menu = actionMenu.value
  actionMenu.value = null
  if (!menu || !auth.accessToken || !auth.calendarId) return
  const accessToken = auth.accessToken
  const calendarId = auth.calendarId

  const event = events.value.find((ev) => ev.id === menu.event.id)
  if (!event || !event.start.dateTime) return

  stopTicking(event.id)

  const { prefix, tracking } = parseTracking(event.description)
  const now = new Date()
  const sessionMin = Math.round((now.getTime() - new Date(event.start.dateTime).getTime()) / 60000)
  const expected = tracking.expectedMin ?? 0
  const actual = (tracking.carriedActualMin ?? 0) + sessionMin
  const slippage = actual - expected

  const newDescription = buildDescription(prefix, {
    expectedMin: expected,
    actualMin: actual,
    slippageMin: slippage,
  })

  const previousEnd = event.end
  const previousDescription = event.description
  event.end = { dateTime: now.toISOString(), timeZone: event.end.timeZone }
  event.description = newDescription

  try {
    await updateEvent(accessToken, calendarId, event.id, {
      end: event.end,
      description: newDescription,
    })
  } catch (err) {
    event.end = previousEnd
    event.description = previousDescription
    loadError.value = err instanceof Error ? err.message : 'Failed to stop event timer'
    startTicking(event.id)
  }
}

// --- Event action menu (play / stop / edit / delete) ---

interface ActionMenuState {
  x: number
  y: number
  event: CalendarEvent
}

const actionMenu = ref<ActionMenuState | null>(null)
const editModalEvent = ref<CalendarEvent | null>(null)

function openActionMenu(eventId: string, x: number, y: number) {
  const event = events.value.find((ev) => ev.id === eventId)
  if (!event) return
  actionMenu.value = { x, y, event }
}

function handleEditRequest() {
  const menu = actionMenu.value
  actionMenu.value = null
  if (!menu) return
  editModalEvent.value = menu.event
}

async function handleDeleteRequest() {
  const menu = actionMenu.value
  actionMenu.value = null
  if (!menu || !auth.accessToken || !auth.calendarId) return

  const eventId = menu.event.id
  const previousEvents = events.value
  events.value = events.value.filter((ev) => ev.id !== eventId)

  try {
    await deleteEvent(auth.accessToken, auth.calendarId, eventId)
  } catch (err) {
    events.value = previousEvents
    loadError.value = err instanceof Error ? err.message : 'Failed to delete event'
  }
}

async function handleEditSubmit(name: string) {
  const target = editModalEvent.value
  editModalEvent.value = null
  if (!target || !auth.accessToken || !auth.calendarId) return

  const event = events.value.find((ev) => ev.id === target.id)
  if (!event) return

  const previousSummary = event.summary
  event.summary = name

  try {
    await updateEvent(auth.accessToken, auth.calendarId, event.id, { summary: name })
  } catch (err) {
    event.summary = previousSummary
    loadError.value = err instanceof Error ? err.message : 'Failed to update event'
  }
}

// --- Shovel ---
//
// Moves every event scheduled for today that has never been started (no
// "Expected time" stamp, see eventTracking.ts) to line up back-to-back
// starting now, in their original relative order. Events on other days are
// left untouched. Already-started/finished Hyperflow events, not-today
// Hyperflow events, and every event on the user's other calendars are all
// treated as fixed busy time: a shoveled event that would land on top of one
// is pushed to start right after it, which cascades onto every event still
// queued behind it. The busy window looks a few days past today in case that
// cascade pushes an event past midnight.

const SHOVEL_BUSY_LOOKAHEAD_DAYS = 3

const isShoveling = ref(false)

async function handleShovel() {
  if (!auth.accessToken || !auth.calendarId || isShoveling.value) return
  const accessToken = auth.accessToken
  const calendarId = auth.calendarId

  isShoveling.value = true
  loadError.value = null
  try {
    const now = new Date()
    const todayStart = startOfDay(now)
    const windowStart = todayStart.toISOString()
    const windowEnd = addDays(todayStart, 1 + SHOVEL_BUSY_LOOKAHEAD_DAYS).toISOString()

    const hyperflowItems = (await listEvents(accessToken, calendarId, windowStart, windowEnd)).items

    const eligible: ShovelEvent[] = []
    const busy: BusyInterval[] = []
    for (const ev of hyperflowItems) {
      if (!ev.start.dateTime || !ev.end.dateTime) continue
      const interval = { start: new Date(ev.start.dateTime), end: new Date(ev.end.dateTime) }
      const neverStarted = parseTracking(ev.description).tracking.expectedMin == null
      if (neverStarted && isSameDay(interval.start, now)) {
        eligible.push({ id: ev.id, ...interval })
      } else {
        busy.push(interval)
      }
    }

    const calendars = await listCalendars(accessToken)
    const otherCalendarIds = calendars.map((cal) => cal.id).filter((id) => id !== calendarId)
    const otherEventLists = await Promise.all(
      otherCalendarIds.map((id) =>
        listEvents(accessToken, id, windowStart, windowEnd).catch(
          () => ({ items: [] as CalendarEvent[] }),
        ),
      ),
    )
    for (const result of otherEventLists) {
      for (const ev of result.items) {
        if (!ev.start.dateTime || !ev.end.dateTime) continue
        busy.push({ start: new Date(ev.start.dateTime), end: new Date(ev.end.dateTime) })
      }
    }

    const schedule = computeShovelSchedule(eligible, busy, now)
    const originalById = new Map(eligible.map((ev) => [ev.id, ev]))

    for (const item of schedule) {
      const original = originalById.get(item.id)
      if (!original || item.start.getTime() === original.start.getTime()) continue
      await updateEvent(accessToken, calendarId, item.id, {
        start: { dateTime: item.start.toISOString() },
        end: { dateTime: item.end.toISOString() },
      })
    }

    await loadEvents()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to shovel events'
  } finally {
    isShoveling.value = false
  }
}

// --- Click-to-create ---

interface PopoverState {
  x: number
  y: number
  dayIndex: number
  startMinutes: number
}

const popover = ref<PopoverState | null>(null)

function onColumnClick(e: MouseEvent, dayIndex: number) {
  if (dragState.value?.moved) return
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const offsetY = e.clientY - rect.top
  const startMinutes = clamp(
    snapToQuarterHour(offsetY / MINUTE_HEIGHT),
    0,
    MINUTES_PER_DAY - DEFAULT_DURATION_MINUTES,
  )
  popover.value = { x: e.clientX, y: e.clientY, dayIndex, startMinutes }
}

async function handleCreate(name: string) {
  const state = popover.value
  popover.value = null
  if (!state || !auth.accessToken || !auth.calendarId) return

  const start = dateAtMinutes(days.value[state.dayIndex], state.startMinutes)
  const end = new Date(start.getTime() + DEFAULT_DURATION_MINUTES * 60000)

  try {
    const created = await createEvent(auth.accessToken, auth.calendarId, {
      summary: name,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    })
    events.value.push(created)
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to create event'
  }
}
</script>

<template>
  <section class="timeline">
    <div v-if="auth.isRestoring" class="signed-out">
      <p>Reconnecting to Google Calendar…</p>
    </div>

    <div v-else-if="!auth.isSignedIn" class="signed-out">
      <p>Connect your Google Calendar to get started.</p>
      <button type="button" :disabled="auth.isSigningIn" @click="auth.signIn()">
        {{ auth.isSigningIn ? 'Connecting…' : 'Connect Google Calendar' }}
      </button>
      <p v-if="auth.error" class="error">{{ auth.error }}</p>
    </div>

    <template v-else>
      <div class="toolbar">
        <div class="nav">
          <button type="button" class="secondary" @click="goToPreviousWeek">‹</button>
          <button type="button" class="secondary" @click="goToToday">Today</button>
          <button type="button" class="secondary" @click="goToNextWeek">›</button>
          <span class="week-label">{{ formatWeekRange(weekStart) }}</span>
        </div>
        <div class="toolbar-actions">
          <span v-if="isLoading" class="status">Loading…</span>
          <span v-else-if="isShoveling" class="status">Shoveling…</span>
          <span v-else-if="loadError" class="status error">{{ loadError }}</span>
          <button
            type="button"
            class="secondary"
            :disabled="isShoveling"
            title="Line up today's never-started events back-to-back starting now"
            @click="handleShovel"
          >
            Shovel
          </button>
        </div>
      </div>

      <div class="grid-header">
        <div class="gutter-spacer" />
        <div
          v-for="day in days"
          :key="day.toISOString()"
          class="day-header"
          :class="{ today: isSameDay(day, today) }"
        >
          {{ formatDayHeader(day) }}
        </div>
      </div>

      <div class="grid-body">
        <div class="gutter">
          <div
            v-for="hour in hours"
            :key="hour"
            class="hour-label"
            :style="{ top: `${hour * HOUR_HEIGHT}px` }"
          >
            {{ formatHourLabel(hour) }}
          </div>
        </div>

        <div class="days" ref="daysRef" :style="{ height: `${MINUTES_PER_DAY * MINUTE_HEIGHT}px` }">
          <div
            v-for="(day, dayIndex) in days"
            :key="day.toISOString()"
            class="day-column"
            :class="{ today: isSameDay(day, today) }"
            :style="{ left: `${dayIndex * COLUMN_PERCENT}%`, width: `${COLUMN_PERCENT}%` }"
            @click="onColumnClick($event, dayIndex)"
          >
            <div v-for="hour in hours" :key="hour" class="hour-line" :style="{ top: `${hour * HOUR_HEIGHT}px` }" />
          </div>

          <div
            v-for="pe in positionedEvents"
            :key="pe.event.id"
            class="event-block"
            :class="{ dragging: pe.dragging, resizing: pe.resizing }"
            :style="pe.style"
            @pointerdown.stop="onEventPointerDown($event, pe.event, pe.dayIndex)"
          >
            <span class="event-title">{{ pe.event.summary || '(untitled)' }}</span>
            <div class="resize-handle" @pointerdown.stop="onResizePointerDown($event, pe.event)" />
          </div>
        </div>
      </div>

      <CreateEventPopover
        v-if="popover"
        :x="popover.x"
        :y="popover.y"
        @submit="handleCreate"
        @cancel="popover = null"
      />

      <EventActionMenu
        v-if="actionMenu"
        :x="actionMenu.x"
        :y="actionMenu.y"
        :is-playing="isEventPlaying(actionMenu.event.description)"
        @play="handlePlayRequest"
        @stop="handleStopRequest"
        @edit="handleEditRequest"
        @delete="handleDeleteRequest"
        @cancel="actionMenu = null"
      />

      <EditEventModal
        v-if="editModalEvent"
        :initial-name="editModalEvent.summary ?? ''"
        @submit="handleEditSubmit"
        @cancel="editModalEvent = null"
      />
    </template>
  </section>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.signed-out {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.error {
  color: #dc2626;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.75rem;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav button {
  padding: 0.3rem 0.6rem;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toolbar-actions button {
  padding: 0.3rem 0.6rem;
}

.secondary {
  background: transparent;
  color: var(--color-text);
}

.week-label {
  margin-left: 0.5rem;
  font-weight: 600;
}

.status {
  font-size: 0.85rem;
  color: #6b7280;
}

.grid-header {
  display: flex;
  border-bottom: 1px solid var(--color-border);
}

.gutter-spacer {
  width: 56px;
  flex-shrink: 0;
}

.day-header {
  flex: 1;
  text-align: center;
  padding: 0.5rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
}

.day-header.today {
  color: var(--color-accent);
}

.grid-body {
  flex: 1;
  display: flex;
  overflow-y: auto;
  position: relative;
}

.gutter {
  width: 56px;
  flex-shrink: 0;
  position: relative;
}

.hour-label {
  position: absolute;
  right: 8px;
  transform: translateY(-50%);
  font-size: 0.7rem;
  color: #9ca3af;
  white-space: nowrap;
}

.days {
  position: relative;
  flex: 1;
}

.day-column {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--color-border);
  cursor: pointer;
}

.day-column.today {
  background: rgba(79, 70, 229, 0.04);
}

.hour-line {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid var(--color-border);
}

.event-block {
  position: absolute;
  margin: 0 2px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--color-accent);
  color: #fff;
  font-size: 0.75rem;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  z-index: 1;
}

.event-block.dragging {
  opacity: 0.85;
  z-index: 2;
  cursor: grabbing;
}

.event-block.resizing {
  z-index: 2;
}

.event-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  cursor: ns-resize;
  touch-action: none;
}
</style>
