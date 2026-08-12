<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { listEvents, createEvent, updateEvent, type CalendarEvent } from '@/services/googleCalendar'
import CreateEventPopover from './CreateEventPopover.vue'
import {
  MINUTES_PER_DAY,
  SNAP_MINUTES,
  DAYS_PER_WEEK,
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
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load calendar events'
  } finally {
    isLoading.value = false
  }
}

watch(() => [auth.isSignedIn, auth.calendarId, weekStart.value.getTime()], loadEvents)
onMounted(loadEvents)

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

async function onDragEnd() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  const state = dragState.value
  dragState.value = null
  if (!state || !state.moved) return

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

      return {
        event,
        dayIndex,
        dragging: Boolean(dragging),
        style: {
          left: `${dayIndex * COLUMN_PERCENT}%`,
          width: `${COLUMN_PERCENT}%`,
          top: `${startMinutes * MINUTE_HEIGHT}px`,
          height: `${durationMinutes * MINUTE_HEIGHT}px`,
        },
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
})

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
        <span v-if="isLoading" class="status">Loading…</span>
        <span v-else-if="loadError" class="status error">{{ loadError }}</span>
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
            :class="{ dragging: pe.dragging }"
            :style="pe.style"
            @pointerdown.stop="onEventPointerDown($event, pe.event, pe.dayIndex)"
          >
            <span class="event-title">{{ pe.event.summary || '(untitled)' }}</span>
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

.event-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
