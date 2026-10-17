#!/usr/bin/env python3
"""Full acceptance: desktop+mobile, menu/race/drift/nitro/result, fps, console errors."""
import asyncio, json, time, sys
from playwright.async_api import async_playwright

URL = "http://127.0.0.1:8791/"

def check(name, cond, detail=""):
    return {"name": name, "pass": bool(cond), "detail": detail}

async def shoot(page, path):
    await page.screenshot(path=path)
    print("  shot ->", path)

async def run():
    results = {}
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--use-angle=metal", "--enable-gpu"])
        for label, vw, vh, mobile in [
            ("desktop", 1440, 900, False),
            ("mobile", 390, 844, True),
        ]:
            ctx_args = {"viewport": {"width": vw, "height": vh}}
            if mobile:
                ctx_args.update({
                    "device_scale_factor": 2, "is_mobile": True, "has_touch": True,
                    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                })
            ctx = await browser.new_context(**ctx_args)
            page = await ctx.new_page()
            errs = []
            page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(str(e)))
            await page.goto(URL + "?v=" + str(time.time()), wait_until="networkidle")
            try:
                await page.wait_for_function("window.__qq && window.__qq.ready", timeout=30000)
                ready = True
            except Exception:
                ready = False
            await page.wait_for_timeout(1500)
            checks = [check("boot", ready and not errs, str(errs))]
            checks.append(check("touch_class", (await page.evaluate("document.body.classList.contains('touch')")) == mobile, ""))
            # layout overflow check
            overflow = await page.evaluate("""() => {
              const de = document.documentElement;
              return { sw: de.scrollWidth, cw: de.clientWidth, sh: de.scrollHeight, ch: de.clientHeight };
            }""")
            checks.append(check("no_overflow", overflow["sw"] <= overflow["cw"] + 1 and overflow["sh"] <= overflow["ch"] + 1, str(overflow)))
            await shoot(page, f"test/{label}-title.png")

            # start race via real UI
            await page.click("#start-btn")
            await page.wait_for_timeout(700)
            state = await page.evaluate("window.__qq.state")
            checks.append(check("start_click", state in ("countdown", "race"), state))
            await shoot(page, f"test/{label}-countdown.png")
            # wait for go
            await page.wait_for_function("window.__qq.state === 'race'", timeout=6000)
            await page.wait_for_timeout(1600)
            checks.append(check("race_running", (await page.evaluate("window.__qq.state")) == "race", ""))
            await shoot(page, f"test/{label}-race.png")

            # fps sample
            fps = await page.evaluate("""async () => {
              let n = 0; const t0 = performance.now();
              await new Promise(res => {
                function f(){ n++; if (performance.now() - t0 > 1500) res(); else requestAnimationFrame(f); }
                requestAnimationFrame(f);
              });
              return Math.round(n / ((performance.now()-t0)/1000));
            }""")
            checks.append(check("fps_gt_30", fps > 30, f"{fps}fps"))
            # drift via touch/keyboard
            await page.evaluate("window.__qq.placeProgress(300, 5.0); window.__qq.setSpeed(30)")
            await page.wait_for_timeout(250)
            if mobile:
                await page.evaluate("window.__qq.input.touch.left = true; window.__qq.input.driftPresses++; window.__qq.input.touch.drift = true")
            else:
                await page.keyboard.down("ArrowLeft")
                await page.wait_for_timeout(100)
                await page.keyboard.down("Shift")
            await page.wait_for_timeout(500)
            d = await page.evaluate("window.__qq.debug()")
            checks.append(check("drift_charges", d["driftCharge"] > 0.3 and d["drifting"], json.dumps({k: d[k] for k in ('driftCharge', 'drifting', 'speed', 'offset')})))
            await shoot(page, f"test/{label}-drift.png")
            if mobile:
                await page.evaluate("window.__qq.input.touch.drift = false; window.__qq.input.touch.left = false")
            else:
                await page.keyboard.up("Shift"); await page.keyboard.up("ArrowLeft")
            await page.wait_for_timeout(90)
            d2 = await page.evaluate("window.__qq.debug()")
            checks.append(check("boost_after_release", d2["boost"] > 0.2 and d2["nitro"] > 0.2, json.dumps({k: d2[k] for k in ('drifting', 'boost', 'nitroActive', 'nitro')})))
            # double boost: tap Shift again inside the window
            await page.evaluate("window.__qq.setTestDrive({steer:0, drift:true})")
            await page.wait_for_timeout(60)
            await page.evaluate("window.__qq.setTestDrive({steer:0, drift:false})")
            await page.wait_for_timeout(80)
            d2b = await page.evaluate("window.__qq.debug()")
            checks.append(check("double_boost", d2b["boost"] > 0.25 and d2b["doubleWindow"] <= 0, json.dumps({k: d2b[k] for k in ('boost', 'doubleWindow', 'nitro')})))
            await page.evaluate("window.__qq.setTestDrive(null)")
            # nitro
            await page.evaluate("window.__qq.setNitro(3); window.__qq.setSpeed(50); window.__qq.input.manual = {steer:0, nitro:true}")
            await page.wait_for_timeout(700)
            d3 = await page.evaluate("window.__qq.debug()")
            checks.append(check("nitro_consumed", d3["nitro"] < 3 and d3["nitroActive"] > 0, json.dumps({k: d3[k] for k in ('nitro', 'nitroActive')})))
            await page.evaluate("window.__qq.input.manual = null")
            await shoot(page, f"test/{label}-nitro.png")
            # finish via progress teleport near the line
            await page.evaluate("window.__qq.placeProgress(window.__qq.track.length * 2.972, 0)")
            await page.wait_for_timeout(500)
            await page.wait_for_function("window.__qq.state === 'result'", timeout=12000)
            saved = await page.evaluate("JSON.parse(localStorage.getItem('qqspeed3d.save.v1')||'{}')")
            checks.append(check("result_and_save", saved.get("races", 0) >= 1 and saved.get("coins", 0) > 0, str(saved)))
            await page.wait_for_timeout(700)
            await shoot(page, f"test/{label}-result.png")
            # restart button
            await page.click("#again-btn")
            await page.wait_for_timeout(600)
            checks.append(check("restart", (await page.evaluate("window.__qq.state")) == "countdown", ""))
            # pause
            await page.wait_for_function("window.__qq.state === 'race'", timeout=6000)
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
            paused = await page.evaluate("window.__qq.paused")
            pauseVisible = await page.evaluate("document.getElementById('pause-screen').classList.contains('show')")
            checks.append(check("pause", paused and pauseVisible, ""))
            await shoot(page, f"test/{label}-pause.png")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
            checks.append(check("resume", not (await page.evaluate("window.__qq.paused")), ""))
            await page.wait_for_timeout(300)
            errs_final = await page.evaluate("window.__qq.errors")
            checks.append(check("no_console_errors", len(errs) == 0 and len(errs_final) == 0, str(errs + errs_final)))
            results[label] = checks
            await ctx.close()
        await browser.close()
    print(json.dumps(results, ensure_ascii=False, indent=2))
    failed = [f"{k}:{c['name']}" for k, v in results.items() for c in v if not c["pass"]]
    print("FAILED:", failed if failed else "none")
    sys.exit(1 if failed else 0)

asyncio.run(run())
