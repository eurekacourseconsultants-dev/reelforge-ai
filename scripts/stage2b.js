const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID = process.env.JOB_ID
const KAGGLE_POOL = JSON.parse(process.env.KAGGLE_POOL)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

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
  const scenesJson = JSON.stringify(pipelineData.scenes)

  fs.mkdirSync('kaggle-push/wan21', { recursive: true })

  const baseScript = fs.readFileSync('kaggle-scripts/wan21_runner.py', 'utf8')
  const injected = [
    'import os',
    `os.environ["JOB_ID"] = ${JSON.stringify(JOB_ID)}`,
    `os.environ["SCENES_JSON"] = ${JSON.stringify(scenesJson)}`,
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
  execSync('kaggle kernels push -p kaggle-push/wan21', { stdio: 'inherit' })
  console.log('Kernel pushed. Waiting for clips_ready via Supabase...')

  await pollSupabaseForStatus('clips_ready')
  console.log('Stage 2B complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
