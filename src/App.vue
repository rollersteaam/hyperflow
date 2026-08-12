<script setup lang="ts">
import { RouterView } from 'vue-router'
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
  min-height: 100vh;
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
  padding: 1.5rem;
}
</style>
