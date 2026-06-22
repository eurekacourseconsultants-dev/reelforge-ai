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

  await login(page, KLING_ACCOUNTS[1])

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
  }

  await page.waitForSelector('div.tiptap.ProseMirror', { timeout: 10000 })
  await page.click('div.tiptap.ProseMirror')
  await sleep(500)
  await page.keyboard.type(TEST_PROMPT, { delay: 20 })
  await sleep(1000)

  await page.waitForSelector('button.generic-button.critical.medium.button-pay', { timeout: 10000 })
  await page.click('button.generic-button.critical.medium.button-pay')
  console.log('Generate clicked, waiting 90 seconds for render...')
  await sleep(90000)

  // Intercept all network requests to find video URLs
  const videoUrls = await page.evaluate(() => {
    // Check all video elements
    const videos = Array.from(document.querySelectorAll('video'))
    const videoSrcs = videos.map(v => ({
      src: v.src,
      currentSrc: v.currentSrc,
      sources: Array.from(v.querySelectorAll('source')).map(s => s.src)
    }))

    // Check all links ending in mp4
    const links = Array.from(document.querySelectorAll('a')).filter(a => a.href?.includes('.mp4')).map(a => a.href)

    // Check all elements with src containing mp4
    const srcElements = Array.from(document.querySelectorAll('[src*=".mp4"]')).map(el => el.src || el.getAttribute('src'))

    return { videoSrcs, links, srcElements }
  })

  console.log('Video elements:', JSON.stringify(videoUrls, null, 2))

  // Also intercept network traffic for mp4 URLs
  await sleep(5000)
  await browser.close()
})()
