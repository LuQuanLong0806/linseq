import { ref, watch } from 'vue'

type Theme = 'dark' | 'light'

const theme = ref<Theme>((localStorage.getItem('linesequence-theme') as Theme) || 'dark')

export function useTheme() {
  function setTheme(t: Theme) {
    theme.value = t
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('linesequence-theme', t)
    if (t === 'light') {
      document.documentElement.classList.remove('dark')
    } else {
      document.documentElement.classList.add('dark')
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  function initTheme() {
    setTheme(theme.value)
  }

  return { theme, setTheme, toggleTheme, initTheme }
}
