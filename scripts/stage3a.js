// Stage 3A - Push EchoMimic kernel to Kaggle and poll
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID = process.env.JOB_ID
const KAGGLE_POOL = JSON.parse(process.env.KAGGLE_POOL)

async function getSpokespersonUrl() {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/settings?key=eq.spokesperson_photo_url`, {
    headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` }
  })
  const data = await res.json()
  return data[0]?.value
}

async function run() {
  const account = KAGGLE_POOL[0]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  const spokespersonUrl = await getSpokespersonUrl()
  const audioUrl = fs.readFileSync('audio_url.txt', 'utf8').trim()

  fs.mkdirSync('kaggle-push/echomimic', { recursive: true })
  fs.copyFileSync('kaggle-scripts/echomimic_runner.py', 'kaggle-push/echomimic/echomimic_runner.py')
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
    environment_variables: {
      JOB_ID,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_KEY: process.env.SUPABASE_KEY,
      R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
      R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
      R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
      SPOKESPERSON_PHOTO_URL: spokespersonUrl,
      AUDIO_URL: audioUrl,
    }
  }))

  console.log('Pushing EchoMimic kernel to Kaggle...')
  execSync('kaggle kernels push -p kaggle-push/echomimic', { stdio: 'inherit' })

  console.log('Polling for EchoMimic completion...')
  const kernelRef = `${account.username}/reelforge-echomimic`
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 60000))
    const result = execSync(`kaggle kernels status ${kernelRef}`).toString()
    console.log(`Status: ${result.trim()}`)
    if (result.includes('complete')) { console.log('EchoMimic done.'); return }
    if (result.includes('error') || result.includes('cancel')) throw new Error('EchoMimic kernel failed')
  }
  throw new Error('EchoMimic kernel timed out')
}

run().catch(e => { console.error(e); process.exit(1) })
