const puppeteer = require('puppeteer')

const ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    args: ['--no-sandbox', '--window-size=1440,900'],
    defaultViewport: null
  })
  const page = await browser.newPage()
  
  await page.goto('https://app.pixverse.ai', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Dismiss modal if present
  try {
    await page.waitForSelector('button.rounded-full.absolute.right-6.top-6', { timeout: 5000 })
    await page.click('button.rounded-full.absolute.right-6.top-6')
    console.log('Modal dismissed')
    await sleep(1000)
  } catch {
    console.log('No modal found')
  }

  // Click Login button
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'))
    const login = divs.find(d => d.textContent.trim() === 'Login' && d.className.includes('flex'))
    if (login) login.click()
  })
  await sleep(2000)

  // Fill email
  await page.waitForSelector('input[placeholder="Email or Username"]', { timeout: 10000 })
  await page.type('input[placeholder="Email or Username"]', ACCOUNTS[0].email, { delay: 50 })
  await sleep(300)

  // Fill password
  await page.type('input[placeholder="Password"]', ACCOUNTS[0].password, { delay: 50 })
  await sleep(300)

  // Submit
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const btn = btns.find(b => b.textContent.trim() === 'Login')
    if (btn) btn.click()
  })
  await sleep(5000)
  console.log('Logged in:', page.url())

  // Navigate to I2V
  await page.goto('https://app.pixverse.ai/creation/video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Scroll down to reveal I2V options
  await page.evaluate(() => window.scrollBy(0, 500))
  await sleep(1000)

  console.log('On I2V page - Ctrl+C when done inspecting')
  await new Promise(() => {})
})()
