// scripts/generate_actor_headless.js
// Generic PixVerse actor generation script — takes prompt + filename via env vars
// (ACTOR_PROMPT, ACTOR_FILENAME) instead of being hardcoded per persona.
// Built from the confirmed-working headless pattern (test_pixverse_avatar_male_cafe_headless.js):
// login -> Image tab -> type prompt -> set 9:16 portrait -> Create -> capture t2i URL -> convert WebP->JPEG -> save -> upload to R2.

const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET      = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL  = process.env.R2_PUBLIC_URL

const PROMPT   = process.env.ACTOR_PROMPT
const FILENAME = process.env.ACTOR_FILENAME

if (!PROMPT || !FILENAME) {
  console.error('ACTOR_PROMPT and ACTOR_FILENAME env vars are required')
  process.exit(1)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function uploadToR2(key, filePath, contentType = 'image/jpeg') {
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

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  })
  const page = await browser.newPage()

  // Login
  console.log(`Logging in as ${ACCOUNTS[0].email}...`)
  await page.goto('https://app.pixverse.ai', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  try {
    await page.waitForSelector('button.rounded-full.absolute.right-6.top-6', { timeout: 5000 })
    await page.click('button.rounded-full.absolute.right-6.top-6')
    await sleep(1000)
  } catch { /* no modal */ }

  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'))
    const el = divs.find(d => d.textContent.trim() === 'Login' && d.className.includes('flex'))
    if (el) el.click()
  })
  await sleep(2000)

  await page.waitForSelector('input[placeholder="Email or Username"]', { timeout: 10000 })
  await page.type('input[placeholder="Email or Username"]', ACCOUNTS[0].email, { delay: 50 })
  await sleep(300)
  await page.type('input[placeholder="Password"]', ACCOUNTS[0].password, { delay: 50 })
  await sleep(300)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => b.textContent.trim() === 'Login')
    if (btn) btn.click()
  })
  await sleep(5000)
  console.log('Logged in')

  // Navigate to creation page
  await page.goto('https://app.pixverse.ai/creation/image', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Click Image tab
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div'))
    const el = all.find(d => d.className.includes('group/categoryItem') && d.textContent.includes('Image'))
    if (el) el.click()
    else console.log('Image tab not found')
  })
  await sleep(2000)
  console.log('Image tab clicked')

  // Type prompt (from env var, not hardcoded)
  await page.waitForSelector('textarea[placeholder*="Describe the image you want to create"]', { timeout: 10000 })
  await page.click('textarea[placeholder*="Describe the image you want to create"]')
  await page.type('textarea[placeholder*="Describe the image you want to create"]', PROMPT, { delay: 20 })
  await sleep(1000)
  console.log('Prompt typed')

  // Open aspect ratio picker, switch to 9:16 portrait
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === '16:9')
    if (el) el.click()
    else console.log('16:9 control not found')
  })
  await sleep(1000)

  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'))
    const el = divs.find(d => d.textContent.trim() === '9:16' && d.className.includes('cursor-pointer'))
    if (el) el.click()
    else console.log('9:16 option not found')
  })
  await sleep(500)

  await page.mouse.click(20, 20)
  await sleep(1000)
  console.log('Aspect ratio set to 9:16 portrait')

  // Network interception + auto-download + WebP->JPEG conversion + R2 upload
  const outDir = path.join(process.cwd(), 'avatars')
  fs.mkdirSync(outDir, { recursive: true })

  let done = false
  page.on('response', async response => {
    if (done) return
    const url = response.url()
    // Must match the actual t2i (text-to-image) output path, NOT video/frame
    // thumbnails (ads/previews elsewhere on the page) which share the same domain.
    if (url.includes('media.pixverse.ai') && url.includes('t2i') && !url.includes('icon') && !url.includes('logo')) {
      done = true
      console.log(`>>> CAUGHT IMAGE URL: ${url}`)
      try {
        const rawBuffer = await response.buffer()
        const jpegBuffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer()
        const outPath = path.join(outDir, FILENAME)
        fs.writeFileSync(outPath, jpegBuffer)
        console.log(`>>> CONVERTED WEBP -> JPEG, SAVED TO: ${outPath}`)
        const r2Url = await uploadToR2(`avatars/${FILENAME}`, outPath, 'image/jpeg')
        console.log(`>>> UPLOADED TO R2: ${r2Url}`)
      } catch (err) {
        console.log(`>>> DOWNLOAD/UPLOAD FAILED: ${err.message}`)
        await browser.close()
        process.exit(1)
      }
      await sleep(1500)
      await browser.close()
      process.exit(0)
    }
  })

  // Click Create
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
    const el = spans.find(s => s.textContent.trim() === 'Create')
    if (el) el.parentElement?.click()
  })
  console.log('Create clicked — waiting for image and auto-downloading...')

  await sleep(60000)
  console.log('Timed out waiting for image.')
  await browser.close()
  process.exit(1)
})()
