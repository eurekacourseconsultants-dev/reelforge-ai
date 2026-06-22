const puppeteer = require('puppeteer')
const fs = require('fs')

const ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET_NAME
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL

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
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  })
  const page = await browser.newPage()

  // Login
  console.log(`Logging in as ${ACCOUNTS[0].email}...`)
  await page.goto('https://app.pixverse.ai', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Dismiss modal
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

  // Type prompt
  const prompt = 'A handsome Asian man, 22 years old, youthful face, short neat hair, chest-up portrait, facing directly at camera, sitting at a cozy home office desk in a Singapore HDB flat, warm ambient lighting, simple white walls with a small shelf, laptop visible in background, soft shallow depth of field with blurred background, calm confident smile, casual smart shirt, photorealistic'
  await page.waitForSelector('textarea[placeholder*="Describe the image you want to create"]', { timeout: 10000 })
  await page.click('textarea[placeholder*="Describe the image you want to create"]')
  await page.type('textarea[placeholder*="Describe the image you want to create"]', prompt, { delay: 20 })
  await sleep(1000)
  console.log('Prompt typed')

  console.log('Prompt typed — browser left open. Look for the aspect ratio control now.')
  console.log('Press Ctrl+C in this terminal when done exploring (browser will stay open until then).')
  await new Promise(() => {}) // hang forever, keep browser open, no Create click, no credits spent
})()
