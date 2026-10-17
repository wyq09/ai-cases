#!/usr/bin/env python3
"""快速截图：python3 test/shot.py [desktop|mobile] [out.png]"""
import asyncio, sys, time
from playwright.async_api import async_playwright

which = sys.argv[1] if len(sys.argv) > 1 else "desktop"
out = sys.argv[2] if len(sys.argv) > 2 else f"test/{which}.png"
URL = "http://127.0.0.1:8791/"

async def run():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-angle=metal", "--enable-gpu"])
        if which == "mobile":
            ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                is_mobile=True, has_touch=True,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
        else:
            ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(URL + "?v=" + str(time.time()), wait_until="networkidle")
        await page.wait_for_function("window.__qq && window.__qq.ready", timeout=30000)
        await page.click("#start-btn")
        await page.wait_for_function("window.__qq.state === 'race'", timeout=8000)
        await page.wait_for_timeout(1200)
        await page.screenshot(path=out)
        print("clean ->" if not errs else f"ERRORS: {errs}", out)
        await b.close()

asyncio.run(run())
