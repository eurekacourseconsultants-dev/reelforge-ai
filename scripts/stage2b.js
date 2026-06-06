// Stage 2B - Push Wan2.1 kernel to Kaggle and poll
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID = process.env.JOB_ID
const KAGGLE_POOL = JSON.parse(process.env.KAGGLE_POOL)

async function run() {
  const account = KAGGLE_POOL[0]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  const pipelineData = JSON.parse(fs.readFileSync('pipeline_data.json', 'utf8'))
  const scenesJson = JSON.stringify(pipelineData.scenes)

  fs.mkdirSync('kaggle-push/wan21', { recursive: true })
  fs.copyFileSync('kaggle-scripts/wan21_runner.py', 'kaggle-push/wan21/wan21_runner.py')
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
    environment_variables: {
      JOB_ID,
      SCENES_JSON: scenesJson,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_KEY: process.env.SUPABASE_KEY,
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    }
  }))

  console.log('Pushing Wan2.1 kernel to Kaggle...')
  execSync('kaggle kernels push -p kaggle-push/wan21', { stdio: 'inherit' })

  console.log('Polling for Wan2.1 completion...')
  const kernelRef = `${account.username}/reelforge-wan21`
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 60000))
    const result = execSync(`kaggle kernels status ${kernelRef}`).toString()
    console.log(`Status: ${result.trim()}`)
    if (result.includes('complete')) { console.log('Wan2.1 done.'); return }
    if (result.includes('error') || result.includes('cancel')) throw new Error('Wan2.1 kernel failed')
  }
  throw new Error('Wan2.1 kernel timed out')
}

run().catch(e => { console.error(e); process.exit(1) })
