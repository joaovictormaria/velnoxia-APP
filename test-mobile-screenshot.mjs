import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.createContext({
    viewport: { width: 375, height: 812 }
  });
  const page = await context.newPage();
  
  try {
    await page.goto('http://localhost:5173/admin/cardapio', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'mobile-screenshot.png' });
    console.log('✅ Screenshot capturado em: mobile-screenshot.png (375x812 - iPhone)');
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await browser.close();
  }
})();
