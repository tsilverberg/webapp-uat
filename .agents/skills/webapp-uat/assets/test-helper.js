/**
 * Web App UAT Helper — Playwright utilities with console/network error capture
 *
 * Generic test helper for any web application. Provides:
 * - Full console/network error capture
 * - Accessibility checks (WCAG 2.2 AA basics)
 * - i18n validation (broken keys, unresolved placeholders)
 * - Empty/placeholder data detection
 * - Screenshot management
 * - UAT report formatting
 */
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = process.env.UAT_SCREENSHOT_DIR || '/tmp/uat-screenshots';
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

/**
 * Set up full error capture on a Playwright page.
 * Returns collectors that accumulate errors as the page navigates.
 *
 * @param {import('playwright').Page} page
 * @param {Object} [options]
 * @param {string[]} [options.ignoreConsolePatterns] - Patterns to ignore in console warnings
 * @param {string[]} [options.ignoreNetworkPatterns] - URL patterns to ignore for network errors
 * @returns {{ console: Array, network: Array, pageErrors: Array, warnings: Array }}
 */
function setupErrorCapture(page, options = {}) {
  const {
    ignoreConsolePatterns = ['DevTools', 'Download the React DevTools'],
    ignoreNetworkPatterns = ['hot-update', '.woff', '.woff2', 'favicon', '__webpack_hmr', '/_next/webpack'],
  } = options;

  const errors = { console: [], network: [], pageErrors: [], warnings: [] };

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      errors.console.push({ url: page.url(), text, ts: new Date().toISOString() });
    } else if (msg.type() === 'warning') {
      const shouldIgnore = ignoreConsolePatterns.some(p => text.includes(p));
      if (!shouldIgnore) {
        errors.warnings.push({ url: page.url(), text: text.substring(0, 300), ts: new Date().toISOString() });
      }
    }
  });

  page.on('pageerror', err => {
    errors.pageErrors.push({
      url: page.url(),
      text: err.message,
      stack: err.stack?.substring(0, 500),
      ts: new Date().toISOString(),
    });
  });

  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (status >= 400) {
      const shouldIgnore = ignoreNetworkPatterns.some(p => url.includes(p));
      if (!shouldIgnore) {
        errors.network.push({
          reqUrl: url,
          status,
          page: page.url(),
          ts: new Date().toISOString(),
        });
      }
    }
  });

  return errors;
}

/**
 * Take a full-page screenshot with a descriptive name.
 *
 * @param {import('playwright').Page} page
 * @param {string} name - Descriptive name (used as filename)
 * @returns {Promise<string>} Path to the saved screenshot
 */
async function screenshot(page, name) {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`  📸 ${safeName}.png`);
  return filePath;
}

/**
 * Wait for page to settle — network idle + delay for client-side rendering.
 *
 * @param {import('playwright').Page} page
 * @param {number} [ms=2000] - Additional wait after network idle (for React/Vue/Angular rendering)
 */
async function waitForSettle(page, ms = 2000) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch (e) {
    // Timeout is OK — page may have websockets, SSE, or polling
  }
  await page.waitForTimeout(ms);
}

/**
 * Check for visible broken i18n keys on the page.
 * Detects common patterns from i18next, react-intl, vue-i18n, and angular i18n.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string[]>} List of broken i18n strings found
 */
async function checkBrokenI18n(page) {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const broken = [];

    // i18next: KEY 'some.key (LANG)' RETURNED AN OBJECT
    const i18nextRegex = /KEY\s+'[^']+\s*(\([A-Z]{2}\))?\s*'\s+RETURNED\s+AN?\s+OBJECT/gi;
    let match;
    while ((match = i18nextRegex.exec(body)) !== null) {
      broken.push(match[0]);
    }

    // Raw mustache/handlebars placeholders: {{variable}}
    const mustachePlaceholders = body.match(/\{\{[a-zA-Z_][a-zA-Z0-9_.]*\}\}/g);
    if (mustachePlaceholders) {
      broken.push(...mustachePlaceholders.map(p => `Unresolved placeholder: ${p}`));
    }

    // ICU message format placeholders: {variable}
    // Be selective — avoid false positives from JSON or code snippets
    const icuRegex = /(?<!\{)\{[a-zA-Z_][a-zA-Z0-9_]*\}(?!\})/g;
    const icuMatches = body.match(icuRegex);
    if (icuMatches) {
      // Filter out common false positives
      const filtered = icuMatches.filter(m =>
        !['{}', '{', '}'].includes(m) &&
        !m.match(/^\{(true|false|null|undefined)\}$/)
      );
      if (filtered.length > 0) {
        broken.push(...filtered.map(p => `Possible unresolved ICU placeholder: ${p}`));
      }
    }

    // Missing translation markers from common frameworks
    const missingPatterns = [
      /\[missing ".*?" translation\]/gi,     // ruby-i18n style
      /⚠️?\s*Missing translation/gi,         // custom markers
      /translation missing:/gi,               // rails
    ];
    for (const pattern of missingPatterns) {
      const matches = body.match(pattern);
      if (matches) {
        broken.push(...matches.map(m => `Missing translation: ${m}`));
      }
    }

    return broken;
  });
}

/**
 * Check basic accessibility (WCAG 2.2 AA) for current page.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Object>} Accessibility audit results
 */
async function checkA11y(page) {
  return page.evaluate(() => {
    const results = {};

    // Heading structure
    results.h1Count = document.querySelectorAll('h1').length;
    const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    results.headingCount = headings.length;
    results.headingOrder = headings.map(h => parseInt(h.tagName[1]));

    // Landmarks
    results.hasMain = !!document.querySelector('main, [role="main"]');
    results.hasNav = !!document.querySelector('nav[aria-label], nav[aria-labelledby], [role="navigation"][aria-label]');
    results.hasSkipLink = !!document.querySelector('a[href^="#"][class*="skip"], a[href="#main-content"], a[href="#main"], .skip-link, .skip-to-content');

    // Images
    const imgs = [...document.querySelectorAll('img')];
    results.totalImages = imgs.length;
    results.imgsWithoutAlt = imgs.filter(i => !i.hasAttribute('alt')).length;

    // Interactive elements
    results.divsWithOnClick = [...document.querySelectorAll('div[onclick], span[onclick], div[onClick], span[onClick]')].length;
    results.focusableCount = document.querySelectorAll(
      'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
    ).length;
    results.buttonsWithoutLabel = [...document.querySelectorAll('button')].filter(
      b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby') && !b.querySelector('img[alt], svg[aria-label]')
    ).length;

    // ARIA
    results.ariaLabelCount = document.querySelectorAll('[aria-label]').length;
    results.ariaLiveRegions = document.querySelectorAll('[aria-live]').length;

    // Forms
    const inputs = [...document.querySelectorAll('input:not([type="hidden"]), textarea, select')];
    results.totalFormFields = inputs.length;
    results.formFieldsWithoutLabel = inputs.filter(input => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
      const hasPlaceholder = input.getAttribute('placeholder');
      const wrappedInLabel = input.closest('label');
      return !hasLabel && !hasAriaLabel && !wrappedInLabel && !hasPlaceholder;
    }).length;

    return results;
  });
}

/**
 * Check if elements show placeholder/empty data.
 * Returns list of elements showing "---", "$0.00", "NaN", "undefined", etc.
 *
 * @param {import('playwright').Page} page
 * @param {Object} [options]
 * @param {string[]} [options.selectors] - CSS selectors to check (defaults to common data display elements)
 * @param {string[]} [options.suspiciousValues] - Values considered suspicious
 * @returns {Promise<Array<{tag: string, class: string, text: string}>>}
 */
async function checkEmptyData(page, options = {}) {
  const {
    selectors = ['td', 'dd', '[class*="value"]', '[class*="stat"]', '[class*="amount"]', '[class*="price"]', '[class*="total"]', '[class*="count"]', '[class*="number"]', '[data-testid]'],
    suspiciousValues = ['---', '—', 'NaN', 'undefined', 'null', '[object Object]', '$0', '$0.00', '0.00', 'N/A', 'loading...', 'Loading...'],
  } = options;

  return page.evaluate(({ selectors, suspiciousValues }) => {
    const suspicious = [];
    const selectorStr = selectors.join(', ');
    const cells = document.querySelectorAll(selectorStr);

    cells.forEach(el => {
      const text = el.textContent?.trim();
      if (text && suspiciousValues.includes(text)) {
        suspicious.push({
          tag: el.tagName.toLowerCase(),
          class: el.className?.toString().substring(0, 80) || '',
          text,
          testId: el.getAttribute('data-testid') || '',
        });
      }
    });
    return suspicious;
  }, { selectors, suspiciousValues });
}

/**
 * Check for horizontal overflow (broken responsive layout).
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{hasOverflow: boolean, documentWidth: number, viewportWidth: number}>}
 */
async function checkResponsiveOverflow(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const viewWidth = document.documentElement.clientWidth;
    return {
      hasOverflow: docWidth > viewWidth,
      documentWidth: docWidth,
      viewportWidth: viewWidth,
    };
  });
}

/**
 * Print a formatted UAT report section for one screen.
 *
 * @param {string} screenName
 * @param {Object<string, boolean>} checks - Map of check name → pass/fail
 * @param {{ console: Array, network: Array, pageErrors: Array, warnings: Array }} errors
 * @returns {{ pass: number, fail: number }}
 */
function printReport(screenName, checks, errors) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${screenName}`);
  console.log('═'.repeat(60));

  let pass = 0;
  let fail = 0;
  for (const [name, result] of Object.entries(checks)) {
    const status = result ? '✅' : '❌';
    console.log(`  ${status} ${name}`);
    result ? pass++ : fail++;
  }

  if (errors.console.length > 0) {
    console.log(`  ⚠️  Console errors: ${errors.console.length}`);
    errors.console.slice(-5).forEach(e => console.log(`     ❌ ${e.text.substring(0, 150)}`));
  }

  if (errors.network.length > 0) {
    console.log(`  ⚠️  Network errors: ${errors.network.length}`);
    errors.network.slice(-5).forEach(e => console.log(`     🔴 HTTP ${e.status}: ${e.reqUrl.substring(0, 120)}`));
  }

  console.log(`  Score: ${pass}/${pass + fail} checks passed`);
  return { pass, fail };
}

/**
 * Print the final UAT summary across all screens.
 *
 * @param {{ console: Array, network: Array, pageErrors: Array, warnings: Array }} errors
 * @param {Array<{ screen: string, pass: number, fail: number }>} screenResults
 */
function printSummary(errors, screenResults) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  UAT SUMMARY');
  console.log('═'.repeat(60));

  // Per-screen results
  if (screenResults.length > 0) {
    console.log('\n  Screen Results:');
    let totalPass = 0;
    let totalFail = 0;
    for (const r of screenResults) {
      const pct = Math.round((r.pass / (r.pass + r.fail)) * 100);
      const icon = r.fail === 0 ? '✅' : '⚠️';
      console.log(`    ${icon} ${r.screen}: ${r.pass}/${r.pass + r.fail} (${pct}%)`);
      totalPass += r.pass;
      totalFail += r.fail;
    }
    const totalPct = Math.round((totalPass / (totalPass + totalFail)) * 100);
    console.log(`\n  Overall: ${totalPass}/${totalPass + totalFail} checks passed (${totalPct}%)`);
  }

  // Error summary
  console.log(`\n  Console errors: ${errors.console.length}`);
  if (errors.console.length > 0) {
    const unique = [...new Set(errors.console.map(e => e.text.substring(0, 100)))];
    unique.slice(0, 10).forEach(e => console.log(`    ❌ ${e}`));
    if (unique.length > 10) console.log(`    ... and ${unique.length - 10} more`);
  }

  console.log(`  Network errors: ${errors.network.length}`);
  if (errors.network.length > 0) {
    const unique = [...new Set(errors.network.map(e => `HTTP ${e.status}: ${e.reqUrl.substring(0, 80)}`))];
    unique.slice(0, 10).forEach(e => console.log(`    🔴 ${e}`));
  }

  console.log(`  Page crashes: ${errors.pageErrors.length}`);
  console.log(`  Warnings: ${errors.warnings.length}`);
  console.log('═'.repeat(60));
}

module.exports = {
  setupErrorCapture,
  screenshot,
  waitForSettle,
  checkBrokenI18n,
  checkA11y,
  checkEmptyData,
  checkResponsiveOverflow,
  printReport,
  printSummary,
  SCREENSHOT_DIR,
};
