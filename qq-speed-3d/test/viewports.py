import asyncio, json, time
from playwright.async_api import async_playwright
URL="http://127.0.0.1:8791/"
CASES=[("desktop-1280",1280,800,False),("iphone-se",375,667,True),("landscape",844,390,True),("iphone-15",393,852,True)]
async def run():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(args=["--use-angle=metal","--enable-gpu"])
        for label,w,h,m in CASES:
            kw={"viewport":{"width":w,"height":h}}
            if m: kw.update({"device_scale_factor":2,"is_mobile":True,"has_touch":True,
              "user_agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"})
            ctx=await b.new_context(**kw)
            page=await ctx.new_page()
            errs=[]
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.on("console", lambda m2: errs.append(m2.text) if m2.type=="error" else None)
            await page.goto(URL+"?v="+str(time.time()), wait_until="networkidle")
            await page.wait_for_function("window.__qq && window.__qq.ready", timeout=30000)
            await page.wait_for_timeout(900)
            await page.screenshot(path=f"test/vp-{label}-title.png")
            ov=await page.evaluate("({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,sh:document.documentElement.scrollHeight,ch:document.documentElement.clientHeight})")
            # start and race
            await page.click("#start-btn")
            await page.wait_for_function("window.__qq.state==='race'", timeout=6000)
            await page.wait_for_timeout(700)
            await page.screenshot(path=f"test/vp-{label}-race.png")
            rects=await page.evaluate("""()=>{const ids=['map-wrap','race-top','nitro-wrap','hud-btns','speedo','drift-meter'];const o={};for(const id of ids){const e=document.getElementById(id);const r=e.getBoundingClientRect();o[id]=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];}return o;}""")
            print(label, "overflow", ov, "errs", errs, "rects", json.dumps(rects))
            await ctx.close()
        await b.close()
asyncio.run(run())
