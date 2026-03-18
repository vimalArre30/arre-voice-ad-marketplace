const fs   = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const dest = path.join(__dirname, '..', 'public', 'ffmpeg')
fs.mkdirSync(dest, { recursive: true })

// Copy core files
const src = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`Copied ${file} → public/ffmpeg/${file}`)
}

// Bundle the ffmpeg worker into a self-contained ESM file
const workerSrc  = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'ffmpeg', 'dist', 'esm', 'worker.js')
const workerDest = path.join(dest, 'worker.js')
execSync(
  `npx esbuild "${workerSrc}" --bundle --format=esm --platform=browser --outfile="${workerDest}"`,
  { stdio: 'inherit' }
)
console.log('Bundled worker.js → public/ffmpeg/worker.js')
