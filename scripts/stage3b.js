// Stage 3B - Download clips from R2 and stitch with FFmpeg
const { execSync } = require('child_process')
const fs = require('fs')

const JOB_ID = process.env.JOB_ID
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

async function patchSupabase(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

async function run() {
  fs.mkdirSync('clips', { recursive: true })

  console.log('Downloading clips from R2...')
  for (let i = 0; i < 6; i++) {
    const url = `${R2_PUBLIC_URL}/clips/${JOB_ID}/clip_${i}.mp4`
    execSync(`curl -L -o clips/clip_${i}.mp4 "${url}"`, { stdio: 'inherit' })
  }

  console.log('Creating concat list...')
  const concatList = Array.from({ length: 6 }, (_, i) => `file 'clips/clip_${i}.mp4'`).join('\n')
  fs.writeFileSync('concat.txt', concatList)

  console.log('Stitching clips...')
  execSync(
    'ffmpeg -f concat -safe 0 -i concat.txt -c:v libx264 -preset fast -pix_fmt yuv420p -movflags +faststart stitched.mp4 -y',
    { stdio: 'inherit' }
  )

  console.log('Uploading stitched video to R2...')
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })

  const fileBuffer = fs.readFileSync('stitched.mp4')
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: `raw/${JOB_ID}.mp4`, Body: fileBuffer }))

  await patchSupabase({ status: 'video_ready', raw_video_url: `${R2_PUBLIC_URL}/raw/${JOB_ID}.mp4` })
  console.log('Stage 3B complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
