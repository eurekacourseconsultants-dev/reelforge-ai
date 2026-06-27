const p = require('puppeteer');
(async () => {
  const b = await p.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('https://launchsteady.sg/signup', { waitUntil: 'networkidle2' });
  const result = await page.evaluate(() => {
    // Get the full auth-card or form HTML to see the checkbox structure
    const form = document.querySelector('form') || document.querySelector('.auth-card');
    if (!form) return 'no form found';
    // Find the section around the terms paragraph
    const all = Array.from(form.querySelectorAll('*'));
    const termsPara = all.find(el => el.tagName === 'P' && el.textContent.includes('Terms of Service'));
    if (!termsPara) return 'no terms para';
    // Return the parent container HTML
    return termsPara.parentElement.outerHTML.slice(0, 800);
  });
  console.log(result);
  await b.close();
})();
