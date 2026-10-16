#!/usr/bin/env python3
"""pumpkin-fox 验收：双视口截图 + console 零报错 + 交互冒烟。"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:8734/"
OUT = "test"

CHECKS_JS = """
() => {
  const f = window.__fox;
  if (!f || !f.ready) return { ok: false, reason: 'no __fox' };
  const shells = f.furs.map(x => x.shells);
  return {
    ok: true,
    shellsTotal: shells.reduce((a, b) => a + b, 0),
    furTargets: f.fox.furTargets.length,
    meshes: 0,
    drawRange: null,
    params: f.params,
  };
}
"""

async def shoot(page, path):
    await page.screenshot(path=path)
    print(f"shot -> {path}")

async def run():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        results = {}
        for name, vw, vh, ua in [
            ("desktop", 1440, 900, None),
            ("mobile", 390, 844,
             "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
        ]:
            ctx_args = {"viewport": {"width": vw, "height": vh}}
            if ua: ctx_args["user_agent"] = ua
            ctx = await browser.new_context(**ctx_args)
            page = await ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type in ("error",) else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(URL, wait_until="networkidle")
            try:
                await page.wait_for_function("window.__fox && window.__fox.ready === true", timeout=15000)
            except Exception:
                errors.append("TIMEOUT waiting __fox.ready")
            await page.wait_for_timeout(2500)
            info = await page.evaluate(CHECKS_JS)
            results[name] = {"info": info, "errors": errors}
            await shoot(page, f"{OUT}/{name}.png")
            # 交互冒烟：面板开合 + 拖滑杆 + 切画质（桌面侧栏常开无 toggle，直接验可见性）
            if vw < 900:
                await page.click("#panel-toggle")
                await page.wait_for_timeout(600)
                ok_panel = await page.evaluate("document.getElementById('panel').classList.contains('open')")
            else:
                ok_panel = await page.evaluate(
                    "getComputedStyle(document.getElementById('panel')).display !== 'none' && "
                    "document.getElementById('panel').getBoundingClientRect().width > 200")
            await shoot(page, f"{OUT}/{name}-panel.png")
            await page.evaluate("""() => {
              const s = document.getElementById('fur-length');
              s.value = 2.0; s.dispatchEvent(new Event('input'));
              const w = document.getElementById('wind-strength');
              w.value = 1.4; w.dispatchEvent(new Event('input'));
            }""")
            await page.wait_for_timeout(900)
            ok_params = await page.evaluate("window.__fox.params['fur-length'] === 2.0 && window.__fox.params['wind-strength'] === 1.4")
            await page.evaluate("document.querySelector('#q-low').click()")
            await page.wait_for_timeout(800)
            low_shells = await page.evaluate("window.__fox.furs.reduce((a,f)=>a+f.shells,0)")
            await page.evaluate("document.querySelector('#q-high').click()")
            await page.wait_for_timeout(800)
            high_shells = await page.evaluate("window.__fox.furs.reduce((a,f)=>a+f.shells,0)")
            await page.evaluate("document.getElementById('screenshot') && 0")  # noop
            results[name].update({
                "panelOpens": ok_panel, "sliderApplies": ok_params,
                "lowShells": low_shells, "highShells": high_shells,
            })
            await shoot(page, f"{OUT}/{name}-after.png")
            await ctx.close()
        await browser.close()
        print(json.dumps(results, ensure_ascii=False, indent=2))
        bad = [k for k, v in results.items() if v["errors"]]
        sys.exit(1 if bad else 0)

asyncio.run(run())
