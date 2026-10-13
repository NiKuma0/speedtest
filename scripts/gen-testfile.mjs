// Generates the default download test file: random (incompressible) bytes.
// Not committed to git; created before dev/build and copied by Vite from public/.
import { randomBytes } from 'node:crypto'
import { existsSync, statSync, writeFileSync } from 'node:fs'

const SIZE = 25 * 1024 * 1024
const path = new URL('../public/testfile.bin', import.meta.url)

if (!existsSync(path) || statSync(path).size !== SIZE) {
  writeFileSync(path, randomBytes(SIZE))
  console.log(`Generated public/testfile.bin (${SIZE / 1024 / 1024} MB)`)
}
