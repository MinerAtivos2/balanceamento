import asyncio
from playwright.async_api import async_playwright
import os

async def verify_auth_tabs():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Access the local server
        await page.goto("http://localhost:5000/docs/portfolio/index.html")

        # Trigger the modal with a reason (e.g. click Proventos)
        await page.click("#nav-dividends")

        # Wait for modal
        await page.wait_for_selector("#authModalOverlay", state="visible")

        # Screenshot "Seja Membro" tab (default for guest on restricted click)
        await page.screenshot(path="/home/jules/verification/tab_seja_membro_with_reason.png")

        # Switch to "Entrar" tab using ID
        await page.click("#tabLogin")
        await asyncio.sleep(0.5)

        # Screenshot "Entrar" tab
        await page.screenshot(path="/home/jules/verification/tab_entrar_with_reason.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_auth_tabs())
