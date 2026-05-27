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

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 2000)
    camera.position.z = 60
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)

    // Glow texture — circular soft radial gradient
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

    // === 1. Deep star field ===
    const starCount = 2000
    const starPos = new Float32Array(starCount * 3)
    const starCol = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 300
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 200
      starPos[i * 3 + 2] = -20 - Math.random() * 180
      const r = Math.random()
      if (r < 0.6) { starCol[i * 3] = 0.91; starCol[i * 3 + 1] = 0.94; starCol[i * 3 + 2] = 1.0 }
      else if (r < 0.8) { starCol[i * 3] = 0.3; starCol[i * 3 + 1] = 0.85; starCol[i * 3 + 2] = 1.0 }
      else { starCol[i * 3] = 1.0; starCol[i * 3 + 1] = 0.88; starCol[i * 3 + 2] = 0.7 }
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3))
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3))
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      size: 0.7, map: glowTex, vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })))

    // === 2. Spiral galaxy — 3-arm multicolor swirl ===
    const galaxyCount = 5000
    const galaxyPos = new Float32Array(galaxyCount * 3)
    const galaxyCol = new Float32Array(galaxyCount * 3)
    for (let i = 0; i < galaxyCount; i++) {
      const arm = Math.floor(Math.random() * 3)
      const dist = Math.pow(Math.random(), 0.6) * 30
      const angle = (arm * Math.PI * 2 / 3) + dist * 0.2 + (Math.random() - 0.5) * 0.5
      galaxyPos[i * 3] = Math.cos(angle) * dist + (Math.random() - 0.5) * 2
      galaxyPos[i * 3 + 1] = Math.sin(angle) * dist * 0.3 + (Math.random() - 0.5) * 1.5
      galaxyPos[i * 3 + 2] = -25 - Math.random() * 10
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
      size: 0.55, map: glowTex, vertexColors: true, transparent: true, opacity: 0.75,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }))
    galaxy.rotation.x = 0.4
    galaxy.rotation.z = -0.3
    galaxy.position.set(25, 12, 0)
    scene.add(galaxy)

    // === 3. Star ring — purple ellipse ===
    const ringCount = 400
    const ringPos = new Float32Array(ringCount * 3)
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2
      const rx = 40 + (Math.random() - 0.5) * 5
      const ry = 12 + (Math.random() - 0.5) * 3
      ringPos[i * 3] = Math.cos(a) * rx
      ringPos[i * 3 + 1] = Math.sin(a) * ry
      ringPos[i * 3 + 2] = -15 + (Math.random() - 0.5) * 6
    }
    const ringGeo = new THREE.BufferGeometry()
    ringGeo.setAttribute('position', new THREE.Float32BufferAttribute(ringPos, 3))
    const starRing = new THREE.Points(ringGeo, new THREE.PointsMaterial({
      size: 1.0, map: glowTex, color: 0x9D5CFF, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }))
    starRing.rotation.x = 0.5
    starRing.rotation.z = 0.15
    scene.add(starRing)

    // === 4. Twinkle stars ===
    const twinkleCount = 60
    const twinklePos = new Float32Array(twinkleCount * 3)
    for (let i = 0; i < twinkleCount; i++) {
      twinklePos[i * 3] = (Math.random() - 0.5) * 180
      twinklePos[i * 3 + 1] = (Math.random() - 0.5) * 120
      twinklePos[i * 3 + 2] = -10 - Math.random() * 60
    }
    const twinkleGeo = new THREE.BufferGeometry()
    twinkleGeo.setAttribute('position', new THREE.Float32BufferAttribute(twinklePos, 3))
    twinkleMat = new THREE.PointsMaterial({
      size: 1.5, map: glowTex, color: 0xE8F0FF, transparent: true, opacity: 0.9,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    })
    scene.add(new THREE.Points(twinkleGeo, twinkleMat))

    // === 5. Shooting stars ===
    const meteorCount = 6
    const meteors: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = []
    for (let i = 0; i < meteorCount; i++) {
      const len = 2 + Math.random() * 4
      const mGeo = new THREE.CylinderGeometry(0.15, 0.01, len, 4)
      const mesh = new THREE.Mesh(mGeo, new THREE.MeshBasicMaterial({ color: 0x00E5FF, transparent: true, opacity: 0 }))
      mesh.visible = false
      scene.add(mesh)
      meteors.push({ mesh, vel: new THREE.Vector3(), life: 0, maxLife: 0 })
    }

    function spawnMeteor(m: typeof meteors[0]) {
      const goRight = Math.random() > 0.5
      m.mesh.position.set(
        goRight ? -50 + Math.random() * 30 : 20 + Math.random() * 30,
        30 + Math.random() * 25,
        -5 - Math.random() * 15
      )
      const angle = (30 + Math.random() * 35) * Math.PI / 180
      const speed = 0.3 + Math.random() * 0.4
      const dirX = goRight ? Math.cos(angle) : -Math.cos(angle)
      const dirY = -Math.sin(angle)
      m.vel.set(dirX * speed, dirY * speed, 0)
      m.mesh.rotation.z = Math.atan2(dirY, dirX) - Math.PI / 2
      m.life = 0
      m.maxLife = 100 + Math.random() * 120
      m.mesh.visible = true
      ;(m.mesh.material as THREE.MeshBasicMaterial).opacity = 0
    }
    meteors.forEach((m, i) => { spawnMeteor(m); m.life = -i * 25 })

    // Animate
    const clock = new THREE.Clock()
    function animate() {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      if (twinkleMat) twinkleMat.opacity = 0.5 + Math.sin(t * 2) * 0.35

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

      scene!.children.forEach((c, idx) => {
        if ((c as THREE.Mesh).isMesh) return
        c.rotation.y = t * 0.015 * (idx % 2 === 0 ? 1 : -1)
      })
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
