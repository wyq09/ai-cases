#!/usr/bin/env python3
import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as pw:
        for tag, args in [("swiftshader", []), ("real-gpu", ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"])]:
            b = await pw.chromium.launch(args=args)
            page = await (await b.new_context(viewport={"width": 1280, "height": 860})).new_page()
            await page.goto("http://127.0.0.1:8734/", wait_until="networkidle")
            await page.wait_for_function("window.__fox && window.__fox.ready")
            await page.wait_for_timeout(1200)
            info = await page.evaluate("""async () => {
              const gl = document.querySelector('canvas').getContext('webgl2') || document.querySelector('canvas').getContext('webgl');
              const dbg = gl.getExtension('WEBGL_debug_renderer_info');
              const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'n/a';
              const fps = await new Promise(res => {
                let n = 0; const t0 = performance.now();
                const loop = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(loop) : res(Math.round(n / 2)); };
                requestAnimationFrame(loop);
              });
              return { renderer: String(renderer).slice(0, 60), fps };
            }""")
            print(tag, info)
            await b.close()

asyncio.run(run())
