const puppeteer = require('puppeteer');
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS);

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Find and click Sign In by text
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('span, button, a, div'));
    const el = all.find(e => e.textContent.trim() === 'Sign In');
    if (el) el.click();
    else console.log('Sign In not found');
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log('URL after click:', page.url());

  // Check if email field appeared
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
