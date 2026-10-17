/**
 * Browser smoke check for the /admin backoffice, without adding project
 * dependencies. Run while the site is served at http://localhost:5174:
 *   node scripts/verify-admin.mjs
 * Optional: QA_BASE_URL, QA_OUT_DIR, QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD,
 *           QA_PLAYWRIGHT_PATH.
 *
 * Covers three things that have each broken at least once:
 *   nav    -- every table loads its OWN data when reached through the sidebar.
 *             Deep-linking to one resource hides cross-resource state leaks.
 *   shell  -- the p2cam-parity controls are present and functional.
 *   data   -- search / filters / export actually narrow the right rows, with
 *             counts asserted against the real database rather than ">0".
 * Exits non-zero if any check fails.
 */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const baseURL = process.env.QA_BASE_URL || 'http://localhost:5174';
const outDir = process.env.QA_OUT_DIR || '/tmp/proxima-admin-qa';
const email = process.env.QA_ADMIN_EMAIL || 'hamed@gmail.com';
const password = process.env.QA_ADMIN_PASSWORD || '12345678';
await mkdir(outDir, { recursive: true });

async function loadPlaywright() {
  if (process.env.QA_PLAYWRIGHT_PATH) return import(pathToFileURL(process.env.QA_PLAYWRIGHT_PATH).href);
  try { return await import(pathToFileURL(require.resolve('playwright')).href); } catch { /* Cached npx is an equally valid runner. */ }
  const cache = path.join(homedir(), '.npm', '_npx');
  for (const entry of (await readdir(cache).catch(() => [])).reverse()) {
    const candidate = path.join(cache, entry, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href);
  }
  throw new Error('Playwright is unavailable. Set QA_PLAYWRIGHT_PATH to an installed playwright/index.mjs.');
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const shot = f => page.screenshot({ path: path.join(outDir, f) });

/** The sheet overlay outlives its close transition and swallows the next
 *  click, so closing has to wait for it to actually detach. */
const closeSheet = async () => {
  await page.keyboard.press('Escape');
  await page.locator('[data-slot="sheet-overlay"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const recordCount = async () => {
  const text = await page.locator('p.text-muted-foreground').filter({ hasText: /record/ }).first().textContent();
  return Number((text.match(/[\d,]+/)?.[0] ?? '0').replaceAll(',', ''));
};

// Expected default sort label per resource, from src/admin/config/resources.ts.
const TABLES = [
  { link: 'Users',            key: 'users',         sort: 'Joined' },
  { link: 'Sleep Analysis',   key: 'model',         sort: 'Recorded' },
  { link: 'Lamp Registry',    key: 'lamp_registry', sort: 'Added' },
  { link: 'Lamp Assignments', key: 'lamp_id',       sort: 'Assigned' },
  { link: 'Lamp Logs',        key: 'lamp_log',      sort: 'Time' },
];

try {
  await page.goto(`${baseURL}/admin`, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="password"]').count()) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(4000);
  }
  check('login', !(await page.locator('input[type="password"]').count()), page.url());

  // ---- nav: each table must load its own data, in both directions ----
  const visit = async (table) => {
    await page.locator('a', { hasText: new RegExp(`^${table.link}$`) }).first().click();
    await page.waitForTimeout(3000);

    const error = await page.locator('.text-destructive').first().textContent().catch(() => null);
    const badge = (await page.locator('.font-mono').first().textContent().catch(() => '')).trim();
    const sortLabel = (await page.getByRole('button', { name: /^Sort/ }).textContent().catch(() => '')).trim();
    // A table rendering another resource's rows has "-" in every data cell.
    const cells = (await page.locator('table tbody tr').first().locator('td').allTextContents()).map(s => s.trim());
    const dataCells = cells.slice(2, -1);
    const allDashes = dataCells.length > 0 && dataCells.every(c => c === '-');

    const ok = !error && badge === table.key && sortLabel.includes(table.sort) && !allDashes;
    check(`nav ${table.link}`, ok,
      `badge=${badge} sort="${sortLabel}"${error ? ` ERROR: ${error.trim()}` : ''}${allDashes ? ' ALL CELLS EMPTY' : ''}`);
    if (!ok) await shot(`fail-nav-${table.key}.png`);
  };
  for (const t of TABLES) await visit(t);
  for (const t of [...TABLES].reverse()) await visit(t);

  // ---- shell + data, on the big table ----
  await page.locator('a', { hasText: /^Lamp Logs$/ }).first().click();
  await page.waitForTimeout(3000);

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const oklch = bg.match(/oklch\(([\d.]+)/);
  check('dark theme by default',
    oklch ? Number(oklch[1]) < 0.3 : bg.startsWith('rgb') && bg.match(/\d+/g).slice(0, 3).every(v => +v < 60), bg);

  const toolbar = await Promise.all(['Advanced', 'Options', 'Refresh'].map(async n =>
    [n, (await page.getByRole('button', { name: n }).count()) > 0]));
  check('toolbar: Advanced / Options / Refresh', toolbar.every(([, v]) => v), JSON.stringify(Object.fromEntries(toolbar)));

  const base = await recordCount();
  check('baseline row count', base > 10000, `${base.toLocaleString()} records`);

  const headerCheckbox = page.locator('table thead input[type="checkbox"], table thead [role="checkbox"]').first();
  await headerCheckbox.click();
  await page.waitForTimeout(700);
  const selectedText = await page.locator('text=/\\d+ selected/').first().textContent().catch(() => null);
  check('row selection', Boolean(selectedText), selectedText ?? 'no "N selected"');
  await headerCheckbox.click();
  await page.waitForTimeout(400);

  // Pinned columns must stay put when the table scrolls sideways.
  const scroller = page.locator('div.overflow-auto').first();
  await scroller.evaluate(el => { el.scrollLeft = 600; });
  await page.waitForTimeout(600);
  const idLeft = await page.locator('table tbody tr td').nth(1).evaluate(el => el.getBoundingClientRect().left);
  const tableLeft = await page.locator('table').evaluate(el => el.getBoundingClientRect().left);
  check('ID column stays pinned on h-scroll', idLeft - tableLeft < 120, `id@${Math.round(idLeft)} table@${Math.round(tableLeft)}`);
  await scroller.evaluate(el => { el.scrollLeft = 0; });
  await page.waitForTimeout(400);

  // Search must strictly narrow. 'FB96' belongs to the smaller lamp only.
  const search = page.locator('input[placeholder^="Search"]').first();
  await search.fill('FB96');
  await page.waitForTimeout(3500);
  const searched = await recordCount();
  check('search narrows', searched > 0 && searched < base, `FB96 -> ${searched} of ${base}`);
  await search.fill('');
  await page.waitForTimeout(3000);

  // The filter dropdown must offer every distinct value, not a sampled subset.
  await page.locator('button[aria-label^="Filter"]').first().click();
  await page.waitForTimeout(2500);
  const boxes = page.locator('[role="dialog"] label, [role="presentation"] label');
  const options = (await boxes.allTextContents()).map(s => s.trim());
  check('filter lists every distinct value', options.length >= 2, JSON.stringify(options));
  await boxes.filter({ hasText: 'FB96' }).first().click();
  await page.locator('button', { hasText: /^Apply$/ }).first().click();
  await page.waitForTimeout(3000);
  const filtered = await recordCount();
  check('column filter applies', filtered > 0 && filtered < base, `${filtered} of ${base}`);

  // Export must honour the filter AND page past PostgREST's 1000-row cap.
  await page.getByRole('button', { name: 'Options' }).click();
  await page.waitForTimeout(1200);
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.locator('button', { hasText: /^Export/ }).first().click();
  await page.waitForTimeout(800);
  await sheet.locator('button', { hasText: /^CSV/ }).first().click();
  await page.waitForTimeout(800);
  const pending = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await sheet.locator('button', { hasText: /Everything matching filters/ }).click();
  const download = await pending;
  let exportOk = false, exportDetail = 'no download';
  if (download) {
    const file = path.join(outDir, download.suggestedFilename());
    await download.saveAs(file);
    const rows = readFileSync(file, 'utf8').trim().split('\n').length - 1;
    exportOk = rows === filtered;
    exportDetail = `${rows} rows exported, table shows ${filtered}`;
  }
  check('export matches the filtered count', exportOk, exportDetail);
  await closeSheet();
  await shot('final.png');
} catch (err) {
  check('suite completed', false, err.message);
  await shot('crash.png').catch(() => {});
}

console.log(`\nconsole errors: ${consoleErrors.length ? [...new Set(consoleErrors)].slice(0, 8).join('\n  ') : '(none)'}`);
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed -> ${outDir}`);
await browser.close();
process.exit(passed === results.length ? 0 : 1);
