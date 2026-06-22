// Stage 2B (PixVerse) - Login to PixVerse, generate 6 clips via I2V, upload to R2
const puppeteer = require('puppeteer')
const fs = require('fs')
const https = require('https')
const http = require('http')
const path = require('path')

const JOB_ID        = process.env.JOB_ID
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
const ACCOUNTS      = JSON.parse(process.env.KLING_ACCOUNTS)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function patchSupabase(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(data),
  })
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    const proto = url.startsWith('https') ? https : http
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
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

async function uploadToR2(key, filePath, contentType = 'video/mp4') {
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
    ContentType: contentType,
  }))
  return `${R2_PUBLIC_URL}/${key}`
}

async function login(page, account) {
  console.log(`Logging in as ${account.email}...`)
  await page.goto('https://app.pixverse.ai', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Dismiss modal if present
  try {
    await page.waitForSelector('button.rounded-full.absolute.right-6.top-6', { timeout: 5000 })
    await page.click('button.rounded-full.absolute.right-6.top-6')
    await sleep(1000)
  } catch { /* no modal */ }

  // Click Login
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'))
    const el = divs.find(d => d.textContent.trim() === 'Login' && d.className.includes('flex'))
    if (el) el.click()
  })
  await sleep(2000)

  // Fill credentials
  await page.waitForSelector('input[placeholder="Email or Username"]', { timeout: 10000 })
  await page.type('input[placeholder="Email or Username"]', account.email, { delay: 50 })
  await sleep(300)
  await page.type('input[placeholder="Password"]', account.password, { delay: 50 })
  await sleep(300)

  // Submit
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => b.textContent.trim() === 'Login')
    if (btn) btn.click()
  })
  await sleep(5000)
  console.log(`Logged in as ${account.email}`)
}

async function generateAvatar(page, prompt) {
  console.log('Generating avatar image...')
  await page.goto('https://app.pixverse.ai/creation/video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Click Image tab
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === 'Image')
    if (el) el.click()
  })
  await sleep(2000)

  // Type prompt
  await page.waitForSelector('textarea[placeholder*="Describe the image you want to create"]', { timeout: 10000 })
  await page.click('textarea[placeholder*="Describe the image you want to create"]')
  await page.type('textarea[placeholder*="Describe the image you want to create"]', prompt, { delay: 20 })
  await sleep(1000)

  // Set up network interception
  const caughtUrls = []
  const onResponse = response => {
    const url = response.url()
    if ((url.includes('.jpg') || url.includes('.png') || url.includes('.webp')) && 
        (url.includes('pixverse') || url.includes('cdn') || url.includes('storage'))) {
      if (!caughtUrls.includes(url)) {
        caughtUrls.push(url)
        console.log(`>>> CAUGHT IMAGE URL: ${url}`)
      }
    }
  }
  page.on('response', onResponse)

  // Click Create
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === 'Create')
    if (el) el.closest('button, div[class*="button"], div[class*="btn"]')?.click() || el.parentElement?.click()
  })
  console.log('Image generation submitted, waiting...')

  // Wait for image URL
  const maxWait = 120000
  const startTime = Date.now()
  while (caughtUrls.length === 0 && Date.now() - startTime < maxWait) {
    await sleep(5000)
    console.log(`Waiting for avatar image... (${Math.round((Date.now() - startTime) / 1000)}s)`)
  }

  page.off('response', onResponse)

  if (caughtUrls.length === 0) throw new Error('Avatar image generation timed out')
  console.log(`Avatar image ready: ${caughtUrls[0]}`)
  return caughtUrls[0]
}

async function generateClip(page, scenePrompt, avatarPhotoUrl, clipIndex) {
  console.log(`Generating clip ${clipIndex + 1}/6...`)

  await page.goto('https://app.pixverse.ai/creation/video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Click Video tab (should be default)
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === 'Video')
    if (el) el.click()
  })
  await sleep(2000)

  // Upload avatar image
  if (avatarPhotoUrl) {
    const tempImagePath = `/tmp/avatar_${JOB_ID}.jpg`
    if (!fs.existsSync(tempImagePath)) {
      console.log('Downloading avatar photo...')
      await downloadFile(avatarPhotoUrl, tempImagePath)
    }

    // Upload file directly via hidden file input
    await page.waitForSelector('input[type="file"]', { timeout: 10000 })
    const fileInput = await page.$('input[type="file"]')
    if (fileInput) {
      await fileInput.uploadFile(tempImagePath)
      await sleep(3000)
      console.log('Avatar uploaded')
    } else {
      console.warn('File input not found')
    }
  }

  // Type prompt
  await page.waitForSelector('textarea[placeholder="Describe the content you want to create"]', { timeout: 10000 })
  await page.click('textarea[placeholder="Describe the content you want to create"]')
  await page.type('textarea[placeholder="Describe the content you want to create"]', scenePrompt, { delay: 20 })
  await sleep(1000)

  // Set up network interception BEFORE clicking Create
  const caughtUrls = []
  const onResponse = response => {
    const url = response.url()
    if (url.includes('.mp4') && (url.includes('pixverse') || url.includes('cdn') || url.includes('storage'))) {
      if (!caughtUrls.includes(url)) {
        caughtUrls.push(url)
        console.log(`>>> CAUGHT VIDEO URL: ${url}`)
      }
    }
  }
  page.on('response', onResponse)

  // Click Create
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === 'Create')
    if (el) el.parentElement?.click()
  })
  console.log(`Clip ${clipIndex + 1} submitted, waiting for render...`)

  // Wait for video URL via network interception
  const maxWait = 300000
  const startTime = Date.now()
  while (caughtUrls.length === 0 && Date.now() - startTime < maxWait) {
    console.log(`Clip ${clipIndex + 1}: rendering... (${Math.round((Date.now() - startTime) / 1000)}s)`)
    await sleep(10000)
  }

  page.off('response', onResponse)

  if (caughtUrls.length === 0) throw new Error(`Clip ${clipIndex + 1} timed out`)
  const videoUrl = caughtUrls[0]
  console.log(`Clip ${clipIndex + 1} ready: ${videoUrl}`)
  return videoUrl
}

async function run() {
  const pipelineData = JSON.parse(fs.readFileSync('pipeline_data.json', 'utf8'))
  const scenes = pipelineData.locked_scenes || pipelineData.scenes
  let avatarPhotoUrl = pipelineData.avatar_photo_url || ''

  fs.mkdirSync('clips', { recursive: true })

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: null,
  })

  const clipUrls = []
  let currentAccountIndex = -1
  let page = null

  try {
    // If no avatar, generate one using account 0
    if (!avatarPhotoUrl && pipelineData.avatar_prompt) {
      page = await browser.newPage()
      await login(page, ACCOUNTS[0])
      avatarPhotoUrl = await generateAvatar(page, pipelineData.avatar_prompt)
      // Download and upload to R2
      const avatarLocalPath = `/tmp/avatar_generated_${JOB_ID}.jpg`
      await downloadFile(avatarPhotoUrl, avatarLocalPath)
      avatarPhotoUrl = await uploadToR2(`avatars/${JOB_ID}_avatar.jpg`, avatarLocalPath, 'image/jpeg')
      pipelineData.avatar_photo_url = avatarPhotoUrl
      fs.writeFileSync('pipeline_data.json', JSON.stringify(pipelineData, null, 2))
      console.log(`Avatar saved to R2: ${avatarPhotoUrl}`)
      await page.close()
      currentAccountIndex = 0 // account 0 used for avatar, start clips from account 1
    }

    for (let i = 0; i < scenes.length; i++) {
      // 1 clip per account (90 credits, 50 per clip)
      const accountOffset = avatarPhotoUrl && !pipelineData.avatar_prompt ? 0 : 1
      const neededAccountIndex = accountOffset + Math.floor(i / 1)
      const accountIndex = parseInt(process.env.KLING_ACCOUNT_OFFSET || '0') + neededAccountIndex

      if (accountIndex !== currentAccountIndex) {
        if (page) await page.close()
        page = await browser.newPage()
        page.setDefaultTimeout(60000)
        currentAccountIndex = accountIndex
        await login(page, ACCOUNTS[currentAccountIndex])
      }

      const scene = typeof scenes[i] === 'string' ? scenes[i] : scenes[i].prompt
      const videoUrl = await generateClip(page, scene, avatarPhotoUrl, i)

      // Download clip
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

  await patchSupabase({
    status: 'clips_ready',
    clip_urls: JSON.stringify(clipUrls),
  })

  pipelineData.clip_urls = clipUrls
  fs.writeFileSync('pipeline_data.json', JSON.stringify(pipelineData, null, 2))

  console.log(`All 6 clips ready: ${JSON.stringify(clipUrls)}`)
  console.log('Stage 2B (PixVerse) complete.')
}

run().catch(e => { console.error(e); process.exit(1) })
