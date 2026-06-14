import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1280, 'height': 1000})
        page = await context.new_page()

        path = os.path.abspath('docs/portfolio/index.html')
        await page.goto(f'file://{path}')

        # Accept cookies
        try:
            await page.click('button:has-text("Aceitar")', timeout=5000)
        except:
            pass

        # Wait for load
        await page.wait_for_selector('#loadingOverlay', state='hidden', timeout=10000)

        # Go to Resumo de Mercado
        await page.click('.nav-link[data-section="page-summary"]')
        await page.wait_for_selector('#gainersBody tr')

        # Wait a bit for sparklines to draw
        await asyncio.sleep(2)

        await page.screenshot(path='final_summary.png', full_page=True)

        # Go to News
        await page.click('.nav-link[data-section="news"]')
        await page.wait_for_selector('.news-card')

        await page.screenshot(path='final_news.png', full_page=True)

        await browser.close()
        print("Screenshots saved: final_summary.png, final_news.png")

if __name__ == '__main__':
    asyncio.run(run())
