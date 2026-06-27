// build_zoompan_v5.js
// Pre-implementation POC #3 (v5): same zoompan mechanism as v4, but with
// cubic ease-in-out easing applied to the interpolation between keyframes
// instead of linear — slow start, fast middle, slow end, matching natural
// camera motion instead of a mechanical constant-speed move.
//
// Cubic ease-in-out, given progress p in [0,1]:
//   p < 0.5 : 4*p^3
//   p >= 0.5: 1 - pow(-2*p + 2, 3) / 2
// Expressed as a single ffmpeg expression using if() + pow().

const fs = require('fs')
const { execSync } = require('child_process')

const SOURCE_W = 1280
const SOURCE_H = 800
const OUT_W = 1080
const OUT_H = 1920
const FPS = 25
const DURATION = 26

const MAX_ZOOM = SOURCE_W / 240

function normCenter(cx, cy) {
  return { nx: cx / SOURCE_W, ny: cy / SOURCE_H }
}

const waypoints = [
  [100, 100],
  [600, 200],
  [900, 500],
  [300, 600],
  [640, 400],
]

const keyframes = [{ t: 0.0, zoom: 1.0, nx: 0.5, ny: 0.5 }]

let t = 2.0
for (const [cx, cy] of waypoints) {
  const { nx, ny } = normCenter(cx, cy)
  t += 1.5
  keyframes.push({ t, zoom: MAX_ZOOM, nx, ny })
  t += 1.5
  keyframes.push({ t, zoom: MAX_ZOOM, nx, ny })
}
t += 1.5
keyframes.push({ t, zoom: 1.0, nx: 0.5, ny: 0.5 })

console.log('Total keyframe duration:', t, 'seconds (source is', DURATION, 's)')

for (const k of keyframes) k.frame = Math.round(k.t * FPS)

// Builds the eased progress fraction `p` for a segment, as an ffmpeg
// expression string, given the raw linear progress expression `rawP`.
function easedProgress(rawP) {
  // p<0.5 branch: 4*p^3   |   p>=0.5 branch: 1-pow(-2*p+2,3)/2
  return `if(lt(${rawP},0.5),4*pow(${rawP},3),1-pow(-2*${rawP}+2,3)/2)`
}

function buildExpr(prop) {
  let expr = `${keyframes[keyframes.length - 1][prop]}`
  for (let i = keyframes.length - 2; i >= 0; i--) {
    const a = keyframes[i]
    const b = keyframes[i + 1]
    const durFrames = b.frame - a.frame
    if (durFrames > 0) {
      const rawP = `((on-${a.frame})/${durFrames})`
      const eased = easedProgress(rawP)
      const lerp = `(${a[prop]}+(${b[prop]}-${a[prop]})*(${eased}))`
      expr = `if(between(on,${a.frame},${b.frame}),${lerp},${expr})`
    } else {
      expr = `if(between(on,${a.frame},${b.frame}),${a[prop]},${expr})`
    }
  }
  return expr
}

const zoomExpr = buildExpr('zoom')
const nxExpr = buildExpr('nx')
const nyExpr = buildExpr('ny')

const xExpr = `(${nxExpr})*iw-(iw/zoom/2)`
const yExpr = `(${nyExpr})*ih-(ih/zoom/2)`

const filterChain = `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${OUT_W}x${OUT_H}:fps=${FPS}`

const outputPath = '/tmp/poc_zoompan_output_v5.mp4'
const cmd = `ffmpeg -y -f lavfi -i "testsrc=size=${SOURCE_W}x${SOURCE_H}:rate=${FPS}:duration=${DURATION}" -vf "${filterChain}" -t ${t} ${outputPath}`

console.log()
console.log('Running ffmpeg with eased zoompan filter...')

try {
  execSync(cmd, { stdio: 'inherit' })
  const stats = fs.statSync(outputPath)
  console.log()
  console.log('File size:', stats.size, 'bytes')
  console.log('SUCCESS — output at', outputPath)
} catch (e) {
  console.error('ffmpeg command failed:', e.message)
  process.exit(1)
}
