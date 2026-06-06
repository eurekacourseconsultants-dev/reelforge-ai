const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID = process.env.JOB_ID
const PORTRAIT_PREFS = process.env.PORTRAIT_PREFS || '{}'
const KAGGLE_POOL = JSON.parse(process.env.KAGGLE_POOL)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

async function pollSupabaseForPortrait() {
  console.log('Polling Supabase for portrait completion...')
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 30000))
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?key=eq.spokesperson_photo_url`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      })
      const data = await res.json()
      if (data[0]?.value) {
        console.log(`Portrait ready: ${data[0].value}`)
        return
      }
      console.log(`Poll ${i + 1}/60: portrait not ready yet...`)
    } catch (e) {
      console.log(`Poll ${i + 1}/60: fetch error, retrying...`)
    }
  }
  throw new Error('Portrait timed out after 30 minutes')
}

async function run() {
  const account = KAGGLE_POOL[0]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  fs.mkdirSync('kaggle-push/portrait', { recursive: true })

  const baseScript = fs.readFileSync('kaggle-scripts/portrait_runner.py', 'utf8')
  const injected = [
    'import os',
    `os.environ["JOB_ID"] = ${JSON.stringify(JOB_ID)}`,
    `os.environ["PORTRAIT_PREFS"] = ${JSON.stringify(PORTRAIT_PREFS)}`,
    `os.environ["SUPABASE_URL"] = ${JSON.stringify(SUPABASE_URL)}`,
    `os.environ["SUPABASE_KEY"] = ${JSON.stringify(SUPABASE_KEY)}`,
    `os.environ["R2_ACCOUNT_ID"] = ${JSON.stringify(process.env.R2_ACCOUNT_ID)}`,
    `os.environ["R2_ACCESS_KEY_ID"] = ${JSON.stringify(process.env.R2_ACCESS_KEY_ID)}`,
    `os.environ["R2_SECRET_ACCESS_KEY"] = ${JSON.stringify(process.env.R2_SECRET_ACCESS_KEY)}`,
    `os.environ["R2_BUCKET_NAME"] = ${JSON.stringify(process.env.R2_BUCKET_NAME)}`,
    `os.environ["R2_PUBLIC_URL"] = ${JSON.stringify(process.env.R2_PUBLIC_URL)}`,
    '',
    baseScript
  ].join('\n')

  fs.writeFileSync('kaggle-push/portrait/portrait_runner.py', injected)
  fs.writeFileSync('kaggle-push/portrait/kernel-metadata.json', JSON.stringify({
    id: `${account.username}/reelforge-portrait`,
    title: 'reelforge-portrait',
    code_file: 'portrait_runner.py',
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

  console.log('Pushing portrait kernel to Kaggle...')
  execSync('kaggle kernels push -p kaggle-push/portrait', { stdio: 'inherit' })
  console.log('Kernel pushed. Waiting for portrait via Supabase...')

  await pollSupabaseForPortrait()
  console.log('Stage 0 complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
