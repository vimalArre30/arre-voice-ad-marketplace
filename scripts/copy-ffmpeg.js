const fs   = require('fs')
const path = require('path')

const src  = path.join(__dirname, '..', 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const dest = path.join(__dirname, '..', 'public', 'ffmpeg')

fs.mkdirSync(dest, { recursive: true })

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  fs.copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`Copied ${file} → public/ffmpeg/${file}`)
}
