<script setup lang="ts">
defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{
  edit: []
  delete: []
  cancel: []
}>()
</script>

<template>
  <div class="popover-overlay" @click="emit('cancel')" @contextmenu.prevent="emit('cancel')">
    <div
      class="popover"
      :style="{ left: `${x}px`, top: `${y}px` }"
      @click.stop
      @keydown.escape="emit('cancel')"
    >
      <button type="button" class="menu-item" @click="emit('edit')">Edit</button>
      <button type="button" class="menu-item danger" @click="emit('delete')">Delete</button>
    </div>
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
  gap: 0.15rem;
  padding: 0.35rem;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  width: 140px;
}

.menu-item {
  text-align: left;
  background: transparent;
  color: var(--color-text);
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  font-size: 0.85rem;
}

.menu-item:hover {
  background: rgba(79, 70, 229, 0.08);
}

.menu-item.danger {
  color: #dc2626;
}

.menu-item.danger:hover {
  background: rgba(220, 38, 38, 0.08);
}
</style>
