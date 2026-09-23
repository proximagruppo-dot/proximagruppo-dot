/**
 * Browser smoke check for the presentation, without adding project dependencies.
 * Run while Vite is available at http://127.0.0.1:5173:
 *   node scripts/verify-experience.mjs
 * Optional: QA_BASE_URL, QA_OUT_DIR, QA_PLAYWRIGHT_PATH, QA_BROWSER_PATH.
 * Screenshots, per-stage measurements, and console/network errors go to /tmp.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const baseURL = process.env.QA_BASE_URL || 'http://127.0.0.1:5173';
const outDir = process.env.QA_OUT_DIR || '/tmp/proxima-browser-qa';
await mkdir(outDir, { recursive: true });

async function loadPlaywright() {
  if (process.env.QA_PLAYWRIGHT_PATH) return import(pathToFileURL(process.env.QA_PLAYWRIGHT_PATH).href);
  try { return await import(pathToFileURL(require.resolve('playwright')).href); } catch { /* Cached npx is an equally valid runner. */ }
  const cache = path.join(homedir(), '.npm', '_npx');
  const entries = await readdir(cache).catch(() => []);
  for (const entry of entries.reverse()) {
    const candidate = path.join(cache, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }
  throw new Error('Playwright is unavailable. Set QA_PLAYWRIGHT_PATH to an installed playwright/index.mjs.');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.QA_BROWSER_PATH ? { executablePath: process.env.QA_BROWSER_PATH } : {}),
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const report = { baseURL, createdAt: new Date().toISOString(), scenarios: [] };

async function settle(page, ms = 1000) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function measure(page) {
  return page.evaluate(() => {
    const hero = document.querySelector('[data-experience], #experience, #product-story') || document.querySelector('canvas')?.closest('section');
    const rect = element => {
      const b = element.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    const isVisible = element => {
      const b = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    return {
      scrollY, viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      hero: hero ? { ...rect(hero), dataset: { ...hero.dataset } } : null,
      visibleHeadings: [...document.querySelectorAll('h1,h2,h3')].filter(isVisible).map(el => el.textContent?.trim()),
      visibleCallouts: [...document.querySelectorAll('[data-callout], [class*="callout"], [class*="Callout"]')].filter(isVisible).map(el => el.textContent?.trim()).filter(Boolean),
      visibleControls: [...document.querySelectorAll('button, a')].filter(isVisible).map(el => ({ text: el.getAttribute('aria-label') || el.textContent?.trim(), ...rect(el) })),
      canvas: [...document.querySelectorAll('canvas')].map(el => ({ ...rect(el), width: el.width, height: el.height })),
    };
  });
}

try {
  for (const scenario of [
    { name: 'desktop', viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' },
    { name: 'mobile', viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference', isMobile: true, hasTouch: true },
    { name: 'reduced-motion', viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
  ]) {
    console.log(`Checking ${scenario.name}…`);
    const { name, ...options } = scenario;
    const context = await browser.newContext({ ...options, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const result = { name, errors: [], warnings: [], failedRequests: [], badResponses: [], stages: [], navigation: [] };
    report.scenarios.push(result);
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') result.errors.push(message.text());
      if (message.type() === 'warning') result.warnings.push(message.text());
    });
    page.on('requestfailed', request => {
      if (request.failure()?.errorText !== 'net::ERR_ABORTED') result.failedRequests.push({ url: request.url(), error: request.failure()?.errorText });
    });
    page.on('response', response => {
      if (response.status() >= 400) result.badResponses.push({ status: response.status(), url: response.url() });
    });
    await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 1800);

    const timeline = await page.evaluate(() => {
      const hero = document.querySelector('[data-experience], #experience, #product-story') || document.querySelector('canvas')?.closest('section');
      if (!hero) return null;
      const container = hero.parentElement?.classList.contains('pin-spacer') ? hero.parentElement : hero;
      const box = container.getBoundingClientRect();
      return { start: box.top + scrollY, length: Math.max(0, box.height - innerHeight), height: box.height };
    });
    result.timeline = timeline;
    const progressSamples = (process.env.QA_PROGRESS || '0,0.2,0.4,0.6,0.75,0.9,1').split(',').map(Number);
    for (const [index, progress] of progressSamples.entries()) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), (timeline?.start || 0) + (timeline?.length || 0) * progress);
      await settle(page);
      const measurement = await measure(page);
      result.stages.push({ requestedProgress: progress, ...measurement });
      await page.screenshot({ path: path.join(outDir, `${name}-${index}-${Math.round(progress * 100)}.png`) });
    }

    // Validate presentation controls, including the PCB explorer in reduced motion.
    result.interactions = [];
    const chapterButtons = page.locator('[data-chapter-target]');
    for (let index = 0; index < await chapterButtons.count(); index++) {
      const button = chapterButtons.nth(index);
      const expected = await button.getAttribute('data-chapter-target');
      await button.click();
      await settle(page, 1800);
      const actual = await page.locator('[data-experience]').getAttribute('data-chapter');
      result.interactions.push({ type: 'chapter', expected, actual, passed: actual === expected });
    }
    const inside = page.locator('[data-chapter-target="3"]');
    if (await inside.count()) {
      await inside.click();
      await settle(page, 1800);
      const componentButtons = page.getByRole('button', { name: /^Inspect / });
      for (let index = 0; index < await componentButtons.count(); index++) {
        const button = componentButtons.nth(index);
        const label = await button.getAttribute('aria-label');
        await button.click();
        await settle(page, 1400);
        const pressed = await button.getAttribute('aria-pressed');
        const copy = await page.getByRole('complementary', { name: 'PCB component explorer' }).innerText();
        result.interactions.push({ type: 'component', label, pressed, copy, passed: pressed === 'true' });
        await page.screenshot({ path: path.join(outDir, `${name}-component-${index + 1}.png`) });
      }
    }
    const tabs = page.getByRole('tab');
    for (let index = 0; index < await tabs.count(); index++) {
      const tab = tabs.nth(index);
      const label = await tab.innerText();
      await tab.click();
      await settle(page, 300);
      const selected = await tab.getAttribute('aria-selected');
      const panel = page.getByRole('tabpanel');
      const image = panel.locator('img[aria-hidden="false"]');
      result.interactions.push({ type: 'app-tab', label, selected, image: await image.getAttribute('src'), passed: selected === 'true' && await image.count() === 1 });
    }
    if (await tabs.count()) {
      await tabs.first().focus();
      await page.keyboard.press('ArrowRight');
      const keyboardPassed = await tabs.nth(1).getAttribute('aria-selected') === 'true' && await tabs.nth(1).evaluate(element => element === document.activeElement);
      result.interactions.push({ type: 'app-keyboard', passed: keyboardPassed });
    }

    // Sample the complete page, including sections outside the WebGL story.
    result.pageSamples = [];
    const maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let index = 0; index <= 10; index++) {
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), maxScroll * index / 10);
      await settle(page, 120);
      const sample = await measure(page);
      result.pageSamples.push({ scrollY: sample.scrollY, horizontalOverflow: sample.horizontalOverflow, visibleHeadings: sample.visibleHeadings });
    }
    await page.screenshot({ path: path.join(outDir, `${name}-footer.png`) });

    result.inventory = await page.evaluate(() => ({
      h1Count: document.querySelectorAll('h1').length,
      brokenImages: [...document.images].filter(image => image.complete && image.naturalWidth === 0).map(image => image.currentSrc || image.src),
      unnamedButtons: [...document.querySelectorAll('button')].filter(button => !(button.getAttribute('aria-label') || button.textContent?.trim() || button.getAttribute('title'))).length,
      brokenAnchors: [...document.querySelectorAll('a[href^="#"]')].map(link => link.getAttribute('href')).filter(href => href && href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))),
      media: { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches },
    }));

    // Exercise visible in-page navigation and verify each destination exists.
    const links = await page.locator('header a[href^="#"]').evaluateAll(elements => elements.map(element => ({ href: element.getAttribute('href'), label: element.textContent?.trim() })));
    for (const link of links) {
      if (!link.href || link.href === '#') continue;
      const locator = page.locator(`header a[href=${JSON.stringify(link.href)}]`).first();
      if (!(await locator.isVisible())) continue;
      await locator.click();
      await settle(page, 1200);
      const position = await page.evaluate(href => {
        const element = document.getElementById(decodeURIComponent(href.slice(1)));
        return element ? { top: element.getBoundingClientRect().top, hash: location.hash, scrollY } : null;
      }, link.href);
      result.navigation.push({ ...link, destination: position });
    }
    result.hasFailures = result.interactions.some(interaction => !interaction.passed) || result.errors.length > 0 || result.badResponses.length > 0 || result.failedRequests.length > 0 || result.inventory.brokenImages.length > 0 || result.inventory.brokenAnchors.length > 0 || [...result.stages, ...result.pageSamples].some(stage => stage.horizontalOverflow);
    console.log(JSON.stringify({ name, failed: result.hasFailures, errors: result.errors, interactionFailures: result.interactions.filter(interaction => !interaction.passed), requests: result.failedRequests, inventory: result.inventory, screenshots: outDir }));
    await context.close();
  }
} finally {
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

const failures = report.scenarios.filter(scenario => scenario.hasFailures);
console.log(`QA report: ${path.join(outDir, 'report.json')}`);
if (failures.length) process.exitCode = 1;
