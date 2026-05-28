<template>
  <router-view />
</template>

<script setup lang="ts">
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
userStore.init().catch(() => {})
</script>
