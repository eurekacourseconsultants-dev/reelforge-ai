const puppeteer = require('puppeteer');
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS);

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Step 1: Click Sign In
  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 2000));

  // Step 2: Click "Sign in with email"
  await page.waitForSelector('span.caption', { timeout: 10000 });
  await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span.caption'));
    const el = spans.find(s => s.textContent.trim().toLowerCase().includes('email'));
    if (el) el.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Fill email and password
  await page.waitForSelector('input.kling-input__inner[type="email"]', { timeout: 10000 });
  await page.type('input.kling-input__inner[type="email"]', KLING_ACCOUNTS[0].email, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));
  await page.type('input.kling-input__inner[type="password"]', KLING_ACCOUNTS[0].password, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));

  // Step 4: Click Sign In
  await page.click('button.login-btn.critical');
  await new Promise(r => setTimeout(r, 6000));

  // Check if logged in — need-login class should be gone
  const stillNeedsLogin = await page.$('div.user-profile.need-login');
  console.log('Still showing login button:', !!stillNeedsLogin);

  // Check credits
  const credits = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const el = all.find(e => e.textContent.trim() === '66' || e.className?.includes('credit'));
    return el ? el.textContent.trim() : 'not found';
  });
  console.log('Credits element:', credits);

  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();
