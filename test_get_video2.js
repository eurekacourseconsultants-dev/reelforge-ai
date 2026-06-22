const puppeteer = require('puppeteer')
const fs = require('fs')
const https = require('https')
const http = require('http')

const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)
const AVATAR_URL = 'https://pub-4e75db68cc454834a78ae17c48a9f27f.r2.dev/avatars/1a2dc092-6236-4690-af89-3b790cfa47f1.jpg'
const TEST_PROMPT = 'A person walking through a vibrant Singapore street market at golden hour, warm lighting, cinematic'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
    }).on('error', err => { fs.unlink(destPath, () => {}); reject(err) })
  })
}

async function login(page, account) {
  console.log(`Logging in as ${account.email}...`)
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)
  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 })
  await page.click('div.user-profile.need-login')
  await sleep(2000)
  await page.waitForSelector('span.caption', { timeout: 10000 })
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.caption'))
    const el = spans.find(s => s.textContent.trim().toLowerCase().includes('email'))
    if (el) el.click()
  })
  await sleep(2000)
  await page.waitForSelector('input.kling-input__inner[type="email"]', { timeout: 10000 })
  await page.type('input.kling-input__inner[type="email"]', account.email, { delay: 50 })
  await sleep(300)
  await page.type('input.kling-input__inner[type="password"]', account.password, { delay: 50 })
  await sleep(300)
  await page.click('button.login-btn.critical')
  await sleep(5000)
  console.log('Logged in!')
}

;(async () => {
  const browser = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 }
  })
  const page = await browser.newPage()

  // Intercept network requests BEFORE anything else
  const caughtVideoUrls = []
  page.on('response', async response => {
    const url = response.url()
    if (url.includes('.mp4') || url.includes('video/mp4')) {
      caughtVideoUrls.push(url)
      console.log('>>> CAUGHT VIDEO URL:', url)
    }
  })

  await login(page, KLING_ACCOUNTS[2]) // Account 3 — launchsteady@gmail.com

  await page.goto('https://kling.ai/app/video/image-to-video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000)

  const tempPath = '/tmp/test_avatar.jpg'
  if (!fs.existsSync(tempPath)) {
    await downloadFile(AVATAR_URL, tempPath)
  }

  await page.waitForSelector('div.clickable.click-here.global', { timeout: 10000 })
  await page.click('div.clickable.click-here.global')
  await sleep(1500)

  const fileInput = await page.$('input[type="file"]')
  if (fileInput) {
    await fileInput.uploadFile(tempPath)
    await sleep(4000)
    console.log('Avatar uploaded')
  } else {
    console.warn('No file input found!')
  }

  await page.waitForSelector('div.tiptap.ProseMirror', { timeout: 10000 })
  await page.click('div.tiptap.ProseMirror')
  await sleep(500)
  await page.keyboard.type(TEST_PROMPT, { delay: 20 })
  await sleep(1000)

  await page.waitForSelector('button.generic-button.critical.medium.button-pay', { timeout: 10000 })
  await page.click('button.generic-button.critical.medium.button-pay')
  console.log('Generate clicked — watching network for video URL. Close browser with Ctrl+C when done.')

  // Keep alive forever — you close it
  await new Promise(() => {})
})()
