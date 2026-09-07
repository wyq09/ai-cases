import "./style.css";
import "./immersive.css";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { JiaobeiPhysics } from "./physics.js";
import { TrayView } from "./view.js";
const $ = (s) => document.querySelector(s);
const stage = $("#stage"),
  throwButton = $("#throw"),
  shareButton = $("#share");
stage.append($(".result"), $("#mobile-wish"), shareButton);
stage.before(throwButton);
stage.setAttribute("role", "region");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const outcomes = {
  undecided: {
    title: "未定",
    subtitle: "红筊未稳，再请一杯。",
    description: "筊杯侧立、相倚或仍未停稳，本次不作判读。请重新掷杯。",
    faces: "暂未成筊 · 请再掷一杯",
  },
  sheng: {
    title: "圣筊",
    subtitle: "心意获允，安心向前。",
    description: "一平一凸，传统上表示允准。愿你所念有回应，所行皆坦途。",
    faces: "一平一凸 · 心意获允",
  },
  xiao: {
    title: "笑筊",
    subtitle: "心事再说，答案不急。",
    description:
      "两平朝上，传统上表示未明确答复。静一静，把心中所问说得更清楚。",
    faces: "两平朝上 · 再说清心意",
  },
  yin: {
    title: "阴筊",
    subtitle: "缓一缓，也是一种回应。",
    description: "两凸朝上，传统上表示不允。换个时机，或重新想想下一步。",
    faces: "两凸朝上 · 暂缓而行",
  },
};
let renderer,
  scene,
  camera,
  cups = [],
  busy = false,
  ready = false,
  animation = null,
  physics,
  previousFrame = null,
  last = null,
  chargeStart = null,
  sound = false,
  audioContext,
  shareURL,
  needsRender = true,
  liftFrom = [],
  liftTo = [];
let records = [];
try {
  const data = JSON.parse(localStorage.getItem("hupi-records") || "[]");
  records = Array.isArray(data)
    ? data
        .filter(
          (r) =>
            r &&
            outcomes[r.kind] &&
            typeof r.wish === "string" &&
            typeof r.date === "string",
        )
        .slice(0, 20)
    : [];
} catch {}
function count() {
  $("#history-count").textContent = String(records.length).padStart(2, "0");
}
count();
function toast(text) {
  $("#toast").textContent = text;
  $("#toast").classList.add("visible");
  setTimeout(() => $("#toast").classList.remove("visible"), 3000);
}
function openDialog(html) {
  $("#dialog-body").innerHTML = html;
  $("#dialog").showModal();
}
$(".close").onclick = () => $("#dialog").close();
$("#dialog").onclick = (e) => {
  if (e.target === $("#dialog")) {
    const r = $("#dialog").getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      $("#dialog").close();
  }
};
const rules = () =>
  openDialog(
    `<span class="small-label">闽 南 民 俗</span><h2>红筊落地，读一份心意。</h2><p>掷筊（jiǎo），闽南日常也称“掷杯”。一对半月形筊杯，各有一个平面和一个凸面。</p><ol><li>静心，默念身份与想问的事；一次问一件能明确回答的事。</li><li>双手捧起筊杯，诚心说明，再向地面掷下。</li><li>待筊杯停稳，按朝上的两面判读。</li></ol><ul><li><b>圣筊：</b>一平一凸，表示允准。</li><li><b>笑筊：</b>两平朝上，表示未明答，可重新说明。</li><li><b>阴筊：</b>两凸朝上，表示不允，可暂缓。</li></ul><p>本页采用单次判读，不把“连续三次圣筊”设为通用规则。各地庙宇的仪式与解释可能不同，请以当地习惯为准。</p><p>这里是民俗互动体验：筊杯由刚体引擎计算重力、翻转、碰撞和摩擦，停稳后按实际朝向判读；不预设结果，也不代表真实器物的概率。心事与筊记只保存在本机。</p><p>参考：<a href="https://www.sunfong.org.tw/?act=menuinfo&ml_id=20220720011" target="_blank" rel="noopener">三凤宫 · 掷筊程序 ↗</a>、<a href="https://tcmb.culture.tw/zh-tw/detail?id=17120007177&indexCode=MOCCOLLECTIONS" target="_blank" rel="noopener">国家文化记忆库 · 筊杯 ↗</a></p>`,
  );
$("#rules-open").onclick = rules;
$("#more-rules").onclick = rules;
$("#history-open").onclick = () => {
  openDialog(
    '<span class="small-label">留 在 此 刻</span><h2>我的筊记</h2><p>最近 20 次心意，只保存在这台设备。</p><div id="history-list"></div>',
  );
  const list = $("#history-list");
  if (!records.length) {
    list.textContent = "还没有筊记，先为心中所念掷一杯吧。";
    return;
  }
  records.forEach((r) => {
    const el = document.createElement("div");
    el.className = "history-item";
    const strong = document.createElement("strong");
    strong.textContent =
      outcomes[r.kind].title + " · " + outcomes[r.kind].subtitle;
    const p = document.createElement("p");
    p.textContent = r.wish || "默念的心事，愿有回响。";
    const small = document.createElement("small");
    small.textContent = new Date(r.date).toLocaleString("zh-CN");
    el.append(strong, p, small);
    list.append(el);
  });
};
$("#wish").oninput = () =>
  ($("#char-count").textContent = `${$("#wish").value.length} / 80`);
document.querySelectorAll("[data-wish]").forEach(
  (b) =>
    (b.onclick = () => {
      $("#wish").value = b.dataset.wish;
      $("#wish").oninput();
    }),
);
const wishFields = $(".wish-fields"),
  wishAnchor = document.createComment("wish form");
wishFields.before(wishAnchor);
$("#mobile-wish").onclick = () => {
  if (busy) return;
  $("#dialog-body").replaceChildren(wishFields);
  $("#dialog").showModal();
};
$("#dialog").addEventListener("close", () => {
  if (wishFields.parentElement === $("#dialog-body"))
    wishAnchor.after(wishFields);
  $("#mobile-wish span").textContent = "心愿";
});
$("#sound").onclick = () => {
  sound = !sound;
  $("#sound").setAttribute("aria-pressed", String(sound));
  $("#sound").setAttribute("aria-label", sound ? "关闭音效" : "开启音效");
  $("#sound span").textContent = sound ? "开" : "关";
  if (sound) {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
  }
};
function knock(strength = 0.5) {
  if (!sound || !audioContext) return;
  const o = audioContext.createOscillator(),
    g = audioContext.createGain();
  o.type = "triangle";
  o.frequency.setValueAtTime(240 + strength * 180, audioContext.currentTime);
  o.frequency.exponentialRampToValueAtTime(75, audioContext.currentTime + 0.13);
  g.gain.setValueAtTime(strength * 0.18, audioContext.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.16);
  o.connect(g).connect(audioContext.destination);
  o.start();
  o.stop(audioContext.currentTime + 0.18);
}
function texture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#c8bba0";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 23;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 28000; i++) {
    ctx.fillStyle = `rgba(${rnd() > 0.5 ? "255,249,227" : "79,65,45"},${rnd() * 0.09})`;
    ctx.fillRect(rnd() * 512, rnd() * 512, rnd() * 2 + 1, rnd() * 2 + 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  stage.append(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "button");
  renderer.domElement.setAttribute("aria-label", "轻触筊杯场景掷筊");
  renderer.domElement.addEventListener("click", () => throwCups());
  renderer.domElement.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      throwCups();
    }
  });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 8.8, 10.8);
  camera.lookAt(0, 0.3, 0);
  const pmrem = new THREE.PMREMGenerator(renderer),
    env = new RoomEnvironment();
  scene.environment = pmrem.fromScene(env, 0.04).texture;
  env.dispose();
  pmrem.dispose();
  scene.environmentIntensity = 0.65;
  scene.add(new THREE.HemisphereLight(0xfff6df, 0x8b7960, 1.6));
  const sun = new THREE.DirectionalLight(0xffedd3, 2.8);
  sun.position.set(-4, 8, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0001;
  sun.shadow.radius = 4;
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.65, 0.22, 96),
    new THREE.MeshStandardMaterial({
      map: texture(),
      roughness: 0.94,
      color: 0xe2d5b9,
    }),
  );
  ground.position.y = -0.14;
  ground.receiveShadow = true;
  scene.add(ground);
  // Fine rings cut into a round sandstone platform, like a small temple courtyard.
  for (const radius of [4.38, 4.45]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.008, 5, 128),
      new THREE.MeshBasicMaterial({ color: 0xa99a7e }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.022;
    scene.add(ring);
  }
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(4.35, 0.11, 8, 96),
    new THREE.MeshStandardMaterial({ color: 0xc5b597, roughness: 0.85 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.3;
  scene.add(rim);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.09 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.26;
  shadow.receiveShadow = true;
  scene.add(shadow);
  new ResizeObserver(resize).observe(stage);
  resize();
  new GLTFLoader().load(
    new URL("./assets/jiaobei.glb", import.meta.url).href,
    (gltf) => {
      for (let i = 0; i < 2; i++) {
        const cup = new THREE.Group();
        const model = gltf.scene.clone(true);
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            o.material = o.material.clone();
            o.material.roughness = 0.42;
            o.material.color.setRGB(0.5, 0.38, 0.32);
            o.material.side = THREE.FrontSide;
          }
        });
        model.scale.setScalar(1.4);
        cup.add(model);
        cup.position.set(i ? 1.3 : -1.3, i ? 0.968 : 0.035, i ? 0.38 : -0.4);
        cup.rotation.set(i ? Math.PI : 0, i ? -0.4 : 0.4, 0, "YXZ");
        scene.add(cup);
        cups.push(cup);
      }
      physics = new JiaobeiPhysics(knock);
      ready = true;
      $("#loading").hidden = true;
      throwButton.disabled = false;
      $("#throw-label").textContent = "诚心掷一杯";
      invalidate();
    },
    undefined,
    () => {
      $("#loading").innerHTML =
        '红筊加载失败，<button id="reload">点击重试</button>';
      $("#reload").onclick = () => location.reload();
    },
  );
  renderer.setAnimationLoop(frame);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    ready = false;
    throwButton.disabled = true;
    shareButton.disabled = true;
    $("#loading").hidden = false;
    $("#loading").textContent = "画面暂时中断，请刷新页面重新请筊。";
  });
}
function invalidate() {
  needsRender = true;
}
function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.fov = width / height < 1 ? 43 : 34;
  camera.updateProjectionMatrix();
  invalidate();
}
function random() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}
function throwCups(power = 0.25) {
  if (!ready || busy) return;
  busy = true;
  $("#mobile-wish").disabled = true;
  shareButton.disabled = true;
  throwButton.disabled = true;
  $("#wish").disabled = true;
  document.querySelectorAll("[data-wish]").forEach((b) => (b.disabled = true));
  $("#throw-label").textContent = "红筊问心中…";
  $("#stage-state").textContent = "双手捧筊，默念所求";
  $("#result-title").textContent = "捧筊在手，诚心一掷。";
  $("#result-description").textContent = "稍候片刻，让红筊停稳。";
  trayView.reset();
  physics.stage(power, random);
  liftFrom = cups.map((c) => ({
    p: c.position.clone(),
    q: c.quaternion.clone(),
  }));
  liftTo = cups.map((c, i) => {
    const t = physics.poseOf(i);
    return { p: t.position, q: t.quaternion };
  });
  animation = {
    wish: $("#wish").value.trim(),
    phase: "lift",
    start: performance.now(),
    power,
  };
  invalidate();
}
const trayView = new TrayView();
const LIFT_MS = 560;
const HOLD_MS = 480;
function frameCups() {
  trayView.fit(camera, cups);
}
function frame(now) {
  const dt = previousFrame === null ? 0 : (now - previousFrame) / 1000;
  previousFrame = now;
  if (chargeStart !== null) {
    const power = Math.min((now - chargeStart) / 1200, 1);
    throwButton.style.setProperty("--charge", `${power * 100}%`);
  }
  if (animation && !document.hidden) {
    if (animation.phase === "lift") {
      const k = reduced
        ? 1
        : Math.min((now - animation.start) / LIFT_MS, 1);
      const e = k < 1 ? (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2) : 1;
      cups.forEach((c, i) => {
        c.position.lerpVectors(liftFrom[i].p, liftTo[i].p, e);
        c.quaternion.slerpQuaternions(liftFrom[i].q, liftTo[i].q, e);
      });
      needsRender = true;
      if (k >= 1) {
        animation.phase = "hold";
        animation.start = now;
      }
    } else if (animation.phase === "hold") {
      if (now - animation.start >= HOLD_MS) {
        animation.phase = "fly";
        physics.release(animation.power, random);
        $("#stage-state").textContent = "红筊落处，静候回响";
        $("#result-title").textContent = "心意，正在落地。";
      }
    } else {
      let result = null;
      try {
        result = physics.step(dt);
      } catch (e) {
        console.error(e);
        result = physics.recover();
      }
      physics.sync(cups);
      needsRender = true;
      if (result) {
        const completed = { ...animation, ...result };
        animation = null;
        finish(completed);
      }
    }
  }
  if (needsRender) {
    frameCups();
    renderer.render(scene, camera);
    needsRender = false;
  }
}
function finish(a) {
  busy = false;
  $("#mobile-wish").disabled = false;
  last = { kind: a.kind, wish: a.wish, date: new Date().toISOString() };
  const r = outcomes[a.kind];
  $("#result-kicker").textContent = "此刻的筊意";
  $("#face-summary").textContent = r.faces;
  $("#result-title").textContent = r.title + " · " + r.faces.split(" · ")[1];
  $("#result-title").style.color = "var(--red)";
  $("#result-description").textContent = r.description;
  $(".result").classList.remove("reveal");
  void $(".result").offsetWidth;
  $(".result").classList.add("reveal");
  $("#stage-state").textContent = r.faces;
  $("#throw-label").textContent = "再掷一杯";
  throwButton.disabled = false;
  shareButton.disabled = false;
  $("#wish").disabled = false;
  document.querySelectorAll("[data-wish]").forEach((b) => (b.disabled = false));
  records.unshift(last);
  records = records.slice(0, 20);
  try {
    localStorage.setItem("hupi-records", JSON.stringify(records));
  } catch {
    toast("本次结果已生成；浏览器未允许保存筊记。");
  }
  count();
  if (navigator.vibrate) navigator.vibrate(30);
}
throwButton.addEventListener("pointerdown", (e) => {
  if (busy || !ready || e.button !== 0) return;
  chargeStart = performance.now();
  throwButton.setPointerCapture(e.pointerId);
});
throwButton.addEventListener("pointerup", () => {
  if (chargeStart === null) return;
  const power = Math.min((performance.now() - chargeStart) / 1200, 1);
  chargeStart = null;
  throwButton.style.setProperty("--charge", "0%");
  throwCups(power);
});
throwButton.addEventListener("pointercancel", () => {
  chargeStart = null;
  throwButton.style.setProperty("--charge", "0%");
});
throwButton.addEventListener("click", (e) => {
  if (e.detail === 0) throwCups();
});
function wrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  let line = "",
    count = 0;
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      line = "";
      count++;
      if (count >= maxLines) return y;
    }
    line += char;
  }
  ctx.fillText(line, x, y);
  return y + lineHeight;
}
shareButton.onclick = async () => {
  if (!last || busy) return;
  shareButton.disabled = true;
  try {
    await document.fonts.ready;
    // Render a dedicated 920×580 close-up instead of squeezing the tall live
    // canvas into the card — the settled cups fill the picture.
    const prevSize = renderer.getSize(new THREE.Vector2());
    const prevScale = trayView.scale;
    trayView.scale = 1;
    renderer.setSize(920, 580, false);
    const shareCam = new THREE.PerspectiveCamera(34, 920 / 580, 0.1, 100);
    trayView.fit(shareCam, cups, 4.3);
    renderer.render(scene, shareCam);
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1440;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f4f0e7";
    ctx.fillRect(0, 0, 1080, 1440);
    ctx.fillStyle = "#a8392a";
    ctx.fillRect(80, 70, 76, 88);
    ctx.fillStyle = "#fff4e3";
    ctx.font = '44px "Noto Serif SC",serif';
    ctx.fillText("庇", 96, 137);
    ctx.fillStyle = "#393a31";
    ctx.font = '42px "Noto Serif SC",serif';
    ctx.fillText("有庇 · 闽南掷筊", 182, 128);
    ctx.fillStyle = "#99907d";
    ctx.font = "18px sans-serif";
    ctx.fillText("HŪ PÌ   /   A MOMENT OF PEACE", 182, 164);
    ctx.strokeStyle = "#d6cdbc";
    ctx.beginPath();
    ctx.moveTo(80, 204);
    ctx.lineTo(1000, 204);
    ctx.stroke();
    ctx.drawImage(renderer.domElement, 80, 228, 920, 580);
    renderer.setSize(prevSize.x, prevSize.y, false);
    trayView.scale = prevScale;
    invalidate();
    const result = outcomes[last.kind];
    ctx.textAlign = "center";
    ctx.fillStyle = "#a8392a";
    ctx.font = '100px "Noto Serif SC",serif';
    ctx.fillText(result.title, 540, 930);
    ctx.fillStyle = "#82765f";
    ctx.font = "27px sans-serif";
    ctx.fillText(result.faces, 540, 990);
    ctx.fillStyle = "#393a31";
    ctx.font = '42px "Noto Serif SC",serif';
    ctx.fillText(result.subtitle, 540, 1075);
    ctx.font = '42px "Noto Serif SC",serif';
    ctx.fillStyle = "#8f826e";
    wrap(ctx, last.wish || "心中默念的那件事，愿有回响。", 540, 1165, 860, 66, 3);
    ctx.font = "20px sans-serif";
    ctx.fillText(new Date(last.date).toLocaleString("zh-CN"), 540, 1345);
    ctx.font = '22px "Noto Serif SC",serif';
    ctx.fillText("有拜有保庇 · 民俗体验，愿你平安", 540, 1385);
    const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
    if (!blob) throw Error("image");
    if (shareURL) URL.revokeObjectURL(shareURL);
    shareURL = URL.createObjectURL(blob);
    openDialog(
      '<span class="small-label">把 平 安 分 享 出 去</span><h2>留住这一份心意</h2><p>图片会包含你写下的心事。手机也可以长按图片保存。</p><img class="share-preview" alt="本次掷筊结果分享图片"><div class="dialog-actions"><a id="download">下载图片</a><button id="native-share">分享给朋友 ↗</button></div>',
    );
    $(".share-preview").src = shareURL;
    $("#download").href = shareURL;
    $("#download").download = `有庇-${result.title}-${Date.now()}.png`;
    const file = new File([blob], `有庇-${result.title}.png`, {
      type: "image/png",
    });
    $("#native-share").onclick = async () => {
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "有庇 · " + result.title,
          });
        } catch (e) {
          if (e.name !== "AbortError")
            toast("分享未完成，可以下载图片后发送。");
        }
      } else {
        toast("请下载图片，或长按图片保存后分享。");
      }
    };
  } catch (e) {
    toast("图片生成失败，请再试一次。");
    console.error(e);
  } finally {
    shareButton.disabled = false;
  }
};
try {
  init();
} catch (e) {
  $("#loading").textContent =
    "当前浏览器无法开启 3D，请使用支持 WebGL 的浏览器。";
  console.error(e);
}
