<template>
  <div class="planetary-view">
    <canvas ref="canvasRef" class="planet-canvas"></canvas>
    <!-- HTML overlay for labels / tooltips -->
    <div class="planet-overlay" ref="overlayRef">
      <div
        v-for="p in planetScreenPositions" :key="p.id"
        class="planet-label-3d"
        :style="{ left: `${p.x}px`, top: `${p.y}px` }"
        draggable="true"
        @click="showDetail(p.task, $event)"
        @dragstart.stop="startDrag($event, p.task)"
      >
        <span class="label-text">{{ p.title }}</span>
      </div>
    </div>
    <TaskPortal variant="teleport" @drop="onPortalDrop" class="portal-area" />
    <TaskDetailPopup :task="popupTask" :x="popupX" :y="popupY" @close="popupTask = null"
      @detail="navDetail" @config="navConfig" @toggleTodo="navTodo" @statusChange="navStatus" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import type { Task } from '@/types'
import { useTaskStore } from '@/stores/task'
import TaskPortal from './TaskPortal.vue'
import TaskDetailPopup from './TaskDetailPopup.vue'
import { getProjectColor } from './projectColors'

const props = defineProps<{ tasks: Task[] }>()
const emit = defineEmits<{
  config: [task: Task]
  toggleTodo: [task: Task]
  statusChange: [task: Task, status: string]
}>()

const router = useRouter()
const taskStore = useTaskStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const overlayRef = ref<HTMLElement | null>(null)

const prioritySizes: Record<string, number> = { urgent: 2.0, high: 1.6, medium: 1.2, low: 0.9 }

interface PlanetScreenPos { id: string; x: number; y: number; title: string; task: Task }
const planetScreenPositions = ref<PlanetScreenPos[]>([])

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let animId = 0
let planetMeshes: { mesh: THREE.Mesh; ring?: THREE.Mesh; orbitRadius: number; orbitSpeed: number; orbitOffset: number; task: Task }[] = []
let centralStar: THREE.Mesh | null = null
let dragTask: Task | null = null

function buildScene() {
  const canvas = canvasRef.value
  if (!canvas) return

  // Cleanup previous
  dispose()

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)

  const w = canvas.parentElement?.clientWidth || 800
  const h = canvas.parentElement?.clientHeight || 600
  renderer.setSize(w, h)

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000)
  camera.position.set(0, 45, 40)
  camera.lookAt(0, 0, 0)

  // Ambient + directional light for 3D shading
  scene.add(new THREE.AmbientLight(0x334466, 1.2))
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
  dirLight.position.set(20, 30, 10)
  scene.add(dirLight)
  const pointLight = new THREE.PointLight(0x00E5FF, 2, 100)
  pointLight.position.set(0, 0, 0)
  scene.add(pointLight)

  // Central star — glowing sphere
  const starGeo = new THREE.SphereGeometry(2.5, 32, 32)
  const starMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
  })
  centralStar = new THREE.Mesh(starGeo, starMat)
  scene.add(centralStar)

  // Star glow sprite
  const glowCanvas = document.createElement('canvas')
  glowCanvas.width = 128; glowCanvas.height = 128
  const gCtx = glowCanvas.getContext('2d')!
  const gGrad = gCtx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gGrad.addColorStop(0, 'rgba(255,255,255,0.8)')
  gGrad.addColorStop(0.1, 'rgba(0,229,255,0.6)')
  gGrad.addColorStop(0.3, 'rgba(157,92,255,0.3)')
  gGrad.addColorStop(0.6, 'rgba(255,125,0,0.1)')
  gGrad.addColorStop(1, 'rgba(0,0,0,0)')
  gCtx.fillStyle = gGrad
  gCtx.fillRect(0, 0, 128, 128)
  const glowTex = new THREE.CanvasTexture(glowCanvas)
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  glowSprite.scale.set(15, 15, 1)
  scene.add(glowSprite)

  // Build planets
  planetMeshes = []
  const total = props.tasks.length || 1
  const maxR = 38

  props.tasks.forEach((task, idx) => {
    const colorStr = getProjectColor(task.project || task.customer)
    const threeColor = new THREE.Color(colorStr)
    const size = prioritySizes[task.priority] || 1.2
    const orbitRadius = 6 + (idx / total) * (maxR - 6)
    const orbitSpeed = 0.15 + (idx % 5) * 0.04
    const orbitOffset = (idx / total) * Math.PI * 2

    // Planet sphere
    const geo = new THREE.SphereGeometry(size, 24, 24)
    const mat = new THREE.MeshStandardMaterial({
      color: threeColor,
      roughness: 0.6,
      metalness: 0.3,
      emissive: threeColor,
      emissiveIntensity: 0.15,
    })
    const mesh = new THREE.Mesh(geo, mat)

    // Orbit ring (torus)
    const orbitGeo = new THREE.TorusGeometry(orbitRadius, 0.04, 8, 64)
    const orbitMat = new THREE.MeshBasicMaterial({
      color: 0x00E5FF, transparent: true, opacity: 0.06,
    })
    const orbitMesh = new THREE.Mesh(orbitGeo, orbitMat)
    orbitMesh.rotation.x = Math.PI / 2
    scene!.add(orbitMesh)

    // AI todo ring around planet
    let ring: THREE.Mesh | undefined
    if (taskStore.isInTodoList(task.id)) {
      const ringGeo = new THREE.TorusGeometry(size * 1.4, 0.06, 8, 32)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xFF7D00, transparent: true, opacity: 0.6,
      })
      ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2.5
      mesh.add(ring)
    }

    scene!.add(mesh)
    planetMeshes.push({ mesh, ring, orbitRadius, orbitSpeed, orbitOffset, task })
  })
}

function dispose() {
  cancelAnimationFrame(animId)
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
  }
  scene?.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose())
      else obj.material.dispose()
    }
  })
  scene = null; camera = null; renderer = null
  planetMeshes = []
}

function animate() {
  if (!renderer || !scene || !camera) return
  animId = requestAnimationFrame(animate)
  const t = performance.now() * 0.001

  // Central star pulse
  if (centralStar) {
    const s = 1 + Math.sin(t * 1.5) * 0.1
    centralStar.scale.set(s, s, s)
  }

  // Update planet positions
  const screenPositions: PlanetScreenPos[] = []
  for (const p of planetMeshes) {
    const angle = t * p.orbitSpeed + p.orbitOffset
    p.mesh.position.x = Math.cos(angle) * p.orbitRadius
    p.mesh.position.z = Math.sin(angle) * p.orbitRadius
    p.mesh.position.y = Math.sin(angle * 0.5) * 1.5 // slight vertical wave
    p.mesh.rotation.y = t * 0.3 // planet self-rotation

    // Project to screen for labels
    const pos = p.mesh.position.clone().project(camera!)
    const canvas = renderer!.domElement
    const x = (pos.x * 0.5 + 0.5) * canvas.clientWidth
    const y = (-pos.y * 0.5 + 0.5) * canvas.clientHeight
    screenPositions.push({
      id: p.task.id, x, y,
      title: (p.task.title || '').slice(0, 8),
      task: p.task,
    })
  }
  planetScreenPositions.value = screenPositions

  renderer.render(scene, camera)
}

function onResize() {
  if (!renderer || !camera || !canvasRef.value) return
  const w = canvasRef.value.parentElement?.clientWidth || 800
  const h = canvasRef.value.parentElement?.clientHeight || 600
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

// Drag
function startDrag(e: DragEvent, task: Task) {
  dragTask = task
  e.dataTransfer?.setData('application/json', JSON.stringify(task))
  e.dataTransfer && (e.dataTransfer.effectAllowed = 'move')
}

function onPortalDrop(task: Task) { emit('toggleTodo', task) }

// Popup
const popupTask = ref<Task | null>(null)
const popupX = ref(0)
const popupY = ref(0)
function showDetail(task: Task, e: MouseEvent) {
  popupTask.value = task; popupX.value = e.clientX + 20; popupY.value = e.clientY
}

function navDetail(task: Task) { popupTask.value = null; router.push(`/tasks/${task.id}`) }
function navConfig(task: Task) { popupTask.value = null; emit('config', task) }
function navTodo(task: Task) { popupTask.value = null; emit('toggleTodo', task) }
function navStatus(task: Task, status: string) { popupTask.value = null; emit('statusChange', task, status) }

onMounted(() => {
  nextTick(() => {
    buildScene()
    animate()
    window.addEventListener('resize', onResize)
  })
})

onUnmounted(() => {
  dispose()
  window.removeEventListener('resize', onResize)
})

watch(() => props.tasks, () => {
  nextTick(() => { buildScene(); animate() })
}, { deep: true })
</script>

<style lang="scss" scoped>
.planetary-view {
  position: relative; width: 100%; height: calc(100vh - 200px); min-height: 550px;
}
.planet-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%;
}
.planet-overlay {
  position: absolute; inset: 0; pointer-events: none; z-index: 2;
}
.planet-label-3d {
  position: absolute; transform: translate(-50%, -50%);
  pointer-events: auto; cursor: pointer;
  padding: 2px 6px; border-radius: 4px;
  background: rgba(10,16,31,0.5); border: 1px solid rgba(0,229,255,0.15);
  backdrop-filter: blur(4px);
  transition: all 0.2s;
  &:hover {
    background: rgba(0,229,255,0.12); border-color: rgba(0,229,255,0.3);
    .label-text { color: #00E5FF; text-shadow: 0 0 6px rgba(0,229,255,0.5); }
  }
}
.label-text {
  font-size: 9px; color: rgba(232,240,255,0.7); white-space: nowrap;
  max-width: 60px; overflow: hidden; text-overflow: ellipsis; display: block;
}
.portal-area { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); z-index: 20; }
</style>
