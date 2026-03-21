import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 1200})

        # Navigate to the local server
        await page.goto('http://localhost:8000/index.html')

        # Click on Resumo do Mercado using ID
        await page.click('#nav-summary')

        # Wait for the Treemap to be rendered
        await page.wait_for_selector('canvas#marketTreemap')
        await asyncio.sleep(3)  # Wait for animations and data load

        # Take a screenshot of the page
        await page.screenshot(path='final_summary.png')

        # Hover over the treemap
        await page.mouse.move(600, 800)
        await asyncio.sleep(1)
        await page.screenshot(path='final_summary_tooltip.png')

        await browser.close()

asyncio.run(run())
