// explore_dreamina.js
// Read-only exploration script — logs into Dreamina, then hangs open with
// headless:false so we can manually click through the Photo Avatar -> Lip Sync
// flow and identify selectors, same approach used for PixVerse at project start.
// No generation triggered, no credits spent.

const puppeteer = require('puppeteer')

const DREAMINA_EMAIL    = process.env.DREAMINA_EMAIL
const DREAMINA_PASSWORD = process.env.DREAMINA_PASSWORD

if (!DREAMINA_EMAIL || !DREAMINA_PASSWORD) {
  console.error('Set DREAMINA_EMAIL and DREAMINA_PASSWORD env vars before running.')
  process.exit(1)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  })
  const page = await browser.newPage()

  console.log('Navigating to Dreamina...')
  await page.goto('https://dreamina.capcut.com/ai-tool/home?need_login=true', { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(3000)

  console.log('---')
  console.log('Browser is open. Please manually:')
  console.log('1. Click Login / Sign in')
  console.log('2. Choose email login (not Google/Apple/TikTok)')
  console.log(`3. Enter email: ${DREAMINA_EMAIL}`)
  console.log('4. Enter password (from DREAMINA_PASSWORD env var)')
  console.log('5. Once logged in, navigate to the AI Avatar / Lip Sync section')
  console.log('6. Right-click -> Inspect on each element as you go (login fields,')
  console.log('   upload button, script textarea, voice selector, generate button)')
  console.log('   and paste the HTML here so we can build the real automation script.')
  console.log('---')
  console.log('This script will NOT close on its own. Press Ctrl+C in this terminal when done.')

  await new Promise(() => {}) // hang forever, keep browser open
})()
