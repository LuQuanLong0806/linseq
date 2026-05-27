const palette = [
  '#00E5FF', '#9D5CFF', '#FF7D00', '#E8F0FF',
  '#00FF9D', '#FF3E6C', '#FFD600', '#4ECDC4',
  '#FF6B6B', '#C44DFF', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
]

const projectColorMap = new Map<string, string>()
let colorIdx = 0

export function getProjectColor(project: string | undefined | null): string {
  if (!project) return palette[0]
  if (projectColorMap.has(project)) return projectColorMap.get(project)!
  const color = palette[colorIdx % palette.length]
  colorIdx++
  projectColorMap.set(project, color)
  return color
}
