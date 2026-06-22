const puppeteer = require('puppeteer')
const ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'], defaultViewport: null })
  const page = await browser.newPage()

  await page.goto('https://app.pixverse.ai', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)
  try {
    await page.waitForSelector('button.rounded-full.absolute.right-6.top-6', { timeout: 5000 })
    await page.click('button.rounded-full.absolute.right-6.top-6')
    await sleep(1000)
  } catch { }
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

  await page.goto('https://app.pixverse.ai/creation/video', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  // Click Image tab
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div'))
    const el = divs.find(d => d.textContent.trim() === 'ImageImage' && d.className.includes('w-full flex items-center gap-2'))
    if (el) el.click()
  })
  await sleep(2000)

  // Dump all textareas
  const textareas = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('textarea')).map(t => ({
      placeholder: t.placeholder,
      class: t.className.substring(0, 80)
    }))
  })
  console.log('Textareas found:', JSON.stringify(textareas, null, 2))

  console.log('Ctrl+C when done')
  await new Promise(() => {})
})()
