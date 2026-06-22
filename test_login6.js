const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 3000));

  console.log('Browser open - inspect the login page, then Ctrl+C when done');
  // Keep open for 60 seconds so you can inspect
  await new Promise(r => setTimeout(r, 60000));
  await browser.close();
})();
