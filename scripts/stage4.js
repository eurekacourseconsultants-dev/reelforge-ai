// Stage 4 - Final encode, upload to R2, mark complete
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

async function getJobData() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}&select=raw_video_url,pipeline_mode,prompt`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  })
  const data = await res.json()
  return data[0]
}

async function run() {
  const job = await getJobData()
  console.log('Downloading raw video...')
  execSync(`curl -L -o raw.mp4 "${job.raw_video_url}"`, { stdio: 'inherit' })

  console.log('Final encoding...')
  execSync(
    'ffmpeg -i raw.mp4 -c:v libx264 -profile:v baseline -level 3.0 -preset fast -crf 23 -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart final.mp4 -y',
    { stdio: 'inherit' }
  )

  console.log('Uploading final video to R2...')
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })

  const fileBuffer = fs.readFileSync('final.mp4')
  const r2Key = `videos/${JOB_ID}.mp4`
  await s3.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: r2Key, Body: fileBuffer, ContentType: 'video/mp4' }))

  const finalUrl = `${R2_PUBLIC_URL}/${r2Key}`

  // Insert into videos table
  await fetch(`${SUPABASE_URL}/rest/v1/videos`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: JOB_ID, prompt: job.prompt, pipeline_mode: job.pipeline_mode, final_url: finalUrl, duration_seconds: 30 }),
  })

  await patchSupabase({ status: 'complete', final_url: finalUrl })
  console.log(`Done. Final video: ${finalUrl}`)
}

run().catch(e => { console.error(e); process.exit(1) })
