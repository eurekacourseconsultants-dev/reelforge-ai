const p = require('puppeteer');
(async () => {
  const b = await p.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('https://launchsteady.sg/signup', { waitUntil: 'networkidle2' });
  const result = await page.evaluate(() => {
    // Find anything mentioning terms/agree/privacy
    const all = Array.from(document.querySelectorAll('*'));
    const matches = all.filter(el =>
      el.children.length === 0 &&
      el.textContent.trim().length > 0 &&
      (el.textContent.toLowerCase().includes('terms') ||
       el.textContent.toLowerCase().includes('agree') ||
       el.textContent.toLowerCase().includes('privacy'))
    );
    return matches.map(el => ({
      tag: el.tagName,
      text: el.textContent.trim().slice(0, 100),
      parentHTML: el.parentElement.outerHTML.slice(0, 300)
    }));
  });
  console.log(JSON.stringify(result, null, 2));
  await b.close();
})();
