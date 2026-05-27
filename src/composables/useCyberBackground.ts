import { type Ref } from 'vue'
import * as THREE from 'three'

export function useCyberBackground(canvasRef: Ref<HTMLCanvasElement | null>) {
  let scene: THREE.Scene | null = null
  let camera: THREE.PerspectiveCamera | null = null
  let renderer: THREE.WebGLRenderer | null = null
  let animId = 0
  let twinkleMat: THREE.PointsMaterial | null = null

  function init() {
    const canvas = canvasRef.value
    if (!canvas) return

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000)
    camera.position.z = 60
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)

    // Glow texture
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = 64; glowCanvas.height = 64
    const gCtx = glowCanvas.getContext('2d')
    if (!gCtx) return
    const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.1, 'rgba(232,240,255,0.95)')
    grad.addColorStop(0.35, 'rgba(0,229,255,0.35)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    gCtx.fillStyle = grad
    gCtx.fillRect(0, 0, 64, 64)
    const glowTex = new THREE.CanvasTexture(glowCanvas)

    // === 1. Deep star field with random twinkle ===
    const starCount = 3500
    const starPos = new Float32Array(starCount * 3)
    const starCol = new Float32Array(starCount * 3)
    const starBaseCol = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 240
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 160
      starPos[i * 3 + 2] = -30 - Math.random() * 140
      const bright = 0.6 + Math.random() * 0.4
      const r = Math.random()
      if (r < 0.45) { starCol[i * 3] = 0.95 * bright; starCol[i * 3 + 1] = 0.97 * bright; starCol[i * 3 + 2] = 1.0 * bright }
      else if (r < 0.7) { starCol[i * 3] = 0.3 * bright; starCol[i * 3 + 1] = 0.9 * bright; starCol[i * 3 + 2] = 1.0 * bright }
      else if (r < 0.85) { starCol[i * 3] = 0.62 * bright; starCol[i * 3 + 1] = 0.36 * bright; starCol[i * 3 + 2] = 1.0 * bright }
      else { starCol[i * 3] = 1.0 * bright; starCol[i * 3 + 1] = 0.88 * bright; starCol[i * 3 + 2] = 0.7 }
      starBaseCol[i * 3] = starCol[i * 3]
      starBaseCol[i * 3 + 1] = starCol[i * 3 + 1]
      starBaseCol[i * 3 + 2] = starCol[i * 3 + 2]
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3))
    const starMat = new THREE.PointsMaterial({
      size: 0.9, map: glowTex, vertexColors: true, transparent: true, opacity: 1.0,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    const starField = new THREE.Points(starGeo, starMat)
    scene.add(starField)

    // Twinkle state
    const hotStars = new Map<number, { timer: number; peak: number }>()
    let twinkleTimer = 0

    // Pulse wave state — expanding ring from random origin
    interface Pulse { cx: number; cy: number; radius: number; maxRadius: number; speed: number }
    const pulses: Pulse[] = []
    let nextPulse = 60 + Math.floor(Math.random() * 120)

    // === 2. Spiral galaxy (LEFT side) ===
    const galaxyCount = 10000
    const galaxyPos = new Float32Array(galaxyCount * 3)
    const galaxyCol = new Float32Array(galaxyCount * 3)
    for (let i = 0; i < galaxyCount; i++) {
      const arm = Math.floor(Math.random() * 3)
      const dist = Math.pow(Math.random(), 0.6) * 50
      const angle = (arm * Math.PI * 2 / 3) + dist * 0.18 + (Math.random() - 0.5) * 0.5
      galaxyPos[i * 3] = Math.cos(angle) * dist + (Math.random() - 0.5) * 2
      galaxyPos[i * 3 + 1] = Math.sin(angle) * dist * 0.35 + (Math.random() - 0.5) * 1.2
      galaxyPos[i * 3 + 2] = -30 - Math.random() * 15
      const bright = 0.5 + Math.random() * 0.5
      const cr = Math.random()
      if (cr < 0.25) { galaxyCol[i * 3] = 0.0 * bright; galaxyCol[i * 3 + 1] = 0.9 * bright; galaxyCol[i * 3 + 2] = 1.0 * bright }
      else if (cr < 0.5) { galaxyCol[i * 3] = 0.62 * bright; galaxyCol[i * 3 + 1] = 0.36 * bright; galaxyCol[i * 3 + 2] = 1.0 * bright }
      else if (cr < 0.7) { galaxyCol[i * 3] = 1.0 * bright; galaxyCol[i * 3 + 1] = 0.49 * bright; galaxyCol[i * 3 + 2] = 0.0 * bright }
      else if (cr < 0.85) { galaxyCol[i * 3] = 0.91 * bright; galaxyCol[i * 3 + 1] = 0.94 * bright; galaxyCol[i * 3 + 2] = 1.0 * bright }
      else { galaxyCol[i * 3] = 1.0 * bright; galaxyCol[i * 3 + 1] = 0.95 * bright; galaxyCol[i * 3 + 2] = 0.8 * bright }
    }
    const galaxyGeo = new THREE.BufferGeometry()
    galaxyGeo.setAttribute('position', new THREE.Float32BufferAttribute(galaxyPos, 3))
    galaxyGeo.setAttribute('color', new THREE.Float32BufferAttribute(galaxyCol, 3))
    const galaxy = new THREE.Points(galaxyGeo, new THREE.PointsMaterial({
      size: 0.6, map: glowTex, vertexColors: true, transparent: true, opacity: 0.75,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }))
    galaxy.rotation.x = 0.4
    galaxy.rotation.z = -0.3
    galaxy.position.set(-20, 8, 0)
    scene.add(galaxy)

    // === 3. Multi-ring star system — merged into 1 draw call ===
    const ringDefs = [
      { rx: 16, ry: 5, count: 280, spread: 3, color: 'cyan' },
      { rx: 26, ry: 9, count: 320, spread: 4, color: 'purple' },
      { rx: 38, ry: 13, count: 360, spread: 5, color: 'orange' },
    ]
    const totalRing = ringDefs.reduce((s, r) => s + r.count, 0)
    const ringPos = new Float32Array(totalRing * 3)
    const ringCol = new Float32Array(totalRing * 3)
    let ri = 0
    for (const ring of ringDefs) {
      for (let j = 0; j < ring.count; j++, ri++) {
        const a = (j / ring.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.1
        const px = ring.rx + (Math.random() - 0.5) * ring.spread
        const py = ring.ry + (Math.random() - 0.5) * (ring.spread * 0.35)
        ringPos[ri * 3] = Math.cos(a) * px
        ringPos[ri * 3 + 1] = Math.sin(a) * py
        ringPos[ri * 3 + 2] = (Math.random() - 0.5) * 1.5
        const bright = 0.6 + Math.random() * 0.4
        const cr = Math.random()
        if (ring.color === 'cyan') {
          if (cr < 0.7) { ringCol[ri * 3] = 0.0; ringCol[ri * 3 + 1] = 0.9 * bright; ringCol[ri * 3 + 2] = 1.0 * bright }
          else { ringCol[ri * 3] = 0.91 * bright; ringCol[ri * 3 + 1] = 0.94 * bright; ringCol[ri * 3 + 2] = 1.0 * bright }
        } else if (ring.color === 'purple') {
          if (cr < 0.65) { ringCol[ri * 3] = 0.62 * bright; ringCol[ri * 3 + 1] = 0.36 * bright; ringCol[ri * 3 + 2] = 1.0 * bright }
          else { ringCol[ri * 3] = 0.91 * bright; ringCol[ri * 3 + 1] = 0.94 * bright; ringCol[ri * 3 + 2] = 1.0 * bright }
        } else {
          if (cr < 0.6) { ringCol[ri * 3] = 1.0 * bright; ringCol[ri * 3 + 1] = 0.49 * bright; ringCol[ri * 3 + 2] = 0.0 * bright }
          else { ringCol[ri * 3] = 1.0 * bright; ringCol[ri * 3 + 1] = 0.95 * bright; ringCol[ri * 3 + 2] = 0.8 * bright }
        }
      }
    }
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3))
    ringGeo.setAttribute('color', new THREE.Float32BufferAttribute(ringCol, 3))
    const starRing = new THREE.Points(ringGeo, new THREE.PointsMaterial({
      size: 0.9, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }))
    starRing.rotation.x = 0.5
    starRing.rotation.z = 0.15
    starRing.position.set(30, -8, 0)
    scene.add(starRing)

    // === 3b. Central star ===
    const coreGlowCanvas = document.createElement('canvas')
    coreGlowCanvas.width = 128; coreGlowCanvas.height = 128
    const coreCtx = coreGlowCanvas.getContext('2d')
    if (coreCtx) {
      const coreGrad = coreCtx.createRadialGradient(64, 64, 0, 64, 64, 64)
      coreGrad.addColorStop(0, 'rgba(255,255,255,1)')
      coreGrad.addColorStop(0.05, 'rgba(255,250,240,0.95)')
      coreGrad.addColorStop(0.12, 'rgba(0,229,255,0.85)')
      coreGrad.addColorStop(0.25, 'rgba(157,92,255,0.45)')
      coreGrad.addColorStop(0.45, 'rgba(255,125,0,0.15)')
      coreGrad.addColorStop(0.7, 'rgba(157,92,255,0.05)')
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)')
      coreCtx.fillStyle = coreGrad
      coreCtx.fillRect(0, 0, 128, 128)
    }
    const coreTex = new THREE.CanvasTexture(coreGlowCanvas)
    const coreStar = new THREE.Sprite(new THREE.SpriteMaterial({
      map: coreTex, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    coreStar.scale.set(18, 18, 1)
    coreStar.position.set(30, -8, 0)
    scene.add(coreStar)

    // === 4. Shooting stars ===
    const meteorCount = 4
    const meteors: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = []
    for (let i = 0; i < meteorCount; i++) {
      const len = 4 + Math.random() * 8
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.01, len, 4),
        new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0 })
      )
      mesh.visible = false
      scene.add(mesh)
      meteors.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0 })
    }
    function spawnMeteor(m: typeof meteors[0]) {
      const goRight = Math.random() > 0.5
      m.mesh.position.set(
        goRight ? -50 + Math.random() * 30 : 20 + Math.random() * 30,
        30 + Math.random() * 25, -5 - Math.random() * 15
      )
      const angle = (30 + Math.random() * 35) * Math.PI / 180
      const speed = 0.3 + Math.random() * 0.4
      const dirX = goRight ? Math.cos(angle) : -Math.cos(angle)
      const dirY = -Math.sin(angle)
      m.vel.set(dirX * speed, dirY * speed, 0)
      m.mesh.rotation.z = Math.atan2(dirY, dirX) - Math.PI / 2
      m.life = 0; m.maxLife = 100 + Math.random() * 120
      m.mesh.visible = true
      ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = 0
    }
    meteors.forEach((m, i) => { spawnMeteor(m); m.life = -i * 30 })

    // === 5. Star bursts — random positions, periodic explosions ===
    const burstParticleCount = 60
    const burstPos = new Float32Array(burstParticleCount * 3)
    const burstCol = new Float32Array(burstParticleCount * 3)
    const burstVel = new Float32Array(burstParticleCount * 3)
    const burstLife = new Float32Array(burstParticleCount)
    burstLife.fill(-1)
    const burstGeo = new THREE.BufferGeometry()
    burstGeo.setAttribute('position', new THREE.Float32BufferAttribute(burstPos, 3))
    burstGeo.setAttribute('color', new THREE.Float32BufferAttribute(burstCol, 3))
    const burstMat = new THREE.PointsMaterial({
      size: 1.2, map: glowTex, vertexColors: true, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    scene.add(new THREE.Points(burstGeo, burstMat))

    let nextBurst = 120 + Math.floor(Math.random() * 200)
    let frameCount = 0

    function triggerBurst() {
      const cx = (Math.random() - 0.5) * 160
      const cy = (Math.random() - 0.5) * 100
      const cz = -10 - Math.random() * 40
      const colors = [
        [0, 0.9, 1],   // cyan
        [0.62, 0.36, 1], // purple
        [1, 0.49, 0],    // orange
        [0.95, 0.97, 1], // white
      ]
      const baseColor = colors[Math.floor(Math.random() * colors.length)]
      for (let i = 0; i < burstParticleCount; i++) {
        const angle = Math.random() * Math.PI * 2
        const elevation = (Math.random() - 0.5) * Math.PI
        const speed = 0.15 + Math.random() * 0.35
        burstPos[i * 3] = cx
        burstPos[i * 3 + 1] = cy
        burstPos[i * 3 + 2] = cz
        burstVel[i * 3] = Math.cos(angle) * Math.cos(elevation) * speed
        burstVel[i * 3 + 1] = Math.sin(elevation) * speed
        burstVel[i * 3 + 2] = Math.sin(angle) * Math.cos(elevation) * speed * 0.3
        burstLife[i] = 60 + Math.random() * 60
        const b = 0.7 + Math.random() * 0.3
        burstCol[i * 3] = baseColor[0] * b
        burstCol[i * 3 + 1] = baseColor[1] * b
        burstCol[i * 3 + 2] = baseColor[2] * b
      }
    }

    // Animate
    const clock = new THREE.Clock()
    function animate() {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Star twinkle — random flash + fade back
      {
        const cArr = starGeo.attributes.color.array as Float32Array
        twinkleTimer++
        // Spawn new twinkles every few frames
        if (twinkleTimer % 3 === 0) {
          const newCount = 3 + Math.floor(Math.random() * 5)
          for (let n = 0; n < newCount; n++) {
            const idx = Math.floor(Math.random() * starCount)
            if (!hotStars.has(idx)) {
              const peak = 1.5 + Math.random() * 1.0
              hotStars.set(idx, { timer: 20 + Math.floor(Math.random() * 30), peak })
              cArr[idx * 3] = peak
              cArr[idx * 3 + 1] = peak
              cArr[idx * 3 + 2] = peak
            }
          }
        }
        // Fade existing hot stars back to base
        let dirty = hotStars.size > 0
        for (const [idx, state] of hotStars) {
          state.timer--
          if (state.timer <= 0) {
            cArr[idx * 3] = starBaseCol[idx * 3]
            cArr[idx * 3 + 1] = starBaseCol[idx * 3 + 1]
            cArr[idx * 3 + 2] = starBaseCol[idx * 3 + 2]
            hotStars.delete(idx)
          } else {
            const fade = state.timer / 50
            const b = idx * 3
            cArr[b] = starBaseCol[b] + (state.peak - starBaseCol[b]) * fade
            cArr[b + 1] = starBaseCol[b + 1] + (state.peak - starBaseCol[b + 1]) * fade
            cArr[b + 2] = starBaseCol[b + 2] + (state.peak - starBaseCol[b + 2]) * fade
          }
        }
        // Pulse wave — expanding ring from random origin
        if (twinkleTimer >= nextPulse) {
          pulses.push({
            cx: (Math.random() - 0.5) * 160,
            cy: (Math.random() - 0.5) * 100,
            radius: 0, maxRadius: 40 + Math.random() * 40,
            speed: 0.6 + Math.random() * 0.4,
          })
          nextPulse = twinkleTimer + 120 + Math.floor(Math.random() * 200)
        }
        for (let pi = pulses.length - 1; pi >= 0; pi--) {
          const p = pulses[pi]
          p.radius += p.speed
          if (p.radius >= p.maxRadius) { pulses.splice(pi, 1); continue }
          const ringWidth = 6
          const posArr = starGeo.attributes.position.array as Float32Array
          for (let si = 0; si < starCount; si++) {
            const dx = posArr[si * 3] - p.cx
            const dy = posArr[si * 3 + 1] - p.cy
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (Math.abs(dist - p.radius) < ringWidth) {
              const intensity = (1 - Math.abs(dist - p.radius) / ringWidth) * (1 - p.radius / p.maxRadius)
              const idx = si * 3
              cArr[idx] = Math.max(cArr[idx], starBaseCol[idx] + intensity * 1.5)
              cArr[idx + 1] = Math.max(cArr[idx + 1], starBaseCol[idx + 1] + intensity * 1.5)
              cArr[idx + 2] = Math.max(cArr[idx + 2], starBaseCol[idx + 2] + intensity * 1.5)
              if (!hotStars.has(si)) {
                hotStars.set(si, { timer: 15, peak: cArr[idx] })
              }
            }
          }
          dirty = true
        }
        if (dirty) (starGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true
      }

      // Galaxy self-rotation
      galaxy.rotation.z = -0.3 + t * 0.04

      // Star ring slow orbit
      starRing.rotation.z = 0.15 + t * 0.02

      // Core star pulse
      const pulse = 1 + Math.sin(t * 1.5) * 0.12
      coreStar.scale.set(18 * pulse, 18 * pulse, 1)

      // Meteors
      for (const m of meteors) {
        if (!m.mesh.visible) { m.life++; if (m.life >= 0) spawnMeteor(m); continue }
        m.mesh.position.add(m.vel)
        m.life++
        const mat = m.mesh.material as THREE.MeshBasicMaterial
        const ratio = m.life / m.maxLife
        if (ratio < 0.15) mat.opacity = ratio / 0.15 * 0.9
        else if (ratio > 0.65) mat.opacity = Math.max(0, (1 - ratio) / 0.35 * 0.9)
        else mat.opacity = 0.9
        if (m.life >= m.maxLife) { m.mesh.visible = false; m.life = -Math.floor(Math.random() * 40) }
      }

      // Star bursts
      frameCount++
      if (frameCount >= nextBurst) {
        triggerBurst()
        frameCount = 0
        nextBurst = 180 + Math.floor(Math.random() * 300)
      }
      for (let i = 0; i < burstParticleCount; i++) {
        if (burstLife[i] < 0) continue
        burstPos[i * 3] += burstVel[i * 3]
        burstPos[i * 3 + 1] += burstVel[i * 3 + 1]
        burstPos[i * 3 + 2] += burstVel[i * 3 + 2]
        burstVel[i * 3] *= 0.97
        burstVel[i * 3 + 1] *= 0.97
        burstVel[i * 3 + 2] *= 0.97
        burstLife[i]--
        const fade = Math.max(0, burstLife[i] / 80)
        burstCol[i * 3] *= 0.98 + 0.02 * fade
        burstCol[i * 3 + 1] *= 0.98 + 0.02 * fade
        burstCol[i * 3 + 2] *= 0.98 + 0.02 * fade
      }
      burstMat.opacity = 0.9
      ;(burstGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
      ;(burstGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true

      // Deep stars gentle drift
      starField.rotation.y = t * 0.005

      renderer!.render(scene!, camera!)
    }
    animate()
  }

  function resize() {
    if (!renderer || !camera || !canvasRef.value) return
    const w = canvasRef.value.clientWidth, h = canvasRef.value.clientHeight
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  function start() {
    init()
    window.addEventListener('resize', resize)
  }

  function stop() {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', resize)
    renderer?.dispose()
  }

  return { start, stop, resize }
}
