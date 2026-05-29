import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Ensure cargo is in PATH (fixes Git Bash / VS Code terminal not inheriting Windows user PATH)
const cargoBin = join(homedir(), '.cargo', 'bin')
if (existsSync(cargoBin) && !process.env.PATH.includes(cargoBin)) {
  process.env.PATH = `${cargoBin};${process.env.PATH}`
}

execSync('npx tauri dev', { stdio: 'inherit' })
