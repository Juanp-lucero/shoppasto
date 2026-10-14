import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const demoMode = process.argv.includes('--demo');
let runtimeConfig;

if (demoMode) {
  runtimeConfig = { demoMode: true };
} else {
  const rawBaseUrl = process.env.SHOPPASTO_API_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw new Error('Define SHOPPASTO_API_BASE_URL as the HTTPS API URL ending in /api before building for Vercel.');
  }

  let apiBaseUrl;
  try {
    const parsed = new URL(rawBaseUrl);
    const path = parsed.pathname.replace(/\/+$/, '');
    if (parsed.protocol !== 'https:' || !path.endsWith('/api') || parsed.search || parsed.hash) {
      throw new Error();
    }
    apiBaseUrl = parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('SHOPPASTO_API_BASE_URL must be an HTTPS URL ending in /api, without a query string or fragment.');
  }
  runtimeConfig = { apiBaseUrl, demoMode: false };
}

const outputPath = fileURLToPath(new URL('../dist/frontend/browser/runtime-config.js', import.meta.url));
const contents = `window.__SHOPPASTO_CONFIG__ = Object.freeze(${JSON.stringify(runtimeConfig)});\n`;
await writeFile(outputPath, contents, 'utf8');
console.log(`Wrote ShopPasto ${demoMode ? 'demo' : 'API'} runtime configuration.`);
