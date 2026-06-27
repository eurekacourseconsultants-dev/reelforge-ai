const puppeteer = require('puppeteer')

const DREAMINA_PASSWORD = process.env.DREAMINA_PASSWORD || 'gunpowder123'
const EMAIL = process.env.CHECK_EMAIL || 'zippsuperapp@gmail.com'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  console.log('Checking credits for:', EMAIL)
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'], defaultViewport: null })
  const page = await browser.newPage()

  await page.goto('https://dreamina.capcut.com/ai-tool/home?need_login=true', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  await page.evaluate(() => {
    const span = Array.from(document.querySelectorAll('span.lv_new_third_part_sign_in_expand-label'))
      .find(s => s.textContent.trim() === 'Continue with email')
    if (span) span.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await sleep(8000)

  await page.waitForSelector('input[name="username"]', { timeout: 30000 })
  await page.type('input[name="username"]', EMAIL, { delay: 50 })
  await sleep(300)
  await page.type('input[name="password"]', DREAMINA_PASSWORD, { delay: 50 })
  await sleep(300)
  await page.evaluate(() => {
    document.querySelector('button.lv_new_sign_in_panel_wide-sign-in-button')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  console.log('Logged in. Waiting 8s...')
  await sleep(8000)

  await page.evaluate(() => {
    const btn = document.querySelector('button.close-icon-wrapper-TApiiy')
    if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await sleep(2000)

  // Dump everything that might be credit-related
  const found = await page.evaluate(() => {
    const results = []

    // Try known selector first
    const known = document.querySelector('div.credit-amount-text-kJNIlf')
    results.push({ selector: 'div.credit-amount-text-kJNIlf', text: known ? known.textContent.trim() : null })

    // Find anything with "credit" in class name
    document.querySelectorAll('[class*="credit"]').forEach(el => {
      results.push({ selector: el.className, tag: el.tagName, text: el.textContent.trim().slice(0, 80) })
    })

    // Find anything with a number that looks like a credit balance (50–200 range)
    document.querySelectorAll('*').forEach(el => {
      if (el.children.length === 0) {
        const t = el.textContent.trim()
        if (/^\d+$/.test(t) && parseInt(t) >= 50 && parseInt(t) <= 200) {
          results.push({ tag: el.tagName, class: el.className.slice(0, 60), text: t })
        }
      }
    })

    return results
  })

  console.log('\n=== CREDIT DOM DUMP ===')
  console.log(JSON.stringify(found, null, 2))
  console.log('\nBrowser stays open — inspect manually, then close.')
})()
