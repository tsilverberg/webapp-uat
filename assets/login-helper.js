/**
 * Interactive Login Helper — opens a headed browser for manual login.
 * Saves the authenticated browser state to a JSON file for reuse in headless UAT.
 *
 * Usage:
 *   node assets/login-helper.js [base-url] [output-path]
 *
 * Examples:
 *   node assets/login-helper.js
 *   node assets/login-helper.js http://localhost:3000
 *   node assets/login-helper.js http://localhost:3000 /tmp/my-auth.json
 */
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const OUTPUT_PATH = process.argv[3] || process.env.UAT_AUTH_STATE || '/tmp/uat-auth-state.json';

async function main() {
  console.log(`\n🔐 Login Helper`);
  console.log(`   URL: ${BASE_URL}`);
  console.log(`   State will be saved to: ${OUTPUT_PATH}`);
  console.log(`\n   Log in manually in the browser window, then press Enter here.\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(BASE_URL);

  // Wait for user to press Enter in the terminal
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
  });

  // Save browser state (cookies, localStorage, sessionStorage)
  await context.storageState({ path: OUTPUT_PATH });
  console.log(`\n✅ Auth state saved to ${OUTPUT_PATH}`);
  console.log(`   Use in UAT: storageState: '${OUTPUT_PATH}'`);

  await browser.close();
}

main().catch(err => {
  console.error('Login helper failed:', err.message);
  process.exit(1);
});
