const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://kling.ai/app', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));

  // Find Sign In element and log its tag, class, and parent info
  const info = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const el = all.find(e => e.textContent.trim() === 'Sign In');
    if (!el) return 'NOT FOUND';
    const parent = el.parentElement;
    const grandparent = parent?.parentElement;
    return {
      tag: el.tagName,
      class: el.className,
      parentTag: parent?.tagName,
      parentClass: parent?.className,
      grandparentTag: grandparent?.tagName,
      grandparentClass: grandparent?.className,
      href: el.href || parent?.href || grandparent?.href || 'none',
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
