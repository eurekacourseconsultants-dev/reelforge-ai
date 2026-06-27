const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });

  // Card element inside billing form
  await p.goto('https://launchsteady.sg/onboarding/package', { waitUntil: 'networkidle2' });
  await p.evaluate(() => {
    sessionStorage.setItem('ls_package', 'B');
    sessionStorage.setItem('ls_signup', JSON.stringify({
      fullName: 'Sarah Tan', email: 'sarah@example.com',
      phone: '+6591234567', password: 'Demo@12345'
    }));
  });
  await p.goto('https://launchsteady.sg/onboarding/billing', { waitUntil: 'networkidle2' });
  const formChildren = await p.evaluate(() => {
    const form = document.querySelector('form.auth-form');
    if (!form) return [];
    return [...form.querySelectorAll('*')].map(el => ({
      tag: el.tagName, class: el.className,
      id: el.id, style: (el.getAttribute('style') || '').slice(0,80)
    }));
  });
  console.log('Form children:', JSON.stringify(formChildren, null, 2));

  // Package grid children
  await p.goto('https://launchsteady.sg/onboarding/package', { waitUntil: 'networkidle2' });
  const pkgCards = await p.evaluate(() => {
    return [...document.querySelectorAll('.package-grid > *')].map((el, i) => ({
      i, tag: el.tagName, class: el.className,
      text: (el.innerText || '').slice(0, 60)
    }));
  });
  console.log('Package grid children:', JSON.stringify(pkgCards, null, 2));

  await b.close();
})();
