<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { listUpcomingEvents, type CalendarEvent } from '@/services/googleCalendar'

const auth = useAuthStore()
const events = ref<CalendarEvent[]>([])
const isLoadingEvents = ref(false)
const loadError = ref<string | null>(null)

async function handleSignIn() {
  await auth.signIn()
  if (auth.isSignedIn) {
    await loadUpcomingEvents()
  }
}

async function loadUpcomingEvents() {
  if (!auth.accessToken) return
  isLoadingEvents.value = true
  loadError.value = null
  try {
    const result = await listUpcomingEvents(auth.accessToken)
    events.value = result.items
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : 'Failed to load calendar events'
  } finally {
    isLoadingEvents.value = false
  }
}

function eventStart(event: CalendarEvent): string {
  return event.start.dateTime ?? event.start.date ?? ''
}
</script>

<template>
  <section>
    <div v-if="!auth.isSignedIn" class="signed-out">
      <p>Connect your Google Calendar to get started.</p>
      <button type="button" :disabled="auth.isSigningIn" @click="handleSignIn">
        {{ auth.isSigningIn ? 'Connecting…' : 'Connect Google Calendar' }}
      </button>
      <p v-if="auth.error" class="error">{{ auth.error }}</p>
    </div>

    <div v-else class="signed-in">
      <div class="toolbar">
        <span>Connected to Google Calendar</span>
        <button type="button" @click="auth.signOut()">Disconnect</button>
      </div>

      <p v-if="isLoadingEvents">Loading upcoming events…</p>
      <p v-else-if="loadError" class="error">{{ loadError }}</p>
      <ul v-else-if="events.length">
        <li v-for="event in events" :key="event.id">
          <strong>{{ event.summary ?? '(no title)' }}</strong>
          <span>{{ eventStart(event) }}</span>
        </li>
      </ul>
      <p v-else>No upcoming events found.</p>
    </div>
  </section>
</template>

<style scoped>
.signed-out,
.signed-in {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

ul {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

li {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--color-border);
}

.error {
  color: #dc2626;
}
</style>
