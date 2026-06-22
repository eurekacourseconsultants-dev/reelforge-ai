const puppeteer = require('puppeteer');
const KLING_ACCOUNTS = JSON.parse(process.env.KLING_ACCOUNTS);

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 2000));

  // Wait for login container to be visible
  await page.waitForSelector('div.login-container', { timeout: 10000 });
  console.log('Login container found');

  // Check inputs inside login container
  const inputs = await page.evaluate(() => {
    const container = document.querySelector('div.login-container');
    if (!container) return [];
    return Array.from(container.querySelectorAll('input')).map(el => ({
      type: el.type,
      placeholder: el.placeholder,
      class: el.className,
    }));
  });
  console.log('Inputs in login container:', JSON.stringify(inputs, null, 2));

  // Try typing into email field inside login container
  const emailSel = 'div.login-container input[type="email"], div.login-container input[type="text"]';
  const passwordSel = 'div.login-container input[type="password"]';

  await page.waitForSelector(emailSel, { timeout: 10000 });
  await page.type(emailSel, KLING_ACCOUNTS[0].email, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));
  await page.type(passwordSel, KLING_ACCOUNTS[0].password, { delay: 50 });
  await new Promise(r => setTimeout(r, 500));

  // Find and click submit button inside login container
  const btnInfo = await page.evaluate(() => {
    const container = document.querySelector('div.login-container');
    const btns = Array.from(container?.querySelectorAll('button') || []);
    return btns.map(b => ({ text: b.textContent.trim(), class: b.className }));
  });
  console.log('Buttons in login container:', JSON.stringify(btnInfo, null, 2));

  await page.click('button.login-btn.critical');
  await new Promise(r => setTimeout(r, 5000));
  console.log('URL after login:', page.url());

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
