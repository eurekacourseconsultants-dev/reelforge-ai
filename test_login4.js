const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  await page.waitForSelector('div.user-profile.need-login', { timeout: 10000 });
  await page.click('div.user-profile.need-login');
  await new Promise(r => setTimeout(r, 4000));

  // Dump all inputs visible on page after click
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(el => ({
      type: el.type,
      placeholder: el.placeholder,
      class: el.className,
      visible: el.offsetParent !== null
    }));
  });
  console.log('Inputs found:', JSON.stringify(inputs, null, 2));

  // Also check for any new divs/modals that appeared
  const modals = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="login"], [class*="popup"]'))
      .map(el => ({ tag: el.tagName, class: el.className, visible: el.offsetParent !== null }))
  });
  console.log('Modals found:', JSON.stringify(modals, null, 2));

  await browser.close();
})();
