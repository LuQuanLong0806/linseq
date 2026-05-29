import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const cargoBin = join(homedir(), '.cargo', 'bin')
if (existsSync(cargoBin) && !process.env.PATH.includes(cargoBin)) {
  process.env.PATH = `${cargoBin};${process.env.PATH}`
}

execSync('npx tauri build', { stdio: 'inherit' })
