const p = require('puppeteer');
(async () => {
  const b = await p.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await b.newPage();
  await page.goto('https://launchsteady.sg/signup', { waitUntil: 'networkidle2' });
  const result = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const match = all.find(el => el.children.length === 0 && el.textContent.includes('I have read and agree'));
    if (!match) return 'NOT FOUND';
    return {
      tag: match.tagName,
      id: match.id,
      className: match.className,
      parentTag: match.parentElement.tagName,
      parentClass: match.parentElement.className,
      grandparentHTML: match.parentElement.parentElement.outerHTML.slice(0, 400)
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await b.close();
})();
