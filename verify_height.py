import asyncio
from playwright.async_api import async_playwright

async def verify_chart_height():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Iniciar o servidor local (presumindo que o server.py esteja rodando na porta 5000)
        # Se não estiver, precisaremos rodar
        await page.goto("http://localhost:5000/docs/portfolio/index.html?ticker=TOKY3")

        # Aguardar a transição e o gráfico carregar (app.js espera 800ms + 450ms)
        await page.wait_for_timeout(3000)

        # Verificar dimensões do container do gráfico
        dimensions = await page.evaluate("""() => {
            const container = document.getElementById('tradingview_chart_spa');
            const card = container.parentElement;
            const rect = card.getBoundingClientRect();
            return {
                cardHeight: rect.height,
                containerHeight: container.offsetHeight,
                windowHeight: window.innerHeight,
                display: getComputedStyle(card).display,
                minHeight: getComputedStyle(card).minHeight
            };
        }""")

        print(f"Dimensions: {dimensions}")

        await page.screenshot(path="/home/jules/verification/debug_height.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_chart_height())
