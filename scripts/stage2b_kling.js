// Stage 2B (Kling) - Login to Kling, generate 6 clips via I2V, upload to R2
const puppeteer = require('puppeteer')
const fs = require('fs')
const https = require('https')
const http = require('http')
const path = require('path')

const JOB_ID        = process.env.JOB_ID
const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_KEY
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)

async function patchSupabase(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const proto = url.startsWith('https') ? https : http
    proto.get(url, res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
      }
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
    }).on('error', err => {
      fs.unlink(destPath, () => {})
      reject(err)
    })
  })
}

async function uploadToR2(key, filePath) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  })
  const buffer = fs.readFileSync(filePath)
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'video/mp4',
  }))
  return `${R2_PUBLIC_URL}/${key}`
}

async function login(page, account) {
  console.log(`Logging in as ${account.email}...`)
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Click Sign In
  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 })
  await page.click('div.user-profile.need-login')
  await sleep(2000)

  // Click "Sign in with email"
  await page.waitForSelector('span.caption', { timeout: 10000 })
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.caption'))
    const el = spans.find(s => s.textContent.trim().toLowerCase().includes('email'))
    if (el) el.click()
  })
  await sleep(2000)

  // Fill email and password
  await page.waitForSelector('input.kling-input__inner[type="email"]', { timeout: 10000 })
  await page.type('input.kling-input__inner[type="email"]', account.email, { delay: 50 })
  await sleep(300)
  await page.type('input.kling-input__inner[type="password"]', account.password, { delay: 50 })
  await sleep(300)

  // Submit
  await page.click('button.login-btn.critical')
  await sleep(5000)
  console.log(`Logged in as ${account.email}`)
}

async function generateClip(page, scenePrompt, avatarPhotoUrl, clipIndex) {
  console.log(`Generating clip ${clipIndex + 1}/6...`)

  // Navigate to I2V page
  await page.goto('https://kling.ai/app/video/image-to-video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000)

  // Upload avatar image
  if (avatarPhotoUrl) {
    const tempImagePath = `/tmp/avatar_${JOB_ID}.jpg`
    if (!fs.existsSync(tempImagePath)) {
      console.log('Downloading avatar photo...')
      await downloadFile(avatarPhotoUrl, tempImagePath)
    }

    // Click upload area to trigger file input
    await page.waitForSelector('div.clickable.click-here.global', { timeout: 10000 })
    await page.click('div.clickable.click-here.global')
    await sleep(1000)

    // Upload file via file input
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      await fileInput.uploadFile(tempImagePath)
      await sleep(3000)
      console.log('Avatar uploaded')
    } else {
      console.warn('File input not found after clicking upload area')
    }
  }

  // Type prompt into contenteditable div
  await page.waitForSelector('div.tiptap.ProseMirror', { timeout: 10000 })
  await page.click('div.tiptap.ProseMirror')
  await sleep(500)
  await page.keyboard.type(scenePrompt, { delay: 20 })
  await sleep(1000)

  // Set up network interception BEFORE clicking Generate
  const caughtUrls = []
  const onResponse = response => {
    const url = response.url()
    if (url.includes('.mp4') && url.includes('kling')) {
      if (!caughtUrls.includes(url)) {
        caughtUrls.push(url)
        console.log(`>>> CAUGHT VIDEO URL: ${url}`)
      }
    }
  }
  page.on('response', onResponse)

  // Click Generate
  await page.waitForSelector('button.generic-button.critical.medium.button-pay', { timeout: 10000 })
  await page.click('button.generic-button.critical.medium.button-pay')
  console.log(`Clip ${clipIndex + 1} submitted, waiting for render (up to 5 min)...`)

  // Wait for network interception to catch the video URL
  const maxWait = 300000 // 5 minutes
  const startTime = Date.now()
  while (caughtUrls.length === 0 && Date.now() - startTime < maxWait) {
    console.log(`Clip ${clipIndex + 1}: still rendering... (${Math.round((Date.now() - startTime) / 1000)}s)`)
    await sleep(10000)
  }

  page.off('response', onResponse)

  if (caughtUrls.length === 0) throw new Error(`Clip ${clipIndex + 1} timed out after 5 minutes`)
  const videoUrl = caughtUrls[0]
  console.log(`Clip ${clipIndex + 1} ready: ${videoUrl}`)
  return videoUrl
}

async function run() {
  const pipelineData = JSON.parse(fs.readFileSync('pipeline_data.json', 'utf8'))
  const scenes = pipelineData.locked_scenes || pipelineData.scenes
  const avatarPhotoUrl = pipelineData.avatar_photo_url || ''

  fs.mkdirSync('clips', { recursive: true })

  const clipUrls = []
  let currentAccountIndex = -1
  let page = null

  const browser = await puppeteer.launch({
    headless: false, // set to true once confirmed working
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    for (let i = 0; i < scenes.length; i++) {
      // Switch account every 2 clips (each account has 66 credits = 2 clips at 30 credits each)
      const neededAccountIndex = Math.floor(i / 2)

      if (neededAccountIndex !== currentAccountIndex) {
        if (page) await page.close()
        page = await browser.newPage()
        page.setDefaultTimeout(60000)
        currentAccountIndex = neededAccountIndex
        await login(page, KLING_ACCOUNTS[currentAccountIndex])
      }

      const scene = typeof scenes[i] === 'string' ? scenes[i] : scenes[i].prompt
      const videoUrl = await generateClip(page, scene, avatarPhotoUrl, i)

      // Download clip locally
      const localPath = `clips/clip_${String(i).padStart(2, '0')}.mp4`
      console.log(`Downloading clip ${i + 1}...`)
      await downloadFile(videoUrl, localPath)

      // Upload to R2
      console.log(`Uploading clip ${i + 1} to R2...`)
      const r2Url = await uploadToR2(`clips/${JOB_ID}/clip_${i}.mp4`, localPath)
      clipUrls.push(r2Url)
      console.log(`Clip ${i + 1} uploaded: ${r2Url}`)

      await patchSupabase({ status: `clip_${i + 1}_ready` })
    }

    if (page) await page.close()
  } finally {
    await browser.close()
  }

  // Save all clip URLs and mark clips_ready
  await patchSupabase({
    status: 'clips_ready',
    clip_urls: JSON.stringify(clipUrls),
  })

  pipelineData.clip_urls = clipUrls
  fs.writeFileSync('pipeline_data.json', JSON.stringify(pipelineData, null, 2))

  console.log(`All 6 clips ready: ${JSON.stringify(clipUrls)}`)
  console.log('Stage 2B (Kling) complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
