import { ref } from 'vue'

const chatOpen = ref(false)
const initialTaskId = ref<string | null>(null)

export function useChatPanel() {
  function openChat(taskId?: string) {
    initialTaskId.value = taskId || null
    chatOpen.value = true
  }

  function closeChat() {
    chatOpen.value = false
    initialTaskId.value = null
  }

  return { chatOpen, initialTaskId, openChat, closeChat }
}
