/* 跳一跳 配置面板（契约 §配置面板）
 * IIFE，只挂 window.JJ.CONFIG_PANEL。
 * 不碰 localStorage；样式只作用于 .jj-config；无外部依赖。
 */
(function () {
  'use strict';
  if (window.JJ && window.JJ.CONFIG_PANEL) return;

  // ---------- 常量 ----------
  var LIMITS = {
    difficulty: [0.75, 1.35],
    chargeRate: [0.22, 0.42],
    platformTexture: 500 * 1024, // 500KB
    audio: 300 * 1024            // 每个音效 300KB
  };
  var AUDIO_KEYS = ['jump', 'land', 'fall', 'bonus'];
  var GREEN = '#07c160';

  // ---------- 状态 ----------
  var host = null;
  var panel = null;
  var mounted = false;
  var openFlag = false;
  var callbacks = [];
  var work = null;          // JJ.cfg 深拷贝
  var escHandler = null;

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function notify(snapshot) {
    for (var i = 0; i < callbacks.length; i++) {
      try { callbacks[i](snapshot); } catch (e) { /* 单个回调异常不影响其他 */ }
    }
  }

  // ---------- 样式注入 ----------
  var CSS = [
    '.jj-config{all:initial;display:block;touch-action:pan-y;font:14px/1.5 -apple-system,"PingFang SC","Helvetica Neue",Arial,sans-serif;color:#1a1a1a;}',
    '.jj-config *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}',
    '.jj-config .jj-cfg-mask{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9998;}',
    '.jj-config .jj-cfg-panel{position:fixed;left:50%;bottom:0;transform:translateX(-50%);',
    'width:min(420px,100vw);max-height:min(86vh,720px);display:flex;flex-direction:column;',
    'background:#fff;border:1px solid #d9d9d6;border-radius:4px 4px 0 0;z-index:9999;',
    'padding-bottom:env(safe-area-inset-bottom,0);}',
    '.jj-config .jj-cfg-head{display:flex;align-items:center;justify-content:space-between;',
    'padding:12px 14px;border-bottom:1px solid #e8e8e6;flex:none;}',
    '.jj-config .jj-cfg-head b{font-size:16px;font-weight:600;}',
    '.jj-config .jj-cfg-close{width:32px;height:32px;border:1px solid #d9d9d6;background:#fff;',
    'border-radius:4px;font-size:16px;line-height:1;color:#1a1a1a;cursor:pointer;padding:0;}',
    '.jj-config .jj-cfg-body{overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 14px;flex:1 1 auto;}',
    '.jj-config .jj-cfg-row{margin-bottom:14px;}',
    '.jj-config .jj-cfg-label{display:block;font-size:13px;color:#555;margin-bottom:4px;}',
    '.jj-config .jj-cfg-val{color:#888;font-size:12px;margin-left:6px;}',
    '.jj-config input[type=range]{width:100%;accent-color:' + GREEN + ';margin:2px 0;}',
    '.jj-config .jj-cfg-check{display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;}',
    '.jj-config .jj-cfg-check input{width:16px;height:16px;accent-color:' + GREEN + ';}',
    '.jj-config input[type=color]{width:56px;height:32px;border:1px solid #d9d9d6;border-radius:4px;',
    'padding:2px;background:#fff;vertical-align:middle;}',
    '.jj-config .jj-cfg-bgval{vertical-align:middle;margin-left:8px;font-size:12px;color:#888;}',
    '.jj-config .jj-cfg-btn{display:inline-block;border:1px solid #d9d9d6;background:#fff;color:#1a1a1a;',
    'border-radius:4px;padding:7px 12px;font-size:13px;cursor:pointer;margin:2px 6px 6px 0;}',
    '.jj-config .jj-cfg-btn:active{opacity:.8;}',
    '.jj-config .jj-cfg-btn-primary{background:' + GREEN + ';border-color:' + GREEN + ';color:#fff;}',
    '.jj-config .jj-cfg-btn-danger{color:#c0392b;border-color:#d9d9d6;background:#fff;}',
    '.jj-config .jj-cfg-file{position:relative;overflow:hidden;display:inline-block;}',
    '.jj-config .jj-cfg-file input{position:absolute;left:0;top:0;width:100%;height:100%;',
    'opacity:0;cursor:pointer;}',
    '.jj-config .jj-cfg-preview{font-size:12px;color:#888;word-break:break-all;margin-top:2px;}',
    '.jj-config .jj-cfg-preview img{max-width:80px;max-height:56px;display:block;',
    'border:1px solid #e0e0de;margin-top:4px;}',
    '.jj-config .jj-cfg-audio-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;}',
    '.jj-config .jj-cfg-audio-row span{min-width:56px;font-size:13px;color:#555;}',
    '.jj-config .jj-cfg-status{font-size:12px;margin-top:2px;}',
    '.jj-config .jj-cfg-status.ok{color:' + GREEN + ';}',
    '.jj-config .jj-cfg-status.err{color:#c0392b;}',
    '.jj-config .jj-cfg-foot{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #e8e8e6;flex:none;}',
    '.jj-config .jj-cfg-foot .jj-cfg-btn{flex:1;text-align:center;margin:0;}',
    '.jj-config .jj-cfg-foot .jj-cfg-btn-primary{flex:2;}',
    '.jj-config textarea{width:100%;height:64px;font:12px/1.4 Menlo,Consolas,monospace;',
    'border:1px solid #d9d9d6;border-radius:4px;padding:6px;resize:vertical;background:#fafafa;}',
    '.jj-config .jj-cfg-sec{font-size:12px;color:#999;margin:10px 0 6px;border-top:1px dashed #e8e8e6;padding-top:8px;}'
  ].join('');

  function injectStyle() {
    if (document.getElementById('jj-config-style')) return;
    var st = document.createElement('style');
    st.id = 'jj-config-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- 工具 ----------
  function setStatus(msg, cls) {
    var el = panel && panel.querySelector('.jj-cfg-status');
    if (el) { el.textContent = msg || ''; el.className = 'jj-cfg-status' + (cls ? ' ' + cls : ''); }
  }
  function fmtSize(bytes) {
    return bytes < 1024 ? bytes + 'B' : (bytes / 1024).toFixed(1) + 'KB';
  }
  // 图片文件 → 缩至 256px 的 dataURL（JPEG 可保体积；PNG 保透明）
  function imageToDataURL(file, cb) {
    var reader = new FileReader();
    reader.onerror = function () { cb('图片读取失败'); };
    reader.onload = function () {
      var img = new Image();
      img.onerror = function () { cb('不是有效图片文件'); };
      img.onload = function () {
        var scale = Math.min(1, 256 / Math.max(img.width, img.height));
        var w = Math.max(1, Math.round(img.width * scale));
        var h = Math.max(1, Math.round(img.height * scale));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        var out;
        try { out = cv.toDataURL('image/png'); } catch (e) { cb('图片编码失败'); return; }
        cb(null, out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  // 音频文件 → dataURL（校验类型与大小）
  function audioToDataURL(file, cb) {
    if (!/^audio\//.test(file.type) && !/\.(mp3|wav|ogg|m4a|aac)$/i.test(file.name)) {
      cb('请选择音频文件（mp3/wav/ogg 等）'); return;
    }
    if (file.size > LIMITS.audio) {
      cb('音频超过 ' + fmtSize(LIMITS.audio) + ' 限额（当前 ' + fmtSize(file.size) + '）'); return;
    }
    var reader = new FileReader();
    reader.onerror = function () { cb('音频读取失败'); };
    reader.onload = function () { cb(null, reader.result); };
    reader.readAsDataURL(file);
  }

  // ---------- 构建 DOM ----------
  function build() {
    panel = document.createElement('div');
    panel.className = 'jj-config';
    panel.innerHTML =
      '<div class="jj-cfg-mask"></div>' +
      '<div class="jj-cfg-panel" role="dialog" aria-label="游戏设置">' +
      '  <div class="jj-cfg-head"><b>设置</b><button type="button" class="jj-cfg-close" aria-label="关闭">✕</button></div>' +
      '  <div class="jj-cfg-body">' +
      '    <div class="jj-cfg-row">' +
      '      <label class="jj-cfg-label">难度<span class="jj-cfg-val" data-v="difficulty"></span></label>' +
      '      <input type="range" data-k="difficulty" min="0.75" max="1.35" step="0.01">' +
      '    </div>' +
      '    <div class="jj-cfg-row">' +
      '      <label class="jj-cfg-label">蓄力速度<span class="jj-cfg-val" data-v="chargeRate"></span></label>' +
      '      <input type="range" data-k="chargeRate" min="0.22" max="0.42" step="0.01">' +
      '    </div>' +
      '    <label class="jj-cfg-check"><input type="checkbox" data-k="sound"> 声音</label>' +
      '    <label class="jj-cfg-check"><input type="checkbox" data-k="showGuide"> 显示落点辅助线</label>' +
      '    <div class="jj-cfg-row">' +
      '      <label class="jj-cfg-label">背景颜色</label>' +
      '      <input type="color" data-k="background"><span class="jj-cfg-bgval" data-v="background"></span>' +
      '    </div>' +
      '    <div class="jj-cfg-sec">平台贴图（可选，限 500KB，自动缩至 256px）</div>' +
      '    <div class="jj-cfg-row" data-sec="texture">' +
      '      <span class="jj-cfg-btn jj-cfg-file">上传图片<input type="file" accept="image/*" data-file="platformTexture"></span>' +
      '      <button type="button" class="jj-cfg-btn" data-clear="platformTexture">清除</button>' +
      '      <div class="jj-cfg-preview" data-prev="platformTexture"></div>' +
      '    </div>' +
      '    <div class="jj-cfg-sec">自定义音效（每个限 300KB，留空使用内置合成音）</div>' +
      '    <div class="jj-cfg-row" data-sec="audio"></div>' +
      '    <div class="jj-cfg-sec">配置导出 / 导入</div>' +
      '    <div class="jj-cfg-row">' +
      '      <button type="button" class="jj-cfg-btn" data-act="export">导出 JSON</button>' +
      '      <span class="jj-cfg-btn jj-cfg-file">导入 JSON<input type="file" accept="application/json,.json" data-file="json"></span>' +
      '    </div>' +
      '    <div class="jj-cfg-row"><textarea class="jj-cfg-json" placeholder="也可粘贴 JSON 后点「应用粘贴内容」"></textarea>' +
      '      <button type="button" class="jj-cfg-btn" data-act="apply-paste" style="margin-top:6px;">应用粘贴内容</button></div>' +
      '    <div class="jj-cfg-status"></div>' +
      '  </div>' +
      '  <div class="jj-cfg-foot">' +
      '    <button type="button" class="jj-cfg-btn" data-act="reset">恢复默认</button>' +
      '    <button type="button" class="jj-cfg-btn jj-cfg-btn-primary" data-act="save">保存</button>' +
      '  </div>' +
      '</div>';

    // 音效行
    var audioSec = panel.querySelector('[data-sec="audio"]');
    AUDIO_KEYS.forEach(function (k) {
      var row = document.createElement('div');
      row.className = 'jj-cfg-audio-row';
      row.innerHTML =
        '<span>' + k + '</span>' +
        '<span class="jj-cfg-btn jj-cfg-file">上传<input type="file" accept="audio/*" data-file="audio:' + k + '"></span>' +
        '<button type="button" class="jj-cfg-btn" data-clear="audio:' + k + '">清除</button>' +
        '<span class="jj-cfg-status" data-astat="' + k + '"></span>';
      audioSec.appendChild(row);
    });
    panel.querySelector('.jj-cfg-mask').addEventListener('click', function () { close(); });
    panel.querySelector('.jj-cfg-close').addEventListener('click', function () { close(); });
    bindControls();
    panel.style.display = 'none'; // mount 后默认隐藏，open 时再显示
    return panel;
  }

  function syncUI() {
    if (!panel || !work) return;
    ['difficulty', 'chargeRate'].forEach(function (k) {
      var input = panel.querySelector('[data-k="' + k + '"]');
      input.value = work[k];
      panel.querySelector('[data-v="' + k + '"]').textContent = Number(work[k]).toFixed(2);
    });
    panel.querySelector('[data-k="sound"]').checked = !!work.sound;
    panel.querySelector('[data-k="showGuide"]').checked = !!work.showGuide;
    var bg = panel.querySelector('[data-k="background"]');
    bg.value = work.background || '#dededc';
    panel.querySelector('[data-v="background"]').textContent = work.background || '';
    renderTexturePreview();
    AUDIO_KEYS.forEach(renderAudioStatus);
  }

  function renderTexturePreview() {
    var el = panel.querySelector('[data-prev="platformTexture"]');
    if (work.platformTexture) {
      el.innerHTML = '<img alt="贴图预览" src="' + work.platformTexture + '">';
    } else {
      el.textContent = '未设置（使用内置立体平台）';
    }
  }
  function renderAudioStatus(k) {
    var el = panel.querySelector('[data-astat="' + k + '"]');
    var has = work.audio && work.audio[k];
    el.textContent = has ? '已自定义 ✓' : '默认';
    el.className = 'jj-cfg-status' + (has ? ' ok' : '');
  }

  function bindControls() {
    panel.addEventListener('input', function (e) {
      var t = e.target;
      var k = t.getAttribute('data-k');
      if (!k || !work) return;
      if (t.type === 'range') {
        var v = parseFloat(t.value);
        var lim = LIMITS[k];
        v = Math.min(lim[1], Math.max(lim[0], v));
        work[k] = v;
        panel.querySelector('[data-v="' + k + '"]').textContent = v.toFixed(2);
      } else if (t.type === 'checkbox') {
        work[k] = t.checked;
      } else if (t.type === 'color') {
        work[k] = t.value;
        panel.querySelector('[data-v="' + k + '"]').textContent = t.value;
      }
      setStatus('');
    });

    // 文件
    panel.addEventListener('change', function (e) {
      var t = e.target;
      var fkey = t.getAttribute('data-file');
      if (!fkey || !t.files || !t.files[0]) return;
      var file = t.files[0];
      t.value = ''; // 允许重复选同一文件
      setStatus('');

      if (fkey === 'platformTexture') {
        if (!/^image\//.test(file.type)) { setStatus('请选择图片文件', 'err'); return; }
        if (file.size > LIMITS.platformTexture) {
          setStatus('图片超过 ' + fmtSize(LIMITS.platformTexture) + ' 限额（当前 ' + fmtSize(file.size) + '）', 'err'); return;
        }
        imageToDataURL(file, function (err, dataURL) {
          if (err) { setStatus(err, 'err'); return; }
          work.platformTexture = dataURL;
          renderTexturePreview();
          setStatus('贴图已载入（' + fmtSize(dataURL.length) + '），点「保存」生效', 'ok');
        });
      } else if (fkey === 'json') {
        importJSONFile(file);
      } else if (fkey.indexOf('audio:') === 0) {
        var ak = fkey.slice(6);
        audioToDataURL(file, function (err, dataURL) {
          if (err) { setStatus(err, 'err'); return; }
          if (!work.audio) work.audio = {};
          work.audio[ak] = dataURL;
          renderAudioStatus(ak);
          setStatus('音效 ' + ak + ' 已载入（' + fmtSize(dataURL.length) + '），点「保存」生效', 'ok');
        });
      }
    });

    // 清除
    panel.addEventListener('click', function (e) {
      var clearKey = e.target.getAttribute && e.target.getAttribute('data-clear');
      if (clearKey && work) {
        if (clearKey === 'platformTexture') {
          work.platformTexture = '';
          renderTexturePreview();
        } else if (clearKey.indexOf('audio:') === 0) {
          var ak = clearKey.slice(6);
          if (work.audio) delete work.audio[ak];
          renderAudioStatus(ak);
        }
        setStatus('已清除，点「保存」生效', 'ok');
        return;
      }
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'export') doExport();
      else if (act === 'apply-paste') applyPastedJSON();
      else if (act === 'reset') doReset();
      else if (act === 'save') doSave();
    });
  }

  // ---------- 导出 / 导入 ----------
  function doExport() {
    var json = JSON.stringify(JJ.LOGIC.sanitize(work), null, 2);
    var ta = panel.querySelector('.jj-cfg-json');
    ta.value = json;
    setStatus('配置已导出到下方文本框，可复制保存为 .json 文件', 'ok');
    try { ta.select(); if (document.execCommand) document.execCommand('copy'); } catch (e) { /* 忽略 */ }
  }
  function applyJSONText(text, okMsg) {
    var obj;
    try { obj = JSON.parse(text); }
    catch (e) { setStatus('JSON 解析失败：' + e.message, 'err'); return false; }
    var clean = JJ.LOGIC.sanitize(obj);
    if (!clean || typeof clean !== 'object') { setStatus('配置校验失败', 'err'); return false; }
    work = clean;
    syncUI();
    setStatus(okMsg || '配置已导入（白名单校验通过），点「保存」生效', 'ok');
    return true;
  }
  function importJSONFile(file) {
    if (file.size > 512 * 1024) { setStatus('JSON 文件过大（限 512KB）', 'err'); return; }
    var reader = new FileReader();
    reader.onerror = function () { setStatus('JSON 读取失败', 'err'); };
    reader.onload = function () { applyJSONText(String(reader.result)); };
    reader.readAsText(file);
  }
  function applyPastedJSON() {
    var ta = panel.querySelector('.jj-cfg-json');
    if (!ta.value.trim()) { setStatus('请先粘贴 JSON 内容', 'err'); return; }
    applyJSONText(ta.value);
  }
  function doReset() {
    work = JJ.LOGIC.defaultCfg();
    syncUI();
    panel.querySelector('.jj-cfg-json').value = '';
    setStatus('已恢复默认配置，点「保存」生效', 'ok');
  }

  // ---------- 保存 ----------
  function doSave() {
    var clean = JJ.LOGIC.sanitize(work);
    if (!clean || typeof clean !== 'object') { setStatus('配置校验失败，无法保存', 'err'); return; }
    work = clean;
    notify(clone(work));
    close();
  }

  // ---------- 公开 API ----------
  function mount(h) {
    host = h;
    if (!mounted && host) {
      injectStyle();
      build();
      host.appendChild(panel);
      mounted = true;
    }
  }
  function open() {
    if (openFlag) return;
    if (!mounted) mount(host || document.body);
    if (typeof JJ.pause === 'function') JJ.pause();
    work = clone(JJ.cfg); // 主线 getter，实时读取
    syncUI();
    setStatus('');
    panel.style.display = 'block';
    openFlag = true;
    escHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    document.addEventListener('keydown', escHandler);
  }
  function close() {
    if (!openFlag) return;
    openFlag = false;
    panel.style.display = 'none';
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
    if (typeof JJ.resume === 'function') JJ.resume();
  }
  function isOpen() { return openFlag; }
  function onChange(cb) {
    if (typeof cb === 'function') callbacks.push(cb);
    return function () {
      var i = callbacks.indexOf(cb);
      if (i >= 0) callbacks.splice(i, 1);
    };
  }

  window.JJ = window.JJ || {};
  window.JJ.CONFIG_PANEL = {
    mount: mount,
    open: open,
    close: close,
    isOpen: isOpen,
    onChange: onChange
  };
})();
