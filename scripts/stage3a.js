const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID          = process.env.JOB_ID
const AVATAR_PHOTO_URL = process.env.AVATAR_PHOTO_URL
const KAGGLE_POOL     = JSON.parse(process.env.KAGGLE_POOL)
const SUPABASE_URL    = process.env.SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_KEY

async function pollSupabaseForStatus(targetStatus) {
  console.log(`Polling Supabase for status: ${targetStatus}...`)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 120000))
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}&select=status,error`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json()
      const status = data[0]?.status
      console.log(`Poll ${i + 1}/60: status = ${status}`)
      if (status === targetStatus) return
      if (status === 'failed') throw new Error(`Job failed: ${data[0]?.error}`)
    } catch (e) {
      if (e.message.startsWith('Job failed')) throw e
      console.log(`Poll ${i + 1}/60: fetch error, retrying...`)
    }
  }
  throw new Error(`Timed out waiting for ${targetStatus}`)
}

async function run() {
  if (!AVATAR_PHOTO_URL) throw new Error('AVATAR_PHOTO_URL is required for stage3a')

  // Must use index 1 — index 0 is used by Wan2.1 (stage2b)
  const account = KAGGLE_POOL[1]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  const audioUrl = fs.readFileSync('audio_url.txt', 'utf8').trim()

  fs.mkdirSync('kaggle-push/echomimic', { recursive: true })

  const baseScript = fs.readFileSync('kaggle-scripts/echomimic_runner.py', 'utf8')
  const injected = [
    'import os',
    `os.environ["JOB_ID"] = ${JSON.stringify(JOB_ID)}`,
    `os.environ["SUPABASE_URL"] = ${JSON.stringify(SUPABASE_URL)}`,
    `os.environ["SUPABASE_KEY"] = ${JSON.stringify(SUPABASE_KEY)}`,
    `os.environ["R2_ACCOUNT_ID"] = ${JSON.stringify(process.env.R2_ACCOUNT_ID)}`,
    `os.environ["R2_ACCESS_KEY_ID"] = ${JSON.stringify(process.env.R2_ACCESS_KEY_ID)}`,
    `os.environ["R2_SECRET_ACCESS_KEY"] = ${JSON.stringify(process.env.R2_SECRET_ACCESS_KEY)}`,
    `os.environ["R2_BUCKET_NAME"] = ${JSON.stringify(process.env.R2_BUCKET_NAME)}`,
    `os.environ["R2_PUBLIC_URL"] = ${JSON.stringify(process.env.R2_PUBLIC_URL)}`,
    `os.environ["SPOKESPERSON_PHOTO_URL"] = ${JSON.stringify(AVATAR_PHOTO_URL)}`,
    `os.environ["AUDIO_URL"] = ${JSON.stringify(audioUrl)}`,
    '',
    baseScript
  ].join('\n')

  fs.writeFileSync('kaggle-push/echomimic/echomimic_runner.py', injected)
  fs.writeFileSync('kaggle-push/echomimic/kernel-metadata.json', JSON.stringify({
    id: `${account.username}/reelforge-echomimic`,
    title: 'reelforge-echomimic',
    code_file: 'echomimic_runner.py',
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

  console.log('Pushing EchoMimicV3 kernel to Kaggle...')
  execSync('kaggle kernels push -p kaggle-push/echomimic', { stdio: 'inherit' })
  console.log('Kernel pushed. Waiting for lipsync_ready via Supabase...')

  await pollSupabaseForStatus('lipsync_ready')
  console.log('Stage 3A complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
