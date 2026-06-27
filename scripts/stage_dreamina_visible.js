// stage_dreamina_visible.js
// Headless:false variant of stage_dreamina.js for ONE account, used to manually
// observe the generation + figure out the delete-video click pathway.
// Session stays open at the end — close it yourself when done.

const puppeteer = require('puppeteer')
const DREAMINA_PASSWORD = process.env.DREAMINA_PASSWORD || 'gunpowder123'

// Single account for this test run — set to whichever account you've just
// manually cleared to virgin.
const DREAMINA_EMAIL = process.env.DREAMINA_EMAIL || 'peterjmoss@gmail.com'

const JOB_ID = process.env.JOB_ID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

async function patchSupabase(data) {
  if (!JOB_ID || !SUPABASE_URL || !SUPABASE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/jobs?id=eq.${JOB_ID}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  } catch (e) { console.error('Supabase patch failed:', e.message) }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  console.log('Using account:', DREAMINA_EMAIL)

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 }
  })
  const page = await browser.newPage()

  console.log('Navigating...')
  await page.goto('https://dreamina.capcut.com/ai-tool/home?need_login=true', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('span.lv_new_third_part_sign_in_expand-label'))
      .find(s => s.textContent.trim() === 'Continue with email')
    if (span) span.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await sleep(8000)

  await page.waitForSelector('input[name="username"]', { timeout: 30000 })
  await page.type('input[name="username"]', DREAMINA_EMAIL, { delay: 50 })
  await sleep(300)
  await page.type('input[name="password"]', DREAMINA_PASSWORD, { delay: 50 })
  await sleep(300)
  await page.evaluate(() => {
    document.querySelector('button.lv_new_sign_in_panel_wide-sign-in-button')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  console.log('Logged in. Waiting...')
  await sleep(5000)

  // Dismiss first popup (click anywhere to close)
  await page.mouse.click(100, 100)
  await sleep(1500)

  // Dismiss second modal (X button)
  await page.evaluate(() => {
    const btn = document.querySelector('button.close-icon-wrapper-TApiiy')
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await sleep(1500)

  // Check credit balance (informational only in this test script)
  let creditBalance = null
  try {
    await page.waitForSelector('div.credit-amount-text-kJNIlf', { timeout: 10000 })
    creditBalance = await page.evaluate(() => {
      const el = document.querySelector('div.credit-amount-text-kJNIlf')
      return el ? parseInt(el.textContent.trim(), 10) : null
    })
  } catch (e) { console.error('Credit selector not found:', e.message) }
  console.log('Credit balance for', DREAMINA_EMAIL, ':', creditBalance)

  // Navigate directly to AI Avatar page
  await page.goto('https://dreamina.capcut.com/ai-tool/generate?type=digitalHuman&workspace=0', { waitUntil: 'networkidle2', timeout: 60000 })
  console.log('On AI Avatar page')
  await sleep(3000)

  // Upload actor image
  const ACTOR_IMAGE = process.env.ACTOR_IMAGE
  const SCRIPT_TEXT = process.env.SCRIPT_TEXT
  const VOICE_NAME  = process.env.VOICE_NAME
  const VOICE_TONE  = process.env.VOICE_TONE

  let actorImagePath = ACTOR_IMAGE
  if (/^https?:\/\//.test(ACTOR_IMAGE)) {
    const https = require('https')
    const http = require('http')
    const fs = require('fs')
    actorImagePath = '/tmp/actor_image.jpg'
    await new Promise((resolve, reject) => {
      const client = ACTOR_IMAGE.startsWith('https') ? https : http
      const file = fs.createWriteStream(actorImagePath)
      client.get(ACTOR_IMAGE, res => { res.pipe(file); file.on('finish', resolve) }).on('error', reject)
    })
  }
  const [fileInput] = await page.$$('input.file-input-JBLArm')
  try {
    await fileInput.uploadFile(actorImagePath)
    console.log('Actor image uploaded')
  } catch (e) {
    console.error('Upload failed:', e.message)
  }

  // Click the voice upload div to open voice selector menu
  await page.evaluate(() => {
    const voiceDivs = document.querySelectorAll('div.reference-upload-hwAs1s')
    const voiceDiv = voiceDivs[1]
    if (voiceDiv) voiceDiv.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  console.log('Voice selector opened')
  await sleep(2000)

  // Set tone dropdown
  if (VOICE_TONE) {
    await page.evaluate((tone) => {
      const toneDiv = Array.from(document.querySelectorAll('div.lv-select-view'))
        .find(d => d.textContent.includes('Tone'))
      if (toneDiv) toneDiv.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }, VOICE_TONE)
    await sleep(1000)
    await page.evaluate((tone) => {
      const opt = Array.from(document.querySelectorAll('span.select-option-label-text-m5OLL4'))
        .find(s => s.textContent.trim() === tone)
      if (opt) opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    }, VOICE_TONE)
    console.log('Tone set to', VOICE_TONE)
    await sleep(1000)
  }

  // Select voice by name
  await page.evaluate((name) => {
    const cell = Array.from(document.querySelectorAll('div.voice-grid-cell-label-VCeudr'))
      .find(d => d.textContent.trim() === name)
    if (cell) cell.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }, VOICE_NAME)
  console.log('Voice selected:', VOICE_NAME)
  await sleep(1000)

  // Close voice selector modal by pressing Escape
  await page.keyboard.press('Escape')
  await sleep(1000)

  // Fill script textarea (ProseMirror)
  const scriptEl = await page.$('p[data-paragraph-placeholder="Enter what the avatar should say"]')
  if (!scriptEl) throw new Error('Script textarea not found — voice modal may still be open')
  await scriptEl.click()
  await sleep(300)
  await page.keyboard.type(SCRIPT_TEXT, { delay: 20 })
  console.log('Script entered')
  await sleep(1000)

  // Fill action textarea
  const ACTION_TEXT = process.env.ACTION_TEXT || 'Maintain direct eye contact with camera at all times.'
  const actionEl = await page.$('p[data-paragraph-placeholder="(Optional) Describe how the avatar should move or act"]')
  if (actionEl) {
    await actionEl.click()
    await sleep(300)
    await page.keyboard.type(ACTION_TEXT, { delay: 20 })
    console.log('Action entered')
    await sleep(1000)
  }

  // Wait for uploads to settle
  console.log('Waiting for uploads to settle...')
  await sleep(5000)

  // Click generate via real mouse coordinates
  const generateRect = await page.evaluate(() => {
    const btn = document.querySelector('button.submit-button-ugtq0R')
    const r = btn.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(generateRect.x, generateRect.y)
  console.log('Generate clicked at', generateRect)
  await patchSupabase({ status: 'video_ready' })

  // Intercept network for video output URL
  const https = require('https')
  const http = require('http')
  const fs = require('fs')
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

  const r2 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
  })

  let videoUploaded = false

  async function downloadAndUpload(url) {
    if (videoUploaded) return
    videoUploaded = true
    console.log('Downloading video from:', url)
    const tmpPath = '/tmp/dreamina_output.mp4'
    await new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const file = fs.createWriteStream(tmpPath)
      client.get(url, res => { res.pipe(file); file.on('finish', resolve) }).on('error', reject)
    })
    const buffer = fs.readFileSync(tmpPath)
    const actor = (process.env.ACTOR_IMAGE || 'unknown').split('/').pop().replace('.jpg','').replace('.jpeg','')
    const title = (process.env.VIDEO_TITLE || 'video').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    const timestamp = new Date().toISOString().replace(/[-:T]/g,'').slice(0,14)
    const filename = `generated-videos/${actor}_${title}_${timestamp}.mp4`
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: filename,
      Body: buffer,
      ContentType: 'video/mp4'
    }))
    console.log('Uploaded to R2:', filename)
    const finalUrl = `${process.env.R2_PUBLIC_URL}/${filename}`
    await patchSupabase({ status: 'complete', final_url: finalUrl })

    // --- DELETE STEP GOES HERE ---
    // Once Peter gives the click pathway for deleting the just-generated
    // video from the Dreamina library, it gets added right here, before
    // the browser closes. Left as a no-op for now so the session stays
    // open for manual inspection.
    console.log('Video uploaded. Browser staying open for delete-flow mapping.')
    console.log('Waiting here — close the browser yourself when done.')

    // NOTE: process.exit(0) intentionally NOT called yet — we want the
    // session to remain open so Peter can guide the delete click pathway.
  }

  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('v16-cc.capcut.com') && url.includes('tos-alisg-ve-14178-sg') && url.includes('mime_type=video_mp4')) {
      console.log('VIDEO URL CAPTURED:', url)
      await downloadAndUpload(url).catch(e => console.error('Upload error:', e))
    }
  })

  console.log('Browser stays open. Close it yourself when done.')
  await new Promise(() => {})
})()
