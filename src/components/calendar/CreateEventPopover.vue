<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
}>()

const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
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
  <div class="popover-overlay" @click="emit('cancel')" @contextmenu.prevent="emit('cancel')">
    <form
      class="popover"
      :style="{ left: `${props.x}px`, top: `${props.y}px` }"
      @click.stop
      @submit.prevent="handleSubmit"
    >
      <input
        ref="inputRef"
        v-model="name"
        type="text"
        placeholder="Event name"
        @keydown.escape="emit('cancel')"
      />
      <div class="actions">
        <button type="button" class="secondary" @click="emit('cancel')">Cancel</button>
        <button type="submit">Create</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.popover-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
}

.popover {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.65rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  width: 220px;
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
