const puppeteer = require('puppeteer');
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS);

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Click the correct Sign In element
  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 3000));
  console.log('URL after click:', page.url());

  const emailField = await page.$('input.kling-input__inner[type="email"]');
  console.log('Email field found:', !!emailField);

  if (emailField) {
    await page.type('input.kling-input__inner[type="email"]', KLING_ACCOUNTS[0].email, { delay: 50 });
    await new Promise(r => setTimeout(r, 500));
    await page.type('input.kling-input__inner[type="password"]', KLING_ACCOUNTS[0].password, { delay: 50 });
    await new Promise(r => setTimeout(r, 500));
    await page.click('button.login-btn.critical');
    await new Promise(r => setTimeout(r, 5000));
    console.log('URL after login:', page.url());
  }

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
