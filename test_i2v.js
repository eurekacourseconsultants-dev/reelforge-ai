const puppeteer = require('puppeteer');
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS);

async function login(page, account) {
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('span.caption', { timeout: 10000 });
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.caption'));
    const el = spans.find(s => s.textContent.trim().toLowerCase().includes('email'));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.waitForSelector('input.kling-input__inner[type="email"]', { timeout: 10000 });
  await page.type('input.kling-input__inner[type="email"]', account.email, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));
  await page.type('input.kling-input__inner[type="password"]', account.password, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('button.login-btn.critical');
  await new Promise(r => setTimeout(r, 5000));
  console.log('Logged in as', account.email);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await login(page, KLING_ACCOUNTS[0]);

  // Navigate to I2V page
  await page.goto('https://kling.ai/app/video/image-to-video', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 4000));
  console.log('On I2V page - inspect the UI now. Browser stays open for 60 seconds.');

  // Keep open for inspection
  await new Promise(r => setTimeout(r, 600000));
  await browser.close();
})();
