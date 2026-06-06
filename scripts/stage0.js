// Stage 0 - Generate portrait via Kaggle FLUX.1-schnell
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const JOB_ID = process.env.JOB_ID
const PORTRAIT_PREFS = JSON.parse(process.env.PORTRAIT_PREFS || '{}')
const GROQ_API_KEY = process.env.GROQ_API_KEY
const KAGGLE_POOL = JSON.parse(process.env.KAGGLE_POOL)

async function run() {
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{
        role: 'user',
        content: `Generate a photorealistic portrait prompt for FLUX.1 image generation.
Gender: ${PORTRAIT_PREFS.gender || 'neutral'}
Age range: ${PORTRAIT_PREFS.age || '30s'}
Style: ${PORTRAIT_PREFS.style || 'Professional'}

Requirements: front-facing camera, clean neutral background, soft even lighting, upper body visible (head + shoulders + chest), no sunglasses, no accessories, 768x768, ultra-realistic.
Return only the prompt text, nothing else.`
      }],
      max_tokens: 200,
    })
  })
  const groqData = await groqRes.json()
  const portraitPrompt = groqData.choices[0].message.content.trim()
  console.log('Portrait prompt:', portraitPrompt)

  const account = KAGGLE_POOL[0]
  const kaggleDir = path.join(process.env.HOME, '.kaggle')
  fs.mkdirSync(kaggleDir, { recursive: true })
  fs.writeFileSync(path.join(kaggleDir, 'kaggle.json'), JSON.stringify(account), { mode: 0o600 })

  fs.mkdirSync('kaggle-push/portrait', { recursive: true })

  // Inject env vars directly into the script
  const baseScript = fs.readFileSync('kaggle-scripts/portrait_runner.py', 'utf8')
  const injected = `import os
os.environ["JOB_ID"] = ${JSON.stringify(JOB_ID)}
os.environ["PORTRAIT_PROMPT"] = ${JSON.stringify(portraitPrompt)}
os.environ["SUPABASE_URL"] = ${JSON.stringify(process.env.SUPABASE_URL)}
os.environ["SUPABASE_KEY"] = ${JSON.stringify(process.env.SUPABASE_KEY)}
os.environ["R2_ACCOUNT_ID"] = ${JSON.stringify(process.env.R2_ACCOUNT_ID)}
os.environ["R2_ACCESS_KEY_ID"] = ${JSON.stringify(process.env.R2_ACCESS_KEY_ID)}
os.environ["R2_SECRET_ACCESS_KEY"] = ${JSON.stringify(process.env.R2_SECRET_ACCESS_KEY)}
os.environ["R2_BUCKET_NAME"] = ${JSON.stringify(process.env.R2_BUCKET_NAME)}
os.environ["R2_PUBLIC_URL"] = ${JSON.stringify(process.env.R2_PUBLIC_URL)}

${baseScript}`

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

  console.log('Polling Kaggle for portrait completion...')
  const kernelRef = `${account.username}/reelforge-portrait`

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 30000))

    let result = null
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        result = execSync(`kaggle kernels status ${kernelRef}`, { stdio: 'pipe' }).toString()
        break
      } catch (e) {
        const errMsg = e.stderr ? e.stderr.toString() : e.message
        console.log(`Status check attempt ${attempt + 1} failed: ${errMsg.trim()}`)
        if (attempt < 4) await new Promise(r => setTimeout(r, 15000))
      }
    }

    if (!result) {
      console.log('All status attempts failed this poll cycle, continuing...')
      continue
    }

    console.log(`Status: ${result.trim()}`)
    if (result.includes('complete')) { console.log('Portrait done.'); return }
    if (result.includes('error') || result.includes('cancel')) throw new Error('Portrait kernel failed')
  }

  throw new Error('Portrait kernel timed out')
}

run().catch(e => { console.error(e); process.exit(1) })
