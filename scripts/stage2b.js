const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID           = process.env.JOB_ID
const AVATAR_PHOTO_URL = process.env.AVATAR_PHOTO_URL || ''
const PIPELINE_MODE    = process.env.PIPELINE_MODE || 'scene'
const KAGGLE_POOL      = JSON.parse(process.env.KAGGLE_POOL)
const SUPABASE_URL     = process.env.SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_KEY
const HF_TOKEN         = process.env.HF_TOKEN || ''

async function pollSupabaseForStatus(targetStatus) {
  console.log(`Polling Supabase for status: ${targetStatus}...`)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 60000))
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}&select=status,error`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json()
      const status = data[0]?.status
      console.log(`Poll ${i + 1}/120: status = ${status}`)
      if (status === targetStatus) return
      if (status === 'failed') throw new Error(`Job failed: ${data[0]?.error}`)
    } catch (e) {
      if (e.message.startsWith('Job failed')) throw e
      console.log(`Poll ${i + 1}/120: fetch error, retrying...`)
    }
  }
  throw new Error(`Timed out waiting for ${targetStatus}`)
}

async function run() {
  const account = KAGGLE_POOL[0]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  const pipelineData = JSON.parse(fs.readFileSync('pipeline_data.json', 'utf8'))
  const scenesJson   = JSON.stringify(pipelineData.scenes)

  // avatar_scene and avatar_lipsync both use i2v (portrait as reference frame)
  // scene uses t2v (text-to-video only)
  const wan21Mode = (PIPELINE_MODE === 'avatar_scene' || PIPELINE_MODE === 'avatar_lipsync') ? 'i2v' : 't2v'
  console.log(`Wan2.1 mode: ${wan21Mode} (pipeline: ${PIPELINE_MODE})`)

  fs.mkdirSync('kaggle-push/wan21', { recursive: true })

  const baseScript = fs.readFileSync('kaggle-scripts/wan21_runner.py', 'utf8')
  const injected = [
    'import os',
    `os.environ["JOB_ID"] = ${JSON.stringify(JOB_ID)}`,
    `os.environ["SCENES_JSON"] = ${JSON.stringify(scenesJson)}`,
    `os.environ["WAN21_MODE"] = ${JSON.stringify(wan21Mode)}`,
    `os.environ["AVATAR_PHOTO_URL"] = ${JSON.stringify(AVATAR_PHOTO_URL)}`,
    `os.environ["SUPABASE_URL"] = ${JSON.stringify(SUPABASE_URL)}`,
    `os.environ["SUPABASE_KEY"] = ${JSON.stringify(SUPABASE_KEY)}`,
    `os.environ["R2_ACCOUNT_ID"] = ${JSON.stringify(process.env.R2_ACCOUNT_ID)}`,
    `os.environ["R2_ACCESS_KEY_ID"] = ${JSON.stringify(process.env.R2_ACCESS_KEY_ID)}`,
    `os.environ["R2_SECRET_ACCESS_KEY"] = ${JSON.stringify(process.env.R2_SECRET_ACCESS_KEY)}`,
    `os.environ["R2_BUCKET_NAME"] = ${JSON.stringify(process.env.R2_BUCKET_NAME)}`,
    `os.environ["R2_PUBLIC_URL"] = ${JSON.stringify(process.env.R2_PUBLIC_URL)}`,
    `os.environ["HF_TOKEN"] = ${JSON.stringify(HF_TOKEN)}`,
    '',
    baseScript
  ].join('\n')

  fs.writeFileSync('kaggle-push/wan21/wan21_runner.py', injected)
  fs.writeFileSync('kaggle-push/wan21/kernel-metadata.json', JSON.stringify({
    id: `${account.username}/reelforge-wan21`,
    title: 'reelforge-wan21',
    code_file: 'wan21_runner.py',
    language: 'python',
    kernel_type: 'script',
    is_private: true,
    enable_gpu: true,
    
    enable_internet: true,
    dataset_sources: [],
    competition_sources: [],
    kernel_sources: [],
    model_sources: [],
  }))

  console.log('Pushing Wan2.1 kernel to Kaggle...')
  execSync('kaggle kernels push -p kaggle-push/wan21 --accelerator NvidiaTeslaT4', { stdio: 'inherit' })
  console.log('Kernel pushed. Waiting for clips_ready via Supabase...')

  // Try polling Supabase first
  try {
    await pollSupabaseForStatus('clips_ready')
  } catch (e) {
    if (e.message.startsWith('Job failed')) throw e
    // Timed out — check R2 directly for clip_5 as fallback
    console.log('Supabase poll timed out, checking R2 for clip_5 as fallback...')
    const clip5Url = `${R2_PUBLIC_URL}/clips/${JOB_ID}/clip_5.mp4`
    try {
      const r2res = await fetch(clip5Url, { method: 'HEAD' })
      if (r2res.ok) {
        console.log('clip_5.mp4 found in R2 — treating as clips_ready')
      } else {
        throw new Error('clip_5.mp4 not found in R2 after timeout')
      }
    } catch (r2err) {
      throw new Error(`Timed out and R2 fallback failed: ${r2err.message}`)
    }
  }
  console.log('Stage 2B complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
