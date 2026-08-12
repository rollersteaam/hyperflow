<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
onMounted(() => {
  auth.restoreSession()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <h1>Hyperflow</h1>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
}

.app-header h1 {
  font-size: 1.25rem;
  font-weight: 600;
}

main {
  flex: 1;
  min-height: 0;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
}
</style>
