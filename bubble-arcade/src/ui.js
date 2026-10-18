/* ============================================================
 * 泡泡堂 · src/ui.js —— BA.UI DOM 界面
 * 标题 / 设置 / 帮助 / 战绩 / 暂停 / 回合结算 / 比赛结算 + HUD
 * ============================================================ */
(function (global) {
  'use strict';
  var BA = (global.BA = global.BA || {});
  var U = BA.CORE.U, CFG = BA.CORE.CFG, SAVE = BA.CORE.SAVE, P = BA.PARAMS;

  var screens = {};
  var cur = null;
  var toastTimer = null;
  var hudCache = {};
  var lastTimerTxt = '';
  var cdTimer = null;
  var pendingCb = null;
  var helpReturn = null;

  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, html) { return U.el(tag, cls, html); }

  function init() {
    ['screenTitle', 'screenSettings', 'screenHelp', 'screenStats', 'screenPause', 'screenRound', 'screenMatch']
      .forEach(function (id) { screens[id] = $(id); });
    buildTitle();
    buildSettings();
    buildHelp();
    buildStats();
    buildPause();
    show('title');
    // 首次交互解锁音频
    var unlockOnce = function () {
      BA.AUDIO.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce);
    window.addEventListener('keydown', unlockOnce);
    var cfg = CFG.get();
    if (cfg.muted) BA.AUDIO.muted(true);
  }

  /* ---------------- 屏幕切换 ---------------- */
  function show(name) {
    Object.keys(screens).forEach(function (k) {
      if (screens[k]) screens[k].classList.toggle('on', k === 'screen' + cap(name));
    });
    cur = name || null;
    if (!name) {
      Object.keys(screens).forEach(function (k) { screens[k].classList.remove('on'); });
    }
    if (name === 'title') BA.AUDIO.bgm(true);
    else if (name === 'match' || name === 'stats' || name === 'help' || name === 'settings') BA.AUDIO.bgm(true);
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  /* ---------------- 标题页 ---------------- */
  function buildTitle() {
    var sc = screens.screenTitle;
    sc.innerHTML = '';
    var deco = mk('div', 'bubbles-deco');
    for (var i = 0; i < 16; i++) {
      var b = mk('i');
      var sz = 8 + Math.random() * 46;
      b.style.width = sz + 'px'; b.style.height = sz + 'px';
      b.style.left = (Math.random() * 100) + '%';
      b.style.top = (30 + Math.random() * 80) + '%';
      b.style.animationDuration = (9 + Math.random() * 12) + 's';
      b.style.animationDelay = (-Math.random() * 14) + 's';
      deco.appendChild(b);
    }
    sc.appendChild(deco);
    var card = mk('div', 'card');
    card.innerHTML =
      '<div class="title-logo">' +
        '<div class="cn">泡泡堂</div>' +
        '<div class="en">BUBBLE ARCADE</div>' +
        '<div class="sub">放泡 · 水柱 · 炸箱 · 困泡自救 —— 经典四人混战复刻</div>' +
      '</div>' +
      '<div class="setgrid">' +
        '<div class="setrow"><div class="lbl">模式 MODE</div><div class="chips" data-group="mode"></div></div>' +
        '<div class="setrow"><div class="lbl">本地玩家 HUMANS</div><div class="chips" data-group="humans"></div></div>' +
        '<div class="setrow"><div class="lbl">人数 PLAYERS</div><div class="chips" data-group="players"></div></div>' +
        '<div class="setrow"><div class="lbl">难度 DIFFICULTY</div><div class="chips" data-group="diff"></div></div>' +
        '<div class="setrow"><div class="lbl">赛制 WINS</div><div class="chips" data-group="wins"></div></div>' +
      '</div>' +
      '<div class="setrow"><div class="lbl">地图 MAP</div><div class="chips" data-group="map"></div></div>' +
      '<div class="btnrow">' +
        '<button class="btn" data-act="start">开始对战 · Enter</button>' +
        '<button class="btn ghost" data-act="settings">设置</button>' +
        '<button class="btn ghost" data-act="help">操作说明</button>' +
        '<button class="btn ghost" data-act="stats">战绩</button>' +
      '</div>' +
      '<div class="tips" style="margin-top:20px">' +
        (BA.TOUCH && BA.TOUCH.enabled
          ? '<b>触屏</b> 左下区域按住滑动移动 · 右下按钮放泡 · 右上按钮暂停（插键盘仍可双人）'
          : '<b>P1</b> <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> 移动 · <span class="kbd">Space</span> 放泡 &nbsp;|&nbsp; ' +
            '<b>P2</b> <span class="kbd">↑</span><span class="kbd">←</span><span class="kbd">↓</span><span class="kbd">→</span> 移动 · <span class="kbd">Enter</span> 放泡') +
      '</div>';
    sc.appendChild(card);
    renderChips(sc);
    sc.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip && !chip.disabled) {
        chip.blur();
        var g = chip.closest('.chips').dataset.group;
        var v = chip.dataset.v;
        onPick(g, v);
        return;
      }
      var btn = e.target.closest('[data-act]');
      if (btn) { btn.blur(); onAct(btn.dataset.act); }
    });
    sc.addEventListener('dblclick', function (e) { e.preventDefault(); });
  }

  function renderChips(root) {
    var cfg = CFG.get();
    var groups = {
      mode: [
        { v: 'ffa', t: '混战', k: 'FFA' },
        { v: 'team', t: '2 v 2', k: 'TEAM' }
      ],
      humans: [
        { v: '1', t: '单人', k: '1P' },
        { v: '2', t: '双人', k: '2P' }
      ],
      players: [
        { v: '2', t: '2 人' }, { v: '3', t: '3 人' }, { v: '4', t: '4 人' }
      ],
      diff: [
        { v: 'easy', t: '简单' }, { v: 'normal', t: '普通' }, { v: 'hard', t: '困难' }
      ],
      wins: [
        { v: '1', t: '1 胜' }, { v: '2', t: '2 胜' }, { v: '3', t: '3 胜' }, { v: '5', t: '5 胜' }
      ]
    };
    Object.keys(groups).forEach(function (g) {
      var box = root.querySelector('[data-group="' + g + '"]');
      if (!box) return;
      box.innerHTML = '';
      var val = String(cfg['last' + cap(g)] != null ? cfg['last' + cap(g)] : (g === 'wins' ? cfg.winsNeeded : ''));
      if (g === 'wins') val = String(cfg.winsNeeded);
      if (g === 'map') {
        BA.MAPS.LIST.forEach(function (m) {
          var c = mk('button', 'chip map' + (val === m.id ? ' on' : ''));
          c.dataset.v = m.id;
          c.innerHTML = '<span class="mn">' + U.esc(m.name) + '</span><span class="mt">' + U.esc(m.tag) + '</span>';
          box.appendChild(c);
        });
        return;
      }
      groups[g].forEach(function (o) {
        var c = mk('button', 'chip' + (val === o.v ? ' on' : ''));
        c.dataset.v = o.v;
        c.innerHTML = U.esc(o.t) + (o.k ? ' <span class="k">' + o.k + '</span>' : '');
        box.appendChild(c);
      });
    });
    // 地图
    var mapBox = root.querySelector('[data-group="map"]');
    if (mapBox) {
      mapBox.innerHTML = '';
      var curMap = cfg.lastMap || 'garden';
      BA.MAPS.LIST.forEach(function (m) {
        var c = mk('button', 'chip map' + (curMap === m.id ? ' on' : ''));
        c.dataset.v = m.id;
        c.innerHTML = '<span class="mn">' + U.esc(m.name) + '</span><span class="mt">' + U.esc(m.theme.toUpperCase()) + '</span>';
        mapBox.appendChild(c);
      });
    }
    // 模式约束：组队固定 4 人
    var mode = cfg.lastMode || 'ffa';
    var humans = +cfg.lastHumans || 1;
    var pBox = root.querySelector('[data-group="players"]');
    var hBox = root.querySelector('[data-group="humans"]');
    if (pBox) {
      pBox.querySelectorAll('.chip').forEach(function (c) {
        var dis = mode === 'team' && c.dataset.v !== '4';
        c.disabled = dis;
        c.classList.toggle('on', mode === 'team' ? c.dataset.v === '4' : c.classList.contains('on'));
      });
    }
    if (hBox) {
      hBox.querySelectorAll('.chip').forEach(function (c) {
        var dis = mode === 'team' && c.dataset.v === '2' ? false : false;
        c.disabled = dis;
      });
    }
  }

  function onPick(g, v) {
    BA.AUDIO.play('click');
    var cfg = CFG.get();
    var patch = {};
    if (g === 'mode') patch.lastMode = v;
    else if (g === 'humans') patch.lastHumans = +v;
    else if (g === 'players') patch.lastPlayers = +v;
    else if (g === 'diff') patch.lastDiff = v;
    else if (g === 'map') patch.lastMap = v;
    else if (g === 'wins') patch.winsNeeded = +v;
    CFG.patch(patch);
    if (g === 'mode' && v === 'team') {
      CFG.patch({ lastPlayers: 4 });
    }
    renderChips(screens.screenTitle);
  }

  function onAct(act) {
    BA.AUDIO.play('click');
    var cfg = CFG.get();
    if (act === 'start') {
      BA.AUDIO.unlock();
      BA.AUDIO.bgm(true);
      BA.GAME.startMatch({
        mode: cfg.lastMode || 'ffa',
        humans: +cfg.lastHumans || 1,
        players: +cfg.lastPlayers || 4,
        diff: cfg.lastDiff || 'normal',
        map: cfg.lastMap || 'garden',
        winsNeeded: cfg.winsNeeded || 3
      });
    } else if (act === 'settings') { fillSettings(); show('settings'); }
    else if (act === 'help') { helpReturn = 'title'; show('help'); }
    else if (act === 'stats') { buildStats(); show('stats'); }
    else if (act === 'resume') BA.GAME.resume();
    else if (act === 'quit') { BA.GAME.quit(); }
    else if (act === 'next') BA.GAME.nextRound();
    else if (act === 'again') {
      BA.GAME.startMatch({
        mode: cfg.lastMode || 'ffa', humans: +cfg.lastHumans || 1,
        players: +cfg.lastPlayers || 4, diff: cfg.lastDiff || 'normal',
        map: cfg.lastMap || 'garden', winsNeeded: cfg.winsNeeded || 3
      });
    } else if (act === 'title') { BA.GAME.quit(); }
    else if (act === 'back') {
      if (helpReturn === 'pause') { show('pause'); }
      else show('title');
    }
  }

  /* ---------------- 设置 ---------------- */
  function buildSettings() {
    var sc = screens.screenSettings;
    sc.innerHTML = '';
    var card = mk('div', 'card settings-card');
    card.innerHTML =
      '<div class="round-title" style="text-align:left;font-size:12px">SETTINGS · 设置</div>' +
      '<h2 style="margin:8px 0 4px;font-size:24px;letter-spacing:.04em">游戏设置</h2>' +
      '<div class="setrow"><div class="lbl">音效音量 SFX</div><div class="slider-row">' +
        '<input type="range" id="setSfx" min="0" max="100" step="1"><span class="slider-val" id="setSfxV"></span></div></div>' +
      '<div class="setrow"><div class="lbl">音乐音量 MUSIC</div><div class="slider-row">' +
        '<input type="range" id="setMusic" min="0" max="100" step="1"><span class="slider-val" id="setMusicV"></span></div></div>' +
      '<div class="setrow"><div class="lbl">画面 SCREEN</div><div class="chips" style="gap:16px">' +
        '<span class="toggle" id="tgShake"><i></i>屏幕震动</span>' +
        '<span class="toggle" id="tgParticles"><i></i>粒子特效</span>' +
        '<span class="toggle" id="tgFps"><i></i>显示帧率</span>' +
        '<span class="toggle" id="tgMute"><i></i>静音</span>' +
      '</div></div>' +
      '<div class="setrow"><div class="lbl">玩法 GAMEPLAY</div><div class="chips" style="gap:16px">' +
        '<span class="toggle" id="tgSudden"><i></i>死亡模式（超时随机落泡）</span>' +
      '</div></div>' +
      '<div class="setrow"><div class="lbl">引信时长 Fuse（秒）</div><div class="chips" data-group="fuse"></div></div>' +
      '<div class="setrow"><div class="lbl">回合时限 Round Time（秒）</div><div class="chips" data-group="roundTime"></div></div>' +
      '<div class="setrow"><div class="lbl">道具掉落率 Item Chance</div><div class="chips" data-group="itemChance"></div></div>' +
      '<div class="setrow"><div class="lbl">起始泡泡 Start Bombs</div><div class="chips" data-group="startBombs"></div></div>' +
      '<div class="setrow"><div class="lbl">起始威力 Start Power</div><div class="chips" data-group="startPower"></div></div>' +
      '<div class="btnrow">' +
        '<button class="btn" data-act="back">返回</button>' +
        '<button class="btn ghost" data-act="resetCfg">恢复默认</button>' +
        '<button class="btn ghost" data-act="resetSave" style="margin-left:auto;opacity:.7">清空战绩</button>' +
      '</div>';
    sc.appendChild(card);
    sc.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) {
        btn.blur();
        if (btn.dataset.act === 'back') { show('title'); }
        else if (btn.dataset.act === 'resetCfg') {
          CFG.reset(); fillSettings(); toast('已恢复默认设置'); BA.AUDIO.play('click');
        } else if (btn.dataset.act === 'resetSave') {
          SAVE.reset(); toast('战绩已清空'); BA.AUDIO.play('click');
        }
        return;
      }
      var chip = e.target.closest('.chip');
      if (chip) {
        chip.blur();
        var g = chip.closest('.chips').dataset.group;
        var v = parseFloat(chip.dataset.v);
        var patch = {};
        patch[g] = v;
        CFG.patch(patch);
        BA.AUDIO.play('click');
        fillSettings();
        if (g === 'itemChance') BA.GAME.render();
      }
      var tg = e.target.closest('.toggle');
      if (tg) {
        if (tg.blur) tg.blur();
        var cfg = CFG.get();
        if (tg.id === 'tgShake') CFG.patch({ shake: cfg.shake ? 0 : 1 });
        else if (tg.id === 'tgParticles') {
          var on = cfg.particles ? 0 : 1;
          CFG.patch({ particles: on });
          BA.FX.setEnabled(!!on);
        } else if (tg.id === 'tgFps') {
          CFG.patch({ showFps: !cfg.showFps });
          $('fps').classList.toggle('on', !!CFG.get().showFps);
        } else if (tg.id === 'tgMute') {
          var m = !cfg.muted;
          CFG.patch({ muted: m });
          BA.AUDIO.muted(m);
        } else if (tg.id === 'tgSudden') {
          CFG.patch({ suddenDeath: !cfg.suddenDeath });
        }
        BA.AUDIO.play('click');
        fillSettings();
      }
    });
    sc.addEventListener('input', function (e) {
      if (e.target.id === 'setSfx') {
        var v = +e.target.value / 100;
        CFG.patch({ sfxVolume: v });
        BA.AUDIO.setSfx(v);
        $('setSfxV').textContent = Math.round(v * 100) + '%';
        e.target.style.setProperty('--p', (v * 100) + '%');
        BA.AUDIO.play('tick');
      } else if (e.target.id === 'setMusic') {
        var v2 = +e.target.value / 100;
        CFG.patch({ musicVolume: v2 });
        BA.AUDIO.setMusic(v2);
        $('setMusicV').textContent = Math.round(v2 * 100) + '%';
        e.target.style.setProperty('--p', (v2 * 100) + '%');
      }
    });
  }

  function fillSettings() {
    var cfg = CFG.get();
    var sc = screens.screenSettings;
    if (!sc || !sc.querySelector('#setSfx')) return;
    var s1 = sc.querySelector('#setSfx'), s2 = sc.querySelector('#setMusic');
    s1.value = Math.round((cfg.sfxVolume == null ? .8 : cfg.sfxVolume) * 100);
    s2.value = Math.round((cfg.musicVolume == null ? .32 : cfg.musicVolume) * 100);
    s1.style.setProperty('--p', s1.value + '%');
    s2.style.setProperty('--p', s2.value + '%');
    sc.querySelector('#setSfxV').textContent = s1.value + '%';
    sc.querySelector('#setMusicV').textContent = s2.value + '%';
    sc.querySelector('#tgShake').classList.toggle('on', !!cfg.shake);
    sc.querySelector('#tgParticles').classList.toggle('on', !!cfg.particles);
    sc.querySelector('#tgFps').classList.toggle('on', !!cfg.showFps);
    sc.querySelector('#tgMute').classList.toggle('on', !!cfg.muted);
    sc.querySelector('#tgSudden').classList.toggle('on', !!cfg.suddenDeath);
    var groups = {
      fuse: [{ v: 1.4, t: '1.4s 快' }, { v: 2.0, t: '2.0s' }, { v: 2.4, t: '2.4s 标准' }, { v: 3.2, t: '3.2s 慢' }],
      roundTime: [{ v: 60, t: '60s' }, { v: 120, t: '120s' }, { v: 150, t: '150s' }, { v: 240, t: '240s' }],
      itemChance: [{ v: 0.15, t: '15%' }, { v: 0.3, t: '30%' }, { v: 0.45, t: '45%' }, { v: 0.65, t: '65%' }],
      startBombs: [{ v: 1, t: '1' }, { v: 2, t: '2' }, { v: 3, t: '3' }],
      startPower: [{ v: 1, t: '1' }, { v: 2, t: '2' }, { v: 3, t: '3' }]
    };
    Object.keys(groups).forEach(function (g) {
      var box = sc.querySelector('[data-group="' + g + '"]');
      if (!box) return;
      box.innerHTML = '';
      groups[g].forEach(function (o) {
        var on = Math.abs((cfg[g] == null ? o.v : cfg[g]) - o.v) < 1e-6;
        var c = mk('button', 'chip' + (on ? ' on' : ''));
        c.dataset.v = o.v;
        c.textContent = o.t;
        box.appendChild(c);
      });
    });
  }

  /* ---------------- 帮助 ---------------- */
  function buildHelp() {
    var sc = screens.screenHelp;
    sc.innerHTML = '';
    var card = mk('div', 'card wide');
    card.innerHTML =
      '<div class="round-title" style="text-align:left;font-size:12px">HOW TO PLAY · 操作说明</div>' +
      '<h2 style="margin:8px 0 10px;font-size:24px">怎么玩</h2>' +
      '<div class="keys-grid">' +
        '<div class="keys-box"><h4>P1 · 蓝波</h4>' +
          '<div class="row"><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> 上下左右移动</div>' +
          '<div class="row"><span class="kbd">Space</span> 放置泡泡 / 被困时连按自救</div>' +
        '</div>' +
        '<div class="keys-box"><h4>P2 · 粉妮（双人模式）</h4>' +
          '<div class="row"><span class="kbd">↑</span><span class="kbd">←</span><span class="kbd">↓</span><span class="kbd">→</span> 上下左右移动</div>' +
          '<div class="row"><span class="kbd">Enter</span> 放置泡泡 / 被困时连按自救</div>' +
        '</div>' +
        '<div class="keys-box"><h4>通用</h4>' +
          '<div class="row"><span class="kbd">Esc</span> / <span class="kbd">P</span> 暂停</div>' +
          '<div class="row"><span class="kbd">M</span> 静音开关</div>' +
        '</div>' +
        (BA.TOUCH && BA.TOUCH.enabled
          ? '<div class="keys-box"><h4>触屏操作</h4>' +
            '<div class="row">左下区域按住滑动移动，按下处即摇杆原点</div>' +
            '<div class="row">右下按钮放置泡泡 / 被困时快速连点自救</div>' +
            '<div class="row">被困时来回拨动摇杆变向，同样计入自救</div>' +
            '<div class="row">右上按钮暂停，暂停时再点一次继续</div>' +
            '</div>'
          : '') +
        '<div class="keys-box"><h4>规则要点</h4>' +
          '<div class="row">先到 <b>3 胜</b> 赢下比赛（可调）</div>' +
          '<div class="row">超时进入 <b>死亡模式</b>，随机落泡</div>' +
        '</div>' +
      '</div>' +
      '<div class="tips" style="margin-top:18px">' +
        '<b>核心循环</b>：放泡 → 水柱十字炸开 → 炸掉软箱 → 捡道具变强 → 用水柱困住对手。<br>' +
        '<b>泡泡</b>：脚下放泡后 <span class="hl">2.4 秒</span>爆炸，水柱沿上下左右延伸，遇硬墙停止、炸掉软箱后停止、碰到其它泡泡会连锁引爆。<br>' +
        '<b>困泡</b>：被水柱打中不会立刻死，而是被裹进泡泡里 <span class="hl">3.6 秒</span>。期间狂按方向键或放泡键可以提前挣脱；队友贴身站住就能救你。倒计时结束泡泡破裂即淘汰。<br>' +
        '<b>道具</b>：<span class="hl">泡泡+1</span> 增加同时可放数量 · <span class="hl">威力+1</span> 水柱更远 · <span class="hl">速度+1</span> 跑得更快 · <span class="hl">踢靴</span> 走向泡泡可把它踢出去 · <span class="hl">护盾</span> 抵挡一次水柱。<br>' +
        '<b>踢泡泡</b>：踢出的泡泡会直线滑行，撞到障碍停下；撞到玩家会直接把他困住。<br>' +
        '<b>组队 2v2</b>：队友同色，队友被困时要贴身救援，全队存活到最后即获胜。' +
      '</div>' +
      '<div class="btnrow"><button class="btn" data-act="back">返回</button></div>';
    sc.appendChild(card);
    sc.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (btn) onAct('back');
    });
  }

  /* ---------------- 战绩 ---------------- */
  function buildStats() {
    var sc = screens.screenStats;
    sc.innerHTML = '';
    var st = SAVE.get().stats || {};
    var card = mk('div', 'card');
    card.innerHTML =
      '<div class="round-title" style="text-align:left;font-size:12px">STATS · 战绩</div>' +
      '<h2 style="margin:8px 0 10px;font-size:24px">生涯数据</h2>' +
      '<div class="stats-grid">' +
        stat(st.matches, 'MATCHES 比赛场次') +
        stat(st.wins, 'WINS 胜场') +
        stat((st.matches ? Math.round(st.wins / st.matches * 100) : 0) + '%', 'WIN RATE 胜率') +
        stat(st.rounds, 'ROUNDS 局数') +
        stat(st.bombs, 'BOMBS 放泡') +
        stat(st.blocks, 'BLOCKS 炸箱') +
        stat(st.items, 'ITEMS 道具') +
        stat(st.rescues, 'RESCUES 救援') +
        stat(st.bestStreak || 0, 'BEST STREAK 连胜') +
      '</div>' +
      '<div class="tips" style="margin-top:18px">当前连胜：<span class="hl">' + (SAVE.get().streak || 0) + '</span> 场</div>' +
      '<div class="btnrow"><button class="btn" data-act="back">返回</button></div>';
    sc.appendChild(card);
    sc.addEventListener('click', function (e) {
      if (e.target.closest('[data-act]')) show('title');
    });
  }
  function stat(v, k) {
    return '<div class="stat"><div class="v">' + U.esc(v == null ? 0 : v) + '</div><div class="k">' + U.esc(k) + '</div></div>';
  }

  /* ---------------- 暂停 ---------------- */
  function buildPause() {
    var sc = screens.screenPause;
    sc.innerHTML = '';
    var card = mk('div', 'card');
    card.style.width = 'min(460px, 86%)';
    card.innerHTML =
      '<div class="round-title">PAUSED</div>' +
      '<div class="round-big" style="font-size:44px">暂停中</div>' +
      '<div class="round-sub">按 <span class="kbd">Esc</span> 或 <span class="kbd">P</span> 继续</div>' +
      '<div class="btnrow" style="justify-content:center">' +
        '<button class="btn" data-act="resume">继续游戏</button>' +
        '<button class="btn ghost" data-act="help">操作说明</button>' +
        '<button class="btn ghost" data-act="quit">退出对战</button>' +
      '</div>';
    sc.appendChild(card);
    sc.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      btn.blur();
      var a = btn.dataset.act;
      if (a === 'resume') BA.GAME.resume();
      else if (a === 'quit') BA.GAME.quit();
      else if (a === 'help') { helpReturn = 'pause'; show('help'); }
    });
  }

  /* ---------------- 回合结算 ---------------- */
  function showRound(res) {
    var sc = screens.screenRound;
    sc.innerHTML = '';
    var S = BA.GAME.S;
    var card = mk('div', 'card');
    var win = res.winner;
    var title = '';
    var sub = '';
    var isMatch = !!S.matchWinner;
    if (S.mode === 'team') {
      var teamWins = win ? (S.players.filter(function (p) { return p.team === win.team; })[0] || {}).wins || 0 : 0;
      title = win ? ((win.team === 0 ? '蓝队' : '粉队') + ' 获胜') : '平局';
      sub = '队伍比分 ' + (S.players.filter(function (p) { return p.team === 0; })[0] || {}).wins +
            ' : ' + (S.players.filter(function (p) { return p.team === 1; })[0] || {}).wins;
    } else {
      title = win ? (win.isHuman ? (win.id === 'p1' ? '你赢了！' : 'P2 获胜！') : (win.name + ' 获胜')) : '全员淘汰';
      sub = '本局用时 ' + U.fmtTime(S.time) + ' · 炸箱 ' + S.stats.blocks + ' · 道具 ' + S.stats.items;
    }
    if (isMatch) {
      if (S.mode === 'team') {
        var mwt = S.matchWinner && S.matchWinner.team;
        title = S.matchWinnerHuman ? '比赛胜利！' : (mwt === 0 ? '蓝队获胜' : '粉队获胜');
      } else {
        title = S.matchWinnerHuman ? '比赛胜利！' : ((S.matchWinner && S.matchWinner.name) || '对手') + ' 获胜';
      }
      sub = S.matchWinnerHuman ? '你赢下了这场比赛 · 共 ' + S.round + ' 局' : '比赛结束 · 共 ' + S.round + ' 局';
    }
    var standings = S.players.map(function (p) {
      var pts = p.wins;
      var out = !p.alive && !res.winner ? true : (!p.alive && p !== res.winner);
      var nm = p.isHuman ? (p.id === 'p1' ? '你 (P1)' : 'P2') : p.name;
      return '<div class="stand' + (out ? ' out' : '') + '">' +
        '<img src="' + BA.ART.avatar(p.theme) + '" alt="">' +
        '<span style="color:' + p.color + ';font-weight:700">' + U.esc(nm) + '</span>' +
        '<span class="pts" style="color:' + p.color + '">' + pts + '</span>' +
        '</div>';
    }).join('');

    card.innerHTML =
      '<div class="round-title">ROUND ' + S.round + (isMatch ? ' · MATCH' : '') + '</div>' +
      '<div class="round-big' + (res.humanWon || isMatch && S.matchWinnerHuman ? '' : ' lose') + '">' + U.esc(title) + '</div>' +
      '<div class="round-sub">' + U.esc(sub) + '</div>' +
      '<div class="round-standings">' + standings + '</div>' +
      '<div class="round-sub" style="margin-top:16px;font-size:12px;color:#7f93b8">先到 ' + S.winsNeeded + ' 胜者赢得比赛</div>' +
      '<div class="btnrow" style="justify-content:center">' +
        (isMatch
          ? '<button class="btn" data-act="again">再来一场</button><button class="btn ghost" data-act="title">返回标题</button>'
          : '<button class="btn" data-act="next">下一局 · Space</button><button class="btn ghost" data-act="title">返回标题</button>') +
      '</div>';
    sc.appendChild(card);
    sc.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      btn.blur();
      var a = btn.dataset.act;
      if (a === 'next') { BA.GAME.nextRound(); }
      else if (a === 'again') onAct('again');
      else if (a === 'title') { BA.GAME.quit(); }
    });
    show('round');
  }

  /* ---------------- HUD ---------------- */
  function hud(S) {
    var strip = $('scoreStrip');
    if (!strip) return;
    strip.innerHTML = '';
    S.players.forEach(function (p) {
      var el = mk('div', 'sc' + (p.alive ? '' : ' dead') + (p.isHuman ? ' me' : '') + (S.winner === p ? ' win' : ''));
      el.style.setProperty('--c', p.color);
      var teamTag = S.mode === 'team' ? (p.team === 0 ? '蓝队' : '粉队') : '';
      var nm = p.isHuman ? (p.id === 'p1' ? '你 P1' : 'P2') : p.name;
      var state = p.trapped ? '被困 ' + p.trapT.toFixed(1) + 's' : (p.alive ? '' : '淘汰');
      el.innerHTML =
        '<div class="av"><img src="' + BA.ART.avatar(p.theme) + '" alt=""></div>' +
        '<div>' +
          '<div class="nm" style="color:' + p.color + '">' + U.esc(nm) + (teamTag ? ' <span style="opacity:.6;font-weight:400">' + teamTag + '</span>' : '') + '</div>' +
          '<div class="st">' +
            '<span>💧<b>' + p.maxBombs + '</b></span>' +
            '<span>🔥<b>' + p.power + '</b></span>' +
            (p.kick ? '<span>👢</span>' : '') +
            (p.shield ? '<span>🛡</span>' : '') +
            (state ? '<span style="color:#ff9db4">' + state + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="wins">' + p.wins + '</div>';
      strip.appendChild(el);
    });
  }

  var hudTimerAcc = 0;
  function tickHud(S, dt) {
    hudTimerAcc += dt;
    if (hudTimerAcc < 0.08) return;
    hudTimerAcc = 0;
    var cfg = CFG.get();
    var timeLeft = S.phase === 'play' ? Math.max(0, (cfg.roundTime || 150) - S.time) : (cfg.roundTime || 150);
    if (S.sudden) timeLeft = 0;
    var txt = S.sudden ? '死亡模式' : U.fmtTime(timeLeft);
    var te = $('timer');
    if (te && txt !== lastTimerTxt) {
      te.textContent = txt;
      te.classList.toggle('warn', S.sudden || timeLeft <= 15);
      lastTimerTxt = txt;
    }
    var rt = $('roundTag');
    if (rt) rt.textContent = '第 ' + S.round + ' 局 · 先到 ' + S.winsNeeded + ' 胜';
    var fe = $('fps');
    if (fe) {
      fe.classList.toggle('on', !!cfg.showFps);
      if (cfg.showFps) fe.textContent = BA.GAME.fps + ' FPS · ' + (BA.FX ? BA.FX.count : 0) + ' 粒子';
    }
  }

  /* ---------------- 倒计时 ---------------- */
  function countdown(n) {
    var el = $('countdown');
    if (!el) return;
    if (n <= 0) { el.classList.remove('on'); return; }
    var txt = n > 3 ? String(n) : String(n);
    if (el.textContent !== txt) {
      el.textContent = txt;
      el.classList.remove('on');
      void el.offsetWidth;
      el.classList.add('on');
    }
  }

  /* ---------------- toast ---------------- */
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, 1800);
  }

  function danger() {}

  /* ---------------- 键盘辅助 ---------------- */
  function handleKey(code) {
    if (cur === 'title') {
      if (code === 'Enter' || code === 'Space') { onAct('start'); return true; }
      if (code === 'KeyH') { show('help'); return true; }
      if (code === 'KeyS' && false) return false;
      if (code === 'KeyT') { buildStats(); show('stats'); return true; }
      return false;
    }
    if (cur === 'help') {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') { onAct('back'); return true; }
      return true;
    }
    if (cur === 'stats' || cur === 'settings') {
      if (code === 'Escape' || code === 'Enter') { show('title'); return true; }
      return true;
    }
    if (cur === 'pause') {
      if (code === 'Escape' || code === 'KeyP') { BA.GAME.resume(); return true; }
      return true;
    }
    if (cur === 'round') {
      if (code === 'Space' || code === 'Enter') {
        if (BA.GAME.S.matchWinner) onAct('again');
        else BA.GAME.nextRound();
        return true;
      }
      return true;
    }
    if (cur === 'match') {
      if (code === 'Space' || code === 'Enter') { onAct('again'); return true; }
      if (code === 'Escape') { BA.GAME.quit(); return true; }
      return true;
    }
    return false;
  }

  BA.UI = {
    init: init,
    show: show,
    hud: hud,
    tickHud: tickHud,
    toast: toast,
    countdown: countdown,
    showRound: showRound,
    handleKey: handleKey,
    danger: danger,
    refreshSettings: fillSettings,
    get current() { return cur; }
  };
})(window);
