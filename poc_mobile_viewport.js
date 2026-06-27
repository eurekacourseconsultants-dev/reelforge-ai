const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');

const OUTPUT_PATH = '/tmp/poc_mobile_viewport.mp4';

(async () => {
  console.log('Launching browser in mobile viewport...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  // iPhone 13 dimensions
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
  );

  const recorder = new PuppeteerScreenRecorder(page, {
    fps: 25,
    videoFrame: { width: 390, height: 844 },
    videoCrf: 18,
    videoCodec: 'libx264',
    videoPreset: 'ultrafast',
    autopad: { color: 'black' },
  });

  console.log('Starting recording...');
  await recorder.start(OUTPUT_PATH);

  console.log('Navigating to launchsteady.sg...');
  await page.goto('https://launchsteady.sg', { waitUntil: 'networkidle2', timeout: 30000 });

  // Hold on landing for 2s
  await new Promise(r => setTimeout(r, 2000));

  // Scroll down slowly
  console.log('Scrolling down...');
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'smooth' }));
    await new Promise(r => setTimeout(r, 400));
  }

  // Hold at bottom for 1s
  await new Promise(r => setTimeout(r, 1000));

  // Scroll back up
  console.log('Scrolling back up...');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await new Promise(r => setTimeout(r, 1500));

  console.log('Stopping recording...');
  await recorder.stop();
  await browser.close();

  console.log(`Done. Output: ${OUTPUT_PATH}`);
})();
