/* bull-flight config —— 配置中心：默认值/localStorage/work 副本/设置面板（主线负责）
 * 红线：面板永不直接写 localStorage，统一走 apply()
 */
(function () {
  window.BF = window.BF || {};
  var KEY = 'bf.cfg.v1';
  var DEF = {
    gravity: 450, jumpV: 260, noise: 8, candleTicks: 22, scrollSpeed: 95,
    pipeGap: 0.30, pipeEveryMin: 12, pipeEveryMax: 16, buyEveryMin: 4, buyEveryMax: 7,
    maxFall: 250, feeRate: 0.0004, loanK: 0.5, bgm: true, sfx: true, bullImg: null
  };
  var cur = load();
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEF));
      var o = JSON.parse(raw), r = JSON.parse(JSON.stringify(DEF));
      for (var k in r) if (o[k] !== undefined) r[k] = o[k];
      return r;
    } catch (e) { return JSON.parse(JSON.stringify(DEF)); }
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {} }
  function all() { return cur; }
  function apply(snapshot) {
    var r = JSON.parse(JSON.stringify(DEF));
    for (var k in r) if (snapshot[k] !== undefined) r[k] = snapshot[k];
    cur = r; persist(); onChange();
  }
  function set(k, v) { cur[k] = v; persist(); onChange(); }
  function onChange() {
    try {
      if (BF.SFX) { BF.SFX.setMuted(!cur.sfx); BF.SFX.bgmOn(cur.bgm); }
      if (cur.bullImg && BF.GAME) { BF.GAME.setBullImg(0, cur.bullImg); BF.GAME.setBullImg(1, cur.bullImg); }
    } catch (e) {}
  }
  function exportJSON() { return JSON.stringify(cur, null, 2); }
  function importJSON(str) { var o = JSON.parse(str); apply(o); }

  // ---------- 面板 ----------
  var $ = function (id) { return document.getElementById(id); };
  var panel = null;
  function openPanel() {
    if (!panel) build();
    panel.classList.add('show');
    syncForm();
  }
  function closePanel() { if (panel) panel.classList.remove('show'); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function build() {
    panel = el('div', 'cfg-panel'); panel.id = 'panel-cfg';
    var card = el('div', 'cfg-card');
    card.appendChild(el('div', 'cfg-title', null || '<span>设置</span>'));
    // 牛图片上传
    var imgRow = el('div', 'cfg-row');
    imgRow.innerHTML = '<label>小牛立绘替换</label>';
    var imgInput = document.createElement('input');
    imgInput.type = 'file'; imgInput.accept = 'image/*'; imgInput.className = 'cfg-file';
    imgInput.onchange = function () {
      var f = imgInput.files && imgInput.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { set('bullImg', rd.result); toast('小牛立绘已更新'); };
      rd.readAsDataURL(f);
    };
    imgRow.appendChild(imgInput);
    card.appendChild(imgRow);
    // 滑杆组
    var sliders = [
      ['gravity', '重力', 200, 900, 10],
      ['jumpV', '点击冲力', 160, 480, 5],
      ['noise', '行情噪声', 0, 60, 1],
      ['scrollSpeed', 'K线滚动速度', 60, 220, 5],
      ['pipeGap', '管道空隙', 0.14, 0.34, 0.005],
      ['feeRate', '税费率', 0, 0.003, 0.0001]
    ];
    var form = {};
    sliders.forEach(function (s) {
      var row = el('div', 'cfg-row');
      var lab = el('label', null, s[1] + ' <b></b>');
      var inp = document.createElement('input');
      inp.type = 'range'; inp.min = s[2]; inp.max = s[3]; inp.step = s[4];
      form[s[0]] = { inp: inp, lab: lab.querySelector('b'), dec: s[0] === 'pipeGap' || s[0] === 'feeRate' ? 4 : 0 };
      inp.oninput = function () {
        var v = parseFloat(inp.value);
        lab.querySelector('b').textContent = form[s[0]].dec ? v.toFixed(form[s[0]].dec) : v;
      };
      inp.onchange = function () { set(s[0], parseFloat(inp.value)); };
      row.appendChild(lab); row.appendChild(inp);
      card.appendChild(row);
    });
    // 开关
    var sw1 = el('div', 'cfg-row cfg-switches');
    [['bgm', '背景音乐'], ['sfx', '音效']].forEach(function (p) {
      var l = el('label', 'cfg-sw', p[1]);
      var c = document.createElement('input'); c.type = 'checkbox';
      c.onchange = function () { set(p[0], c.checked); };
      form[p[0]] = c;
      l.insertBefore(c, l.firstChild);
      sw1.appendChild(l);
    });
    card.appendChild(sw1);
    // 充值中心（虚拟资金）
    var rc = el('div', 'cfg-row');
    rc.innerHTML = '<label>充值中心 <i style="font-style:normal;opacity:.6">虚拟资金 · 仅用于游戏</i></label>';
    var rcRow = el('div', 'cfg-recharge');
    [10000, 100000, 1000000].forEach(function (amt) {
      var b = el('button', 'btn ghost sm', '+¥' + (amt >= 10000 ? (amt / 10000) + '万' : amt));
      b.onclick = function () { openPay(amt, b); };
      rcRow.appendChild(b);
    });
    rc.appendChild(rcRow);
    card.appendChild(rc);
    // 模拟支付确认
    var payDlg = null;
    function openPay(amt, btn) {
      if (!payDlg) {
        payDlg = document.createElement('div');
        payDlg.className = 'dlg';
        payDlg.innerHTML = '<div class="dlg-card pay"><h3>模拟支付</h3>' +
          '<div class="pay-amt">¥<b id="pay-amt">0</b></div>' +
          '<p class="dim">这是游戏虚拟资金充值，不涉及任何真实货币，点击即到账。</p>' +
          '<button class="btn primary" id="pay-ok">确认支付</button>' +
          '<button class="btn ghost" id="pay-no">取消</button></div>';
        document.body.appendChild(payDlg);
        $('pay-no').onclick = function () { payDlg.classList.remove('show'); };
      }
      $('pay-amt').textContent = amt.toLocaleString('en-US');
      var ok = $('pay-ok');
      ok.textContent = '确认支付'; ok.disabled = false;
      ok.onclick = function () {
        ok.disabled = true; ok.textContent = '支付中…';
        setTimeout(function () {
          payDlg.classList.remove('show');
          if (BF.UI && BF.UI.recharge) BF.UI.recharge(amt);
          if (BF.SFX && BF.SFX.play) { try { BF.SFX.play('buy'); } catch (e) {} }
        }, 700);
      };
      payDlg.classList.add('show');
    }
    // 导出导入
    var io = el('div', 'cfg-row cfg-io');
    var be = el('button', 'btn ghost sm', '导出配置');
    be.onclick = function () {
      var blob = new Blob([exportJSON()], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bull-flight-cfg.json'; a.click();
    };
    var bi = el('button', 'btn ghost sm', '导入配置');
    var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'application/json'; fi.style.display = 'none';
    fi.onchange = function () {
      var f = fi.files && fi.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { try { importJSON(rd.result); toast('配置已导入'); syncForm(); } catch (e) { toast('导入失败：不是有效配置'); } };
      rd.readAsText(f);
    };
    bi.onclick = function () { fi.click(); };
    io.appendChild(be); io.appendChild(bi); io.appendChild(fi);
    card.appendChild(io);
    // 恢复默认 + 关闭
    var foot = el('div', 'cfg-foot');
    var br = el('button', 'btn ghost sm', '恢复默认');
    br.onclick = function () { apply(JSON.parse(JSON.stringify(DEF))); if (cur.bullImg !== undefined) set('bullImg', null); toast('已恢复默认'); syncForm(); };
    var bc = el('button', 'btn primary sm', '完成');
    bc.onclick = closePanel;
    foot.appendChild(br); foot.appendChild(bc);
    card.appendChild(foot);
    panel.appendChild(card);
    panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });
    document.body.appendChild(panel);
    function toast(s) { if (BF.UI && BF.UI.toast) BF.UI.toast(s); }
    function syncForm() {
      sliders.forEach(function (s) {
        var f = form[s[0]];
        f.inp.value = cur[s[0]];
        f.lab.textContent = f.dec ? Number(cur[s[0]]).toFixed(f.dec) : cur[s[0]];
      });
      form.bgm.checked = !!cur.bgm; form.sfx.checked = !!cur.sfx;
    }
    panel.__sync = syncForm;
  }
  function syncForm() { if (panel && panel.__sync) panel.__sync(); }
  window.BF.CFG = { all: all, apply: apply, set: set, exportJSON: exportJSON, importJSON: importJSON, openPanel: openPanel, closePanel: closePanel, DEF: DEF };
})();
