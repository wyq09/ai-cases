#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        for tag, vw, vh, q in [("desktop-high", 1440, 900, None), ("mobile-mid", 390, 844, None)]:
            kw = {"viewport": {"width": vw, "height": vh}}
            if tag.startswith("mobile"):
                kw["user_agent"] = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1"
            page = await (await b.new_context(**kw)).new_page()
            await page.goto("http://127.0.0.1:8734/", wait_until="networkidle")
            await page.wait_for_function("window.__fox && window.__fox.ready")
            await page.wait_for_timeout(1200)
            fps = await page.evaluate("""() => new Promise(res => {
              let n = 0; const t0 = performance.now();
              const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res(Math.round(n / 2)); };
              requestAnimationFrame(loop);
            })""")
            # 点击狐狸中央 → 应触发弹跳（scale 偏离 1）
            box = await page.evaluate("() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height*0.45]; }")
            await page.mouse.click(box[0], box[1])
            await page.wait_for_timeout(120)
            bounced = await page.evaluate("() => Math.abs(window.__fox.fox.group.scale.x - 1) > 0.005 || Math.abs(window.__fox.fox.group.position.y) > 0.001")
            await page.wait_for_timeout(1200)
            settled = await page.evaluate("() => Math.abs(window.__fox.fox.group.scale.x - 1) < 0.002")
            print(f"{tag}: fps={fps} pokeBounce={bounced} settled={settled}")
        await b.close()

asyncio.run(run())
