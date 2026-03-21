import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1280, 'height': 1000})

        # Navigate to the local server
        await page.goto('http://localhost:8000/index.html')

        # Click on Resumo do Mercado
        await page.click('text=Resumo do Mercado')

        # Wait for the Treemap to be rendered
        await page.wait_for_selector('canvas')
        await asyncio.sleep(2)  # Wait for animations

        # Take a screenshot of the Treemap section
        await page.screenshot(path='treemap_v2.png')

        # Hover over a block to trigger tooltip
        # We need to find the canvas and hover over it.
        # Since it's a treemap, we'll try to hover in the middle of a block.
        # Let's try to find ONCO3 which is visible in the first screenshot.
        # Its position seems to be around x=400, y=900 (relative to page)
        await page.mouse.move(400, 900)
        await asyncio.sleep(1)
        await page.screenshot(path='treemap_tooltip_v2.png')

        await browser.close()

asyncio.run(run())
