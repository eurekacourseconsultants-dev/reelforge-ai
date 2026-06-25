const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------
// Usage: node scripts/run_demo_flow.js <demo_type> <variables_json>
// Example:
//   node scripts/run_demo_flow.js signup_login '{"demo_full_name":"Sarah Tan","demo_email":"sarah@example.com","demo_phone":"91234567","demo_address":"123 Orchard Road","demo_postal_code":"238858","demo_password":"Demo@12345"}'
// ---------------------------------------------------------------------------

const DEMO_TYPE = process.argv[2];
const VARIABLES = JSON.parse(process.argv[3] || '{}');

if (!DEMO_TYPE) {
  console.error('Usage: node scripts/run_demo_flow.js <demo_type> <variables_json>');
  process.exit(1);
}

const FLOW_PATH = path.join(__dirname, 'demo_flows', `${DEMO_TYPE}.json`);
if (!fs.existsSync(FLOW_PATH)) {
  console.error(`Flow config not found: ${FLOW_PATH}`);
  process.exit(1);
}

const flow = JSON.parse(fs.readFileSync(FLOW_PATH, 'utf8'));

const OUTPUT_DIR = '/tmp/demo_segments';
const ACTIONS_LOG = `/tmp/demo_actions_${DEMO_TYPE}.json`;
const VIDEO_OUT = `/tmp/demo_raw_${DEMO_TYPE}.mp4`;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveValue(val) {
  if (!val) return val;
  return val.replace(/\{\{(\w+)\}\}/g, (_, key) => VARIABLES[key] || '');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Inject fake cursor overlay into the page
async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('__demo_cursor')) return;
    const el = document.createElement('div');
    el.id = '__demo_cursor';
    el.style.cssText = `
      position: fixed;
      width: 28px;
      height: 28px;
      pointer-events: none;
      z-index: 999999;
      transition: left 0.25s cubic-bezier(0.25,0.1,0.25,1), top 0.25s cubic-bezier(0.25,0.1,0.25,1);
    `;
    el.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M5 2L23 13.5L14.5 15.5L10.5 24L5 2Z" fill="white" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>\`;
    el.style.left = '-100px';
    el.style.top = '-100px';
    document.body.appendChild(el);
  });
}

// Move fake cursor to (x, y) with eased steps
async function moveCursor(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const el = document.getElementById('__demo_cursor');
    if (el) { el.style.left = (x - 4) + 'px'; el.style.top = (y - 3) + 'px'; }
  }, { x, y });
  // Also move Puppeteer's real mouse (needed for hover/click detection)
  await page.mouse.move(x, y, { steps: 20 });
  await sleep(350); // allow CSS transition to complete
}

// Get bounding box of a selector, returns { x, y, width, height, centerX, centerY }
async function getBBox(page, selector) {
  const box = await page.$eval(selector, el => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  box.centerX = Math.round(box.x + box.width / 2);
  box.centerY = Math.round(box.y + box.height / 2);
  return box;
}

// Type text character by character with realistic delay
async function typeSlowly(page, selector, text) {
  await page.focus(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(60 + Math.random() * 60);
  }
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

(async () => {
  console.log(`Running demo flow: ${DEMO_TYPE}`);
  console.log(`Variables: ${JSON.stringify(VARIABLES)}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: flow.viewport.width,
    height: flow.viewport.height,
  });

  const recorder = new PuppeteerScreenRecorder(page, {
    fps: 25,
    videoFrame: { width: flow.viewport.width, height: flow.viewport.height },
    videoCrf: 18,
    videoCodec: 'libx264',
    videoPreset: 'ultrafast',
    autopad: { color: 'black' },
  });

  console.log('Starting recording...');
  await recorder.start(VIDEO_OUT);

  const actionsLog = [];
  let currentScreen = null;

  for (const step of flow.steps) {
    console.log(`Step: ${step.id} — ${step.description}`);
    const stepStart = Date.now();

    // Seed sessionStorage before navigation if required
    if (step.seedSessionStorage) {
      const seed = step.seedSessionStorage;
      await page.goto(`${flow.baseUrl}/onboarding/package`, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.evaluate((vars, pkg) => {
        sessionStorage.setItem('ls_package', pkg);
        sessionStorage.setItem('ls_signup', JSON.stringify({
          fullName: vars.demo_full_name,
          email: vars.demo_email,
          phone: vars.demo_phone,
          password: vars.demo_password,
        }));
      }, VARIABLES, seed.ls_package);
    }

    // Navigate to new screen if needed
    if (step.action === 'navigate' || step.screen !== currentScreen) {
      const url = `${flow.baseUrl}${step.screen}`;
      console.log(`  Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await injectCursor(page);
      currentScreen = step.screen;
      // Hold for camera pan if specified
      if (step.camera?.duration) {
        await sleep(step.camera.duration * 1000);
      }
    }

    if (step.action === 'navigate') {
      // Log the navigate action for zoompan
      actionsLog.push({
        stepId: step.id,
        t: (Date.now() - actionsLog[0]?.tAbs || 0) / 1000,
        tAbs: Date.now(),
        type: 'navigate',
        screen: step.screen,
        camera: step.camera,
      });
      continue;
    }

    // Get bounding box of target element
    let bbox = null;
    if (step.selector) {
      try {
        await page.waitForSelector(step.selector, { timeout: 5000 });
        bbox = await getBBox(page, step.selector);
      } catch (e) {
        console.warn(`  Selector not found: ${step.selector} — skipping`);
        continue;
      }
    }

    // Hold before action
    if (step.camera?.holdBefore) {
      await sleep(step.camera.holdBefore * 1000);
    }

    // Move cursor to element
    if (bbox) {
      await moveCursor(page, bbox.centerX, bbox.centerY);
    }

    // Log action for zoompan generator
    const tAbs = Date.now();
    actionsLog.push({
      stepId: step.id,
      t: actionsLog.length > 0 ? (tAbs - actionsLog[0].tAbs) / 1000 : 0,
      tAbs,
      type: step.action,
      selector: step.selector,
      bbox,
      camera: step.camera,
      screen: step.screen,
    });
    if (actionsLog[0] && !actionsLog[0].tAbs) actionsLog[0].tAbs = tAbs;

    // Execute action
    if (step.action === 'scroll' && step.scrollTo) {
      const steps = step.scrollSteps || 10;
      const delay = step.scrollDelay || 300;
      // Scroll element into view smoothly in increments
      const targetY = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top + window.scrollY : 0;
      }, step.scrollTo);
      const startY = await page.evaluate(() => window.scrollY);
      const increment = (targetY - startY) / steps;
      for (let i = 0; i < steps; i++) {
        await page.evaluate((inc) => window.scrollBy(0, inc), increment);
        await sleep(delay);
      }
    } else if (step.action === 'type' && step.selector) {
      await typeSlowly(page, step.selector, resolveValue(step.value));
    } else if (step.action === 'click' && step.selector) {
      await page.click(step.selector);
    } else if (step.action === 'select' && step.selector) {
      await page.select(step.selector, resolveValue(step.value));
    } else if (step.action === 'hover') {
      // Already moved cursor above — just hold
    }

    // Hold after action
    if (step.camera?.holdAfter) {
      await sleep(step.camera.holdAfter * 1000);
    }
  }

  console.log('Stopping recording...');
  await recorder.stop();
  await browser.close();

  // Normalise timestamps so t=0 is start of recording
  const t0 = actionsLog[0]?.tAbs || 0;
  for (const entry of actionsLog) {
    entry.t = (entry.tAbs - t0) / 1000;
    delete entry.tAbs;
  }

  fs.writeFileSync(ACTIONS_LOG, JSON.stringify(actionsLog, null, 2));
  console.log(`Actions log: ${ACTIONS_LOG}`);
  console.log(`Raw video: ${VIDEO_OUT}`);
  console.log('Done.');
})();
