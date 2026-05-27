import { onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'

export function cyberHover(el: HTMLElement) {
  const enter = () => gsap.to(el, { scale: 1.03, y: -2, boxShadow: '0 0 20px rgba(0,229,255,0.2)', borderColor: 'rgba(0,229,255,0.35)', duration: 0.3, ease: 'back.out(2)' })
  const leave = () => gsap.to(el, { scale: 1, y: 0, boxShadow: 'none', borderColor: 'rgba(0,229,255,0.12)', duration: 0.25, ease: 'power2.out' })
  el.addEventListener('mouseenter', enter)
  el.addEventListener('mouseleave', leave)
  return () => { el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave) }
}

export function cyberClick(el: HTMLElement) {
  const click = () => {
    gsap.fromTo(el, { scale: 1 }, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' })
  }
  el.addEventListener('click', click)
  return () => el.removeEventListener('click', click)
}

export function cyberPageEnter(el: HTMLElement) {
  gsap.fromTo(el, { opacity: 0, y: 20, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.4)' })
}

export function cyberCountUp(el: HTMLElement, target: number, duration = 1) {
  const obj = { val: 0 }
  gsap.to(obj, { val: target, duration, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(obj.val).toString() } })
}

export function useCyberAnimations(selector = '.cyber-glass, .el-card') {
  const cleanups: (() => void)[] = []

  onMounted(() => {
    document.querySelectorAll<HTMLElement>(selector).forEach(el => {
      cleanups.push(cyberHover(el))
      cleanups.push(cyberClick(el))
    })
  })

  onUnmounted(() => { cleanups.forEach(fn => fn()) })
}
