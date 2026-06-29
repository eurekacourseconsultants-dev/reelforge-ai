#!/usr/bin/env node
/**
 * run_demo_flow.js — LaunchSteady Demo Generator
 * Drives Puppeteer through a flow config, records raw video.
 * Output: /tmp/demo_raw_{demo_type}_desktop.mp4 or _mobile.mp4
 * Actions log: /tmp/demo_actions_{demo_type}.json
 * Flags: --mobile (390x844 viewport, isMobile+hasTouch)
 */

const puppeteer = require('puppeteer');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
const fs = require('fs');
const path = require('path');

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isMobile = args.includes('--mobile');
const positional = args.filter(a => !a.startsWith('--'));
const [demoType, variablesJson] = positional;
if (!demoType) { console.error('Usage: node run_demo_flow.js <demo_type> <variables_json> [--mobile]'); process.exit(1); }
const mode = isMobile ? 'mobile' : 'desktop';

const variables = variablesJson ? JSON.parse(variablesJson) : {};
const flowPath = path.join(__dirname, 'demo_flows', `${demoType}.json`);
if (!fs.existsSync(flowPath)) { console.error(`Flow config not found: ${flowPath}`); process.exit(1); }

const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8'));
const actionsLog = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function interpolate(str) {
  if (!str) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => variables[k] ?? `{{${k}}}`);
}

// Ease-out cubic: t in [0,1] → value in [0,1]
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ─── Cursor injection ─────────────────────────────────────────────────────────
async function injectCursor(page, mobile = false) {
  await page.evaluate((mobile) => {
    if (document.getElementById('__demo_cursor')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = '__demo_cursor';
    const size = mobile ? 36 : 24;
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', '0 0 36 36');
    svg.style.cssText = `
      position: fixed;
      top: -100px;
      left: -100px;
      z-index: 999999;
      pointer-events: none;
      transform: translate(-50%, -50%);
      transition: top 0ms linear, left 0ms linear;
      filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
    `;
    if (mobile) {
      // Tap circle for mobile
      svg.innerHTML = `
        <circle cx="18" cy="18" r="8" fill="orange"/>
      `;
    } else {
      // Arrow cursor for desktop — offset so tip is at top-left
      svg.style.transform = 'translate(0, 0)';
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '24');
      svg.setAttribute('height', '24');
      svg.innerHTML = `
        <polygon points="2,2 2,20 7,15 11,22 13,21 9,14 16,14" 
                 fill="white" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>
      `;
    }
    document.body.appendChild(svg);
  }, mobile);
}

async function moveCursor(page, x, y) {
  await page.evaluate((x, y) => {
    const el = document.getElementById('__demo_cursor');
    if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
  }, x, y);
}

// Smooth glide — step-based with per-step screen updates (works correctly with recorder)
async function glideCursor(page, fromX, fromY, toX, toY) {
  const STEPS = 40;
  const STEP_MS = 16; // 16ms per step = ~60fps, forces a repaint each step
  for (let i = 1; i <= STEPS; i++) {
    const progress = i / STEPS;
    const t = easeOut(progress);
    const jitter = (1 - progress) * 2.5;
    const jx = (Math.random() - 0.5) * jitter;
    const jy = (Math.random() - 0.5) * jitter;
    const x = fromX + (toX - fromX) * t + jx;
    const y = fromY + (toY - fromY) * t + jy;
    await moveCursor(page, x, y);
    await sleep(STEP_MS);
  }
  await moveCursor(page, toX, toY);
}

// ─── Get element center ───────────────────────────────────────────────────────
async function getElementCenter(page, selector) {
  const el = await page.$(selector);
  if (!el) return null;
  const box = await el.boundingBox();
  if (!box) return null;
  // Slightly off-center — looks more human
  return {
    x: box.x + box.width * 0.42 + (Math.random() - 0.5) * 4,
    y: box.y + box.height * 0.45 + (Math.random() - 0.5) * 3,
  };
}

// Find element by visible text content
async function getElementByText(page, text) {
  return page.evaluateHandle((text) => {
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.children.length === 0 && el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    // Fallback: any element containing the text
    for (const el of all) {
      if (el.textContent && el.textContent.includes(text)) return el;
    }
    return null;
  }, text);
}

// ─── Scroll to element ────────────────────────────────────────────────────────
async function scrollToTarget(page, target, offset = 0) {
  const targetY = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return el.getBoundingClientRect().top + window.scrollY;
  }, target);

  if (targetY === null) throw new Error(`Scroll target not found: ${target}`);

  const currentY = await page.evaluate(() => window.scrollY);
  const distance = targetY - currentY;

  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = '__demo_freeze';
    s.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; overflow-anchor: none !important; }';
    document.head.appendChild(s);
  });

  const FLICK_STEPS = 25;
  for (let i = 1; i <= FLICK_STEPS; i++) {
    const t = easeOut(i / FLICK_STEPS);
    await page.evaluate((y) => window.scrollTo(0, y), currentY + distance * t);
    await sleep(18);
  }
  await sleep(1200);

  await page.evaluate(() => {
    const s = document.getElementById('__demo_freeze');
    if (s) s.remove();
  });

  if (offset !== 0) {
    await page.evaluate((y) => window.scrollBy(0, y), offset);
    await sleep(300);
  }
}

// ─── Human typing ─────────────────────────────────────────────────────────────
async function humanType(page, selector, text) {
  await page.focus(selector);
  await sleep(80 + Math.random() * 60);
  for (const char of text) {
    await page.evaluate((sel, c) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(el, el.value + c);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, selector, char);
    await sleep(35 + Math.random() * 40);
  }
}

// ─── Action handlers ──────────────────────────────────────────────────────────
async function handleNavigate(page, step, cursorPos) {
  const url = interpolate(step.url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  
  // Inject permanent layout baseline to block scrolling shifts and anchor conflicts
  await page.evaluate(() => {
    if (!document.getElementById('__automation_baseline')) {
      const style = document.createElement('style');
      style.id = '__automation_baseline';
      style.textContent = `
        html, body { scroll-behavior: auto !important; overflow-anchor: none !important; }
      `;
      document.head.appendChild(style);
    }
  });

  await injectCursor(page, isMobile);
  await moveCursor(page, cursorPos.x, cursorPos.y);
  await sleep(step.settle || 200);
}

async function handleWait(page, step) {
  await sleep(step.duration ?? 1000);
}

async function handleScroll(page, step, cursorPos, isMobile) {
  const target = (isMobile && step.mobile_target) ? step.mobile_target : step.target;
  await scrollToTarget(page, target, step.offset || 0);
  const viewportCentre = await page.evaluate(() => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }));
  await moveCursor(page, viewportCentre.x, viewportCentre.y);
  cursorPos.x = viewportCentre.x;
  cursorPos.y = viewportCentre.y;
  await sleep(500);
}

async function handleClick(page, step, cursorPos) {
  let center;

  if (step.textContains) {
    const el = await getElementByText(page, step.textContains);
    const box = await el.asElement()?.boundingBox();
    if (!box) throw new Error(`textContains element not found: "${step.textContains}"`);
    center = {
      x: box.x + box.width * 0.42,
      y: box.y + box.height * 0.45,
    };
  } else {
    center = await getElementCenter(page, step.selector);
    if (!center) throw new Error(`Selector not found: ${step.selector}`);
  }

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(120);

  if (step.textContains) {
    await page.evaluate((text) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent && el.textContent.includes(text)) { el.click(); return; }
      }
    }, step.textContains);
  } else {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, step.selector);
  }

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleClickNavigate(page, step, cursorPos) {
  let center;

  if (step.textContains) {
    const el = await getElementByText(page, step.textContains);
    const box = await el.asElement()?.boundingBox();
    if (!box) throw new Error(`textContains element not found: "${step.textContains}"`);
    center = { x: box.x + box.width * 0.42, y: box.y + box.height * 0.45 };
  } else {
    center = await getElementCenter(page, step.selector);
    if (!center) throw new Error(`Selector not found for click_navigate: ${step.selector}`);
  }

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(120);

  const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null);

  if (step.textContains) {
    await page.evaluate((text) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.textContent && el.textContent.includes(text)) { el.click(); return; }
      }
    }, step.textContains);
  } else {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, step.selector);
  }

  await navPromise;

  const currentUrl = page.url();
  if (step.expected_url_contains && !currentUrl.includes(step.expected_url_contains)) {
    throw new Error(
      `click_navigate on step "${step.id}": expected URL to contain "${step.expected_url_contains}" but got "${currentUrl}"`
    );
  }

  await injectCursor(page, isMobile);
  await moveCursor(page, cursorPos.x, cursorPos.y);
  await sleep(200);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleType(page, step, cursorPos) {
  const value = interpolate(step.value);
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`Type target not found: ${step.selector}`);

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.click(); }, step.selector);
  await page.focus(step.selector);
  await sleep(60);
  await page.click(step.selector, { clickCount: 3 });
  await sleep(40);
  await humanType(page, step.selector, value);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleSelect(page, step, cursorPos) {
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`Select target not found: ${step.selector}`);

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.select(step.selector, step.value);
  await sleep(100);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleHover(page, step, cursorPos) {
  const center = await getElementCenter(page, step.selector);
  if (!center) { console.warn(`  Hover target not found (skipping): ${step.selector}`); return; }

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(150 + Math.random() * 200);

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleVisualClick(page, step, cursorPos) {
  const center = await getElementCenter(page, step.selector);
  if (!center) throw new Error(`visual_click target not found: ${step.selector}`);

  await glideCursor(page, cursorPos.x, cursorPos.y, center.x, center.y);
  await sleep(80);
  await page.mouse.down();
  await sleep(80);
  await page.mouse.up();

  cursorPos.x = center.x;
  cursorPos.y = center.y;
}

async function handleClickByText(page, step, cursorPos) {
  const text = step.containsText;
  const box = await page.evaluate((text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!el) break;
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            const checkboxBox = el.querySelector('div');
            if (checkboxBox) {
              const r = checkboxBox.getBoundingClientRect();
              if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, found: true };
            }
          }
          el = el.parentElement;
        }
      }
    }
    return { found: false };
  }, text);

  if (!box || !box.found) throw new Error(`click_by_text: could not find checkbox for "${text}"`);

  await glideCursor(page, cursorPos.x, cursorPos.y, box.x, box.y);
  await sleep(80);

  await page.evaluate((text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent.includes(text)) {
        let el = node.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!el) break;
          const style = window.getComputedStyle(el);
          if (style.cursor === 'pointer') {
            el.click();
            return;
          }
          el = el.parentElement;
        }
      }
    }
  }, text);

  await sleep(150);
  cursorPos.x = box.x;
  cursorPos.y = box.y;
}

// ─── Main runner ──────────────────────────────────────────────────────────────
(async () => {
  console.log(`Running demo flow: ${demoType} [${mode}]`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--run-all-compositor-stages-before-draw',
      '--enable-usermedia-screen-capturing',
      '--use-fake-ui-for-media-stream',
    ],
    defaultViewport: isMobile
      ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  const client = await page.createCDPSession();
  await client.send('Animation.setPlaybackRate', { playbackRate: 1 });

  const recorder = new PuppeteerScreenRecorder(page, {
    followNewTab: false,
    fps: 30,
    videoCrf: 18,
    videoCodec: 'libx264',
    videoPreset: 'ultrafast',
    aspectRatio: '16:9',
  });

  const outputVideo = `/tmp/demo_raw_${demoType}_${mode}.mp4`;
  console.log('Starting recording...');
  await recorder.start(outputVideo);

  const cursorPos = { x: 640, y: 400 };

  try {
    for (const step of flow.steps) {
      console.log(`Step: ${step.id} — ${step.desc}`);
      actionsLog.push({ step: step.id, ts: Date.now() });

      switch (step.action) {
        case 'navigate':
          await handleNavigate(page, step, cursorPos);
          break;
        case 'wait':
          await handleWait(page, step);
          break;
        case 'scroll':
          await handleScroll(page, step, cursorPos, isMobile);
          break;
        case 'scroll_into_view_chain': {
          // Multiple scroll legs, all run back-to-back INSIDE one evaluate
          // call — zero Node<->browser round-trips between legs, so there
          // is no inter-leg delay at all.
          const legs = (isMobile && step.mobile_legs) ? step.mobile_legs : step.legs;
          await page.evaluate((legs) => {
            const freeze = document.createElement('style');
            freeze.id = '__demo_freeze';
            freeze.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; overflow-anchor: none !important; } html { scroll-behavior: auto !important; overflow-anchor: none !important; }';
            document.head.appendChild(freeze);

            function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

            function animateTo(toY, duration) {
              return new Promise((resolve) => {
                const from = window.scrollY;
                const distance = toY - from;
                const start = performance.now();
                function step(now) {
                  const t = Math.min((now - start) / duration, 1);
                  window.scrollTo(0, from + distance * easeOut(t));
                  if (t < 1) requestAnimationFrame(step);
                  else resolve();
                }
                requestAnimationFrame(step);
              });
            }

            return (async () => {
              for (const leg of legs) {
                const el = document.querySelector(leg.target);
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                const elTop = rect.top + window.scrollY;
                const targetY = leg.block === 'center'
                  ? elTop - (window.innerHeight - rect.height) / 2
                  : elTop - (leg.nav_offset || 0);
                await animateTo(Math.max(0, targetY), leg.duration || 600);
              }
              freeze.remove();
            })();
          }, legs);

          await sleep(step.final_settle_ms ?? 400); // pause only AFTER the last leg lands, none between legs
          const viewportCentre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
          await moveCursor(page, viewportCentre.x, viewportCentre.y);
          cursorPos.x = viewportCentre.x;
          cursorPos.y = viewportCentre.y;
          break;
        }
        case 'scroll_into_view': {
          // Supports either a single target (target/mobile_target/block/nav_offset)
          // OR a chain of legs (legs/mobile_legs — each {target, block, nav_offset}).
          // All legs run back-to-back INSIDE one evaluate call — zero delay
          // between legs, since long single scrolls land unreliably.
          // A settle delay only happens ONCE, after the final leg lands,
          // before the cursor starts moving toward the click target.
          let legs = (isMobile && step.mobile_legs) ? step.mobile_legs : step.legs;
          if (!legs) {
            legs = [{
              target: (isMobile && step.mobile_target) ? step.mobile_target : step.target,
              block: step.block || 'start',
              nav_offset: step.nav_offset || 0,
            }];
          }

          await page.evaluate(() => {
            const freeze = document.createElement('style');
            freeze.id = '__demo_freeze';
            freeze.textContent = `
              *, *::before, *::after { animation: none !important; transition: none !important; overflow-anchor: none !important; }
              html, body { scroll-behavior: auto !important; overflow-anchor: none !important; }
            `;
            document.head.appendChild(freeze);
          });

          for (const leg of legs) {
            await page.evaluate((leg) => {
              const el = document.querySelector(leg.target);
              if (!el) return Promise.resolve();
              const rect = el.getBoundingClientRect();
              const elTop = rect.top + window.scrollY;
              const targetY = leg.block === 'center'
                ? elTop - (window.innerHeight - rect.height) / 2
                : elTop - (leg.nav_offset || 0);
              const from = window.scrollY;
              const to = Math.max(0, targetY);
              const distance = to - from;
              const duration = leg.duration || 600;
              const start = performance.now();
              function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
              return new Promise((resolve) => {
                function step(now) {
                  const t = Math.min((now - start) / duration, 1);
                  window.scrollTo(0, from + distance * easeOut(t));
                  if (t < 1) requestAnimationFrame(step);
                  else resolve();
                }
                requestAnimationFrame(step);
              });
            }, leg);
            await sleep(leg.delay_after_ms ?? 0); // slight pause between legs
          }

          await page.evaluate(() => {
            const f = document.getElementById('__demo_freeze');
            if (f) f.remove();
          });

          await sleep(step.final_settle_ms ?? 400); // beat on the landed target before the cursor moves
          const viewportCentre = await page.evaluate(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
          await moveCursor(page, viewportCentre.x, viewportCentre.y);
          cursorPos.x = viewportCentre.x;
          cursorPos.y = viewportCentre.y;
          break;
        }
        case 'scroll_by':
          await page.evaluate((y) => window.scrollBy(0, y), step.y);
          await sleep(500);
          break;
        case 'click':
          await handleClick(page, step, cursorPos);
          break;
        case 'click_navigate':
          await handleClickNavigate(page, step, cursorPos);
          break;
        case 'type':
          await handleType(page, step, cursorPos);
          break;
        case 'select':
          await handleSelect(page, step, cursorPos);
          break;
        case 'hover':
          await handleHover(page, step, cursorPos);
          break;
        case 'visual_click':
          await handleVisualClick(page, step, cursorPos);
          break;
        case 'click_by_text':
          await handleClickByText(page, step, cursorPos);
          break;
        default:
          console.warn(`  Unknown action "${step.action}" — skipping`);
      }
    }
  } catch (err) {
    console.error(`Demo flow failed: ${err.message}`);
    await recorder.stop();
    await browser.close();
    process.exit(1);
  }

  await recorder.stop();
  await browser.close();
  console.log('Recording stopped.');

  fs.writeFileSync(
    `/tmp/demo_actions_${demoType}_${mode}.json`,
    JSON.stringify(actionsLog, null, 2)
  );

  console.log(`Video saved: ${outputVideo}`);
  console.log(`Actions log: /tmp/demo_actions_${demoType}_${mode}.json`);
})();