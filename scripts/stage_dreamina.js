const puppeteer = require('puppeteer')
const DREAMINA_PASSWORD = process.env.DREAMINA_PASSWORD || 'gunpowder123'
const ACCOUNTS = [
  'peterjmoss@gmail.com',
  'ashleyangeliquemoss@gmail.com',
  'launchsteady@gmail.com',
  'zippappbackup@gmail.com',
  'eurekacourseconsultants@gmail.com',
  'sparkshiftacademy@gmail.com',
  'zippsuperapp@gmail.com',
  'unowebscrapper@gmail.com',
  'zippscraper@gmail.com'
]
const { S3Client: S3ClientAccounts, GetObjectCommand, PutObjectCommand: PutObjectCommandAccounts } = require('@aws-sdk/client-s3')
const r2Accounts = new S3ClientAccounts({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
})
async function getAvailableAccount() {
  const today = new Date().toISOString().slice(0, 10)
  let usage = { date: today, accounts: {} }
  try {
    const res = await r2Accounts.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: 'account-usage/dreamina.json' }))
    const text = await res.Body.transformToString()
    const parsed = JSON.parse(text)
    if (parsed.date === today) usage = parsed
  } catch (e) { /* first run or new day */ }
  const account = ACCOUNTS.find(a => !usage.accounts[a])
  if (!account) { console.error('All Dreamina accounts exhausted for today'); process.exit(1) }
  return { account, usage, today }
}
async function markAccountUsed(account, usage, today) {
  usage.date = today
  usage.accounts[account] = true
  await r2Accounts.send(new PutObjectCommandAccounts({
    Bucket: process.env.R2_BUCKET,
    Key: 'account-usage/dreamina.json',
    Body: JSON.stringify(usage),
    ContentType: 'application/json'
  }))
  console.log('Account marked as used:', account)
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const { account: DREAMINA_EMAIL, usage, today } = await getAvailableAccount()
  console.log('Using account:', DREAMINA_EMAIL)

  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: null })
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

  await page.evaluate(() => {
    const btn = document.querySelector('button.close-icon-wrapper-TApiiy')
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await sleep(1500)

  // Navigate directly to AI Avatar page
  await page.goto('https://dreamina.capcut.com/ai-tool/generate?type=digitalHuman&workspace=0', { waitUntil: 'networkidle2', timeout: 60000 })
  console.log('On AI Avatar page')
  await sleep(3000)

  // Upload actor image
  const ACTOR_IMAGE = process.env.ACTOR_IMAGE
  const SCRIPT_TEXT = process.env.SCRIPT_TEXT
  const VOICE_NAME  = process.env.VOICE_NAME
  const VOICE_TONE  = process.env.VOICE_TONE

  const [fileInput] = await page.$$(  'input.file-input-JBLArm')
  await fileInput.uploadFile(ACTOR_IMAGE)
  console.log('Actor image uploaded')
  await sleep(3000)

  // Click the voice upload div to open voice selector menu
  await page.evaluate(() => {
    const voiceDiv = document.querySelector('div.reference-upload-hwAs1s')
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

  // Fill script textarea (ProseMirror)
  const scriptEl = await page.$('p[data-paragraph-placeholder="Enter what the avatar should say"]')
  await scriptEl.click()
  await page.keyboard.type(SCRIPT_TEXT, { delay: 20 })
  console.log('Script entered')
  await sleep(1000)

  // Fill action textarea
  const ACTION_TEXT = process.env.ACTION_TEXT || 'Keep right hand completely out of frame at all times. Left hand gently pushes hair behind ear once midway through.'
  const actionEl = await page.$('p[data-paragraph-placeholder="(Optional) Describe how the avatar should move or act"]')
  if (actionEl) {
    await actionEl.click()
    await page.keyboard.type(ACTION_TEXT, { delay: 20 })
    console.log('Action entered')
    await sleep(1000)
  }

  // Set aspect ratio
  const ASPECT_RATIO = process.env.ASPECT_RATIO || '9:16'
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button.toolbar-button-oJZmTI'))
      .find(b => b.textContent.includes('Auto'))
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    else console.error('Auto button not found')
  })
  await sleep(1000)
  await page.evaluate((ratio) => {
    const opt = Array.from(document.querySelectorAll('div.radio-content-AC8g35'))
      .find(d => d.querySelector('span.label-OsQhtD').textContent.trim() === ratio)
    if (opt) opt.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    else console.error('Aspect ratio not found:', ratio)
  }, ASPECT_RATIO)
  await sleep(500)
  await page.mouse.click(100, 100)
  console.log('Aspect ratio set to', ASPECT_RATIO)
  await sleep(1000)

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
  await markAccountUsed(DREAMINA_EMAIL, usage, today)

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
    await browser.close()
    process.exit(0)
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
