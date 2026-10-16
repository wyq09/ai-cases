#!/usr/bin/env python3
"""快速单视口截图：python3 shot.py desktop|mobile [out.png]"""
import asyncio, sys
from playwright.async_api import async_playwright

which = sys.argv[1] if len(sys.argv) > 1 else "desktop"
out = sys.argv[2] if len(sys.argv) > 2 else f"test/quick-{which}.png"

async def run():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        if which == "mobile":
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        else:
            ctx = await b.new_context(viewport={"width": 1280, "height": 860})
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto("http://127.0.0.1:8734/", wait_until="networkidle")
        await page.wait_for_function("window.__fox && window.__fox.ready")
        await page.wait_for_timeout(1800)
        await page.screenshot(path=out)
        if errs: print("ERRORS:", errs)
        else: print("clean ->", out)
        await b.close()

asyncio.run(run())
