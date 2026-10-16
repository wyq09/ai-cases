#!/usr/bin/env python3
"""对线上地址做一次真实渲染验收：零报错 + ready + 截图。"""
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(args=["--use-angle=metal", "--enable-gpu"])
        for tag, kw in [
            ("live-desktop", dict(viewport={"width": 1280, "height": 860})),
            ("live-mobile", dict(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1")),
        ]:
            page = await (await b.new_context(**kw)).new_page()
            errs = []
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            await page.goto("https://case.youyongai.com/fluffy-fox/", wait_until="networkidle")
            await page.wait_for_function("window.__fox && window.__fox.ready === true", timeout=20000)
            await page.wait_for_timeout(1800)
            fps = await page.evaluate("() => new Promise(res => { let n=0,t0=performance.now(); const l=()=>{n++;performance.now()-t0<1500?requestAnimationFrame(l):res(Math.round(n/1.5))}; requestAnimationFrame(l); })")
            await page.screenshot(path=f"test/{tag}.png")
            print(f"{tag}: errors={errs or 'NONE'} fps={fps}")
        await b.close()

asyncio.run(run())
