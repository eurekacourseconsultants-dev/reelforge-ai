// poc_screen_recording.js
// Pre-implementation POC #1, Stage A: prove native Puppeteer screen recording
// works locally before testing it in GitHub Actions CI.
//
// Uses Puppeteer's built-in page.screencast() (available v22+, no third-party
// library needed — avoids the puppeteer-screen-recorder version conflict).

const puppeteer = require('puppeteer')

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

;(async () => {
  console.log('Launching headless Chromium...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  console.log('Navigating to test page...')
  await page.goto('https://example.com', { waitUntil: 'networkidle2' })

  const outputPath = '/tmp/poc_recording.webm'
  console.log('Starting screencast recording to', outputPath)

  const recorder = await page.screencast({ path: outputPath })

  // Record for 5 seconds, doing a trivial action partway through so we have
  // something to visually confirm later.
  await sleep(2000)
  await page.evaluate(() => {
    document.body.style.backgroundColor = '#FF5A09'
  })
  await sleep(3000)

  await recorder.stop()
  console.log('Recording stopped.')

  await browser.close()

  const fs = require('fs')
  const stats = fs.statSync(outputPath)
  console.log('File size:', stats.size, 'bytes')

  if (stats.size > 0) {
    console.log('SUCCESS: recording file exists and is non-empty.')
  } else {
    console.log('FAILURE: recording file is empty.')
    process.exit(1)
  }
})().catch(e => {
  console.error('POC failed:', e)
  process.exit(1)
})
