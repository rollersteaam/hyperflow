<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  initialName: string
}>()

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
}>()

const name = ref(props.initialName)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
  inputRef.value?.select()
})

function handleSubmit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    emit('cancel')
    return
  }
  emit('submit', trimmed)
}
</script>

<template>
  <div class="modal-overlay" @click="emit('cancel')">
    <form class="modal" @click.stop @submit.prevent="handleSubmit">
      <h2 class="modal-title">Edit event</h2>
      <input
        ref="inputRef"
        v-model="name"
        type="text"
        placeholder="Event name"
        @keydown.escape="emit('cancel')"
      />
      <div class="actions">
        <button type="button" class="secondary" @click="emit('cancel')">Cancel</button>
        <button type="submit">Save</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
}

.modal {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.2);
  width: 280px;
}

.modal-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

input {
  font-family: inherit;
  font-size: 0.9rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}

.actions button {
  padding: 0.35rem 0.7rem;
  font-size: 0.8rem;
}

.secondary {
  background: transparent;
  color: var(--color-text);
}
</style>
