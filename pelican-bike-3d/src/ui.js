/* 鹈鹕骑车 · UI —— 遥测 HUD、方位带、落地字幕、知识牌卡片、月面物理抽屉、触屏按钮 */
(function () {
  'use strict';
  window.PM = window.PM || {};
  var PM = window.PM, S = PM.SIM;
  var $ = function (id) { return document.getElementById(id); };
  var el = {}, handlers = {}, capT = 0, cardT = 0, capHold = 0, liveSpans = {}, navCtx = null, lastNavW = 0;
  var wrapA = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  var RULES = [
    ['重力只有六分之一', '月球质量是地球的 1.2%、半径是 27%，表面重力加速度 1.62 m/s²。质量没变，变轻的是重量。',
      'g = 1.62 m/s² · 这套车和鹈鹕共 49 kg，在月面重 <em>79 N</em>，在地球上 481 N'],
    ['腾空是标准抛物线', '没有空气阻力，离地后只受重力：y = v₀t − ½gt²。同样的起跳速度，高度、滞空、距离都正好是地球上的 <code>g地/g月 = 6.05</code> 倍。',
      'jump'],
    ['坡顶就是跳台', '能不能被坡顶抛起来只看 <code>v² &gt; g·ρ</code>（ρ 是坡顶的曲率半径）。同一个坡，地球上要 9.4 m/s 才飞得起来，月面上 3.8 m/s 就够了。',
      'crest'],
    ['刹车要提前很多', '刹车靠摩擦力 <code>F = μmg</code>。正压力只有地球的 1/6，刹车距离就是 6 倍；而且重心高，刹得太狠后轮会翘起来。',
      'brake'],
    ['转弯半径是 6 倍', '向心力由车身倾斜提供：<code>tanθ = v² / (gR)</code>。同样的倾角，月面上的转弯半径是地球的 6 倍——想转急，先减速。',
      'turn'],
    ['摩擦锥：倾过 31° 就救不回来', '月壤的摩擦系数 μ ≈ 0.6，轮胎能给的侧向加速度最多是 μg。倾角超过 <code>atan μ ≈ 31°</code>，车会侧滑着倒下去——这一点和重力无关，地球上也一样。',
      'cone'],
    ['没有空气阻力', '不踩踏板只剩很小的滚动阻力，能滑很远；极速只受齿比和踏频限制，跟风阻没关系。',
      'coast'],
    ['爬坡容易，打滑也容易', '爬坡要克服的 <code>mg·sinθ</code> 只有地球的 1/6，陡坡也上得去；但后轮抓地力同样只有 1/6，蹬得太猛会空转。',
      'climb'],
    ['平衡是一根倒立摆', '自行车靠"往倒的方向打车把"保持平衡。倒下的快慢由 <code>√(L/g)</code> 决定，月球上慢 2.46 倍——所以更容易撒把。按 F 试试。',
      'hands'],
    ['空中角动量守恒', '腾空时没有地面提供力矩，倾角和转向的角速度都保持不变：带着压弯姿态起跳，空中是回不了正的。', ''],
    ['真空不传声', '声音需要介质。你听到的全是隔着头盔和车架传来的：链条、轮胎、落地。车铃按下去只会动，不会响。按 B 试试。',
      'bell'],
    ['月尘走抛物线', '被车轮扬起的月尘没有空气托着，每一粒都沿干净的抛物线飞行，落地即停，不会弥漫成尘雾。阿波罗月球车的录像里正是这样。', ''],
    ['没有风', '旗帜、羽毛不会飘；营地那面旗靠一根横杆撑开。车辙和脚印会保留几百万年——没有风、水和生命来抹掉它。', ''],
    ['天空永远是黑的', '没有大气散射：星星不闪烁，影子锐利，影子里只剩月面反光（从下方来的）。太阳落山也不会变红，只是光照面积缩到零。',
      'sky'],
    ['地球挂在天上不动', '月球被潮汐锁定，自转一圈等于公转一圈，所以地球永远在天空的同一个位置，只有"天平动"的小幅摆动。它也有圆缺，而且和月亮正好相反：满月之夜，这里是新地球。',
      'earth'],
    ['一个昼夜 29.5 天', '月面白天 +127 °C、夜晚 −173 °C。点顶部的时间可以加速观看：太阳每个地球日只移动 12°。',
      'day'],
    ['地平线更近', '月球半径 1737 km，是地球的 27%。站在 1.5 m 高处，地平线在 2.3 km 外（地球上 4.4 km）。画面里远处地面的下弯就是它。', ''],
    ['画面之外', '亮度按相机曝光做了提亮：真实月壤的反照率只有约 0.12；夜里的地球照只有阳光的约 1/3000。', '']
  ];

  function init(h) {
    handlers = h || {};
    ['mode', 'mode-name', 'mode-sub', 'nav', 'speed', 'agl', 'lean', 'latg', 'odo', 'found', 'tele', 'time', 'time-main', 'time-sub',
      'brake', 'brake-e', 'coast', 'coast-e', 'card', 'card-kicker', 'card-title', 'card-text', 'caption', 'hint', 'mute-btn', 'cam-btn',
      'help-btn', 'panel', 'panel-list', 'panel-close', 'touch', 'loading', 'load-bar', 'load-text'].forEach(function (id) { el[id] = $(id); });
    el.muteBtn = $('mute-btn'); el.camBtn = $('cam-btn'); el.helpBtn = $('help-btn'); el.panelClose = $('panel-close');

    var list = '';
    RULES.forEach(function (r, i) {
      list += '<li><h3>' + r[0] + '</h3><p>' + r[1] + '</p>' + (r[2] ? '<span class="live" data-live="' + r[2] + '"></span>' : '') + '</li>';
    });
    list += '<li class="plain"><p class="panel-foot">模型参数：总质量 49 kg（鹈鹕 9 + 宇航服 25 + 自行车 15）· μ 0.60 · 滚动阻力系数 0.05 · 单速 44×18 · 输出功率 220 W · 轮胎半径 0.342 m · 固定步长 1/120 s。</p></li>';
    el['panel-list'].innerHTML = list;
    document.querySelectorAll('#panel-list .live').forEach(function (s) { liveSpans[s.getAttribute('data-live')] = s; });

    el.muteBtn.addEventListener('click', function () { handlers.onMute && handlers.onMute(); });
    el.camBtn.addEventListener('click', function () { handlers.onCam && handlers.onCam(); });
    el.helpBtn.addEventListener('click', function () { setPanel(el.panel.hidden); });
    // 面板 / 卡片带滑入动画：手指按下时元素还在移动，浏览器合成 click 时会取按下与抬起位置的共同祖先而点偏。
    // 所以这两个收起动作直接认指针事件：按下和抬起在同一个元素上、且手指没滑动，就算点中（鼠标同样适用）
    function tapOn(el, fn) {
      var sx = 0, sy = 0;
      el.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; });
      el.addEventListener('pointerup', function (e) { if (Math.hypot(e.clientX - sx, e.clientY - sy) < 12) fn(); });
      el.addEventListener('click', function (e) { if (e.detail === 0) fn(); });    // 键盘触发（Enter / 空格）
    }
    tapOn(el.panelClose, function () { setPanel(false); });
    el.time.addEventListener('click', function () { handlers.onTime && handlers.onTime(); });
    tapOn(el.card, hideCard);

    document.querySelectorAll('#touch button').forEach(function (b) {
      var k = b.getAttribute('data-k');
      function down(e) { e.preventDefault(); b.classList.add('on'); handlers.onTouch && handlers.onTouch(k, true); }
      function up(e) { e.preventDefault(); b.classList.remove('on'); handlers.onTouch && handlers.onTouch(k, false); }
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  }

  function setPanel(open) {
    el.panel.hidden = !open;
    el.helpBtn.classList.toggle('active', open);
  }
  function panelVisible() { return !el.panel.hidden; }

  function loading(p, text) {                               // 启动早期就会调用：这里直接取元素
    var bar = $('load-bar'), txt = $('load-text');
    if (bar) bar.style.width = Math.round(p * 100) + '%';
    if (txt && text) txt.textContent = text;
  }
  function ready() {
    var lo = $('loading');
    if (!lo) return;
    lo.classList.add('done');
    setTimeout(function () { lo.remove(); }, 700);
  }

  function caption(text, ms, warn) {
    el.caption.innerHTML = text;
    el.caption.classList.toggle('warn', !!warn);
    el.caption.classList.add('show');
    capHold = (ms || 4200) / 1000;
  }
  function hideCaption() { el.caption.classList.remove('show'); capHold = 0; }
  var cardTok = 0;                                                  // 淡出定时器的令牌：新卡片弹出时作废旧的收起动作
  function card(p, total) {
    cardTok++;
    el['card-kicker'].textContent = '知识牌 ' + (p.id < 10 ? '0' : '') + p.id + ' / ' + total;
    el['card-title'].textContent = p.title;
    el['card-text'].textContent = p.text;
    el.card.hidden = false; el.card.classList.remove('out');
    cardT = 11;
  }
  function hideCard() {
    if (el.card.hidden) return;
    el.card.classList.add('out');
    cardT = 0;
    var tok = ++cardTok;
    setTimeout(function () { if (tok === cardTok) el.card.hidden = true; }, 420);
  }

  function setMuted(m) { el.muteBtn.classList.toggle('muted', !!m); el.muteBtn.classList.toggle('active', false); }

  function touchState(k, on) {
    var b = document.querySelector('#touch button[data-k="' + k + '"]');
    if (b) b.classList.toggle('lit', !!on);
  }

  /* 方位带：以车头为中央的 ±90° 俯视罗盘。右边的在右边。 */
  function drawNav(x) {
    var c = el.nav, dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = c.clientWidth || 280, hgt = Math.round(w * 41 / 280);
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    var g = c.getContext('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, hgt);
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 4;             // 刻度画在亮月面上也要读得清
    var cx = w / 2, half = w / 2, span = Math.PI / 2, y = 30;
    var toX = function (b) { return cx + wrapA(b - x.heading) / span * half; };
    g.lineWidth = 1; g.strokeStyle = 'rgba(236,235,230,0.42)'; g.fillStyle = 'rgba(236,235,230,0.62)';
    g.font = '500 9px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.beginPath(); g.moveTo(6, y); g.lineTo(w - 6, y); g.stroke();
    for (var deg = -180; deg < 180; deg += 15) {                   // 刻度相对车头滚动
      var off = (deg - x.heading * 180 / Math.PI); off = ((off + 90) % 180 + 180) % 180 - 90;
      var px = cx + off / 90 * half; if (px < 6 || px > w - 6) continue;
      var major = Math.round((deg + 360)) % 45 === 0;
      g.beginPath(); g.moveTo(px, y - (major ? 7 : 3)); g.lineTo(px, y); g.stroke();
      if (major) g.fillText(String(((deg + 360) % 360)), px, y + 4);
    }
    // 镜头视野
    if (x.camHalf) {
      var a = toX(x.camBearing - x.camHalf), b = toX(x.camBearing + x.camHalf);
      g.fillStyle = 'rgba(236,235,230,0.07)'; g.fillRect(Math.max(0, a), 2, Math.min(w, b) - Math.max(0, a), y - 4);
    }
    g.fillStyle = '#ffa21f';                                      // 车头
    g.beginPath(); g.moveTo(cx, y + 12); g.lineTo(cx - 4, y + 19); g.lineTo(cx + 4, y + 19); g.closePath(); g.fill();
    for (var i = 0; i < x.marks.length; i++) {                    // 标记
      var m = x.marks[i], mx = toX(m.b), edge = mx < 14 || mx > w - 14;
      mx = Math.max(14, Math.min(w - 14, mx));
      g.globalAlpha = edge ? 0.45 : 1;
      g.strokeStyle = m.color; g.fillStyle = m.color; g.lineWidth = 1.4;
      if (m.shape === 'o') { g.beginPath(); g.arc(mx, y, 3.6, 0, 6.2832); g.stroke(); }
      else if (m.shape === 's') { g.strokeRect(mx - 3, y - 3, 6, 6); }
      else { g.beginPath(); g.moveTo(mx, y - 5.5); g.lineTo(mx + 5, y); g.lineTo(mx, y + 5.5); g.lineTo(mx - 5, y); g.closePath(); g.fill(); }
      if (m.label) g.fillText(m.label, mx, y + 4);
      g.globalAlpha = 1;
    }
  }

  var uiT = 0;
  function update(dt, x) {
    uiT += dt; capHold -= dt; cardT -= dt;
    if (capHold < 0 && el.caption.classList.contains('show')) hideCaption();
    if (cardT < 0 && !el.card.hidden) hideCard();
    if (uiT < 0.08) return;                                      // 文本 12 Hz 足够
    uiT = 0;
    el.speed.textContent = x.speed.toFixed(1);
    el.agl.textContent = x.agl.toFixed(2);
    el.lean.textContent = String(Math.round(Math.abs(x.lean)));
    el.latg.textContent = x.latg.toFixed(2);
    el.odo.textContent = (x.odo / 1000).toFixed(3);
    el.found.textContent = (x.found < 10 ? '0' : '') + x.found;
    el.tele.classList.toggle('air', x.air);
    var mm = el.mode; mm.classList.toggle('manual', x.mode === 'manual');
    el['mode-name'].textContent = x.mode === 'manual' ? '手动骑行' : '自动驾驶';
    el['mode-sub'].textContent = x.mode === 'manual' ? x.idleLeft + ' 秒不动交还给鹈鹕' : '按 W 接管';
    el['time-main'].textContent = x.timeMain;
    el['time-sub'].textContent = x.timeSub;
    el.brake.textContent = x.brake >= 1000 ? (x.brake / 1000).toFixed(2) + ' k' : String(Math.round(x.brake));
    el['brake-e'].textContent = '（地球 ' + (x.brakeE >= 1000 ? (x.brakeE / 1000).toFixed(2) + ' k' : x.brakeE.toFixed(1)) + '）';
    el.coast.textContent = x.coast >= 1000 ? (x.coast / 1000).toFixed(2) + ' k' : String(Math.round(x.coast));
    el['coast-e'].textContent = '（地球 ' + (x.coastE >= 100 ? Math.round(x.coastE) : x.coastE.toFixed(1)) + '）';
    drawNav(x);
    if (panelVisible()) {
      var L = x.live || {};
      for (var k in liveSpans) if (L[k]) liveSpans[k].innerHTML = L[k];
    }
  }

  PM.UI = {
    init: init, update: update, caption: caption, hideCaption: hideCaption, card: card, hideCard: hideCard, setPanel: setPanel, panelVisible: panelVisible,
    setMuted: setMuted, touchState: touchState, loading: loading, ready: ready, RULES: RULES
  };
})();
