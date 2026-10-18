'use strict';

/* 视图：首页 / 大厅 / 结算 / 分享 / 结束页，以及共享的赛道组件 */

/* ---------- 角色 SVG（程序化，无图片资源） ---------- */

function runnerSVG(color) {
  return `<svg class="avatar" viewBox="0 0 26 30" aria-hidden="true">
    <circle cx="13" cy="5.5" r="4" fill="${color}"/>
    <rect x="9.4" y="10.2" width="7.2" height="9.6" rx="3" fill="${color}"/>
    <rect x="4.6" y="11.2" width="2.6" height="7.6" rx="1.3" fill="${color}" transform="rotate(26 5.9 11.5)"/>
    <rect x="18.8" y="11.2" width="2.6" height="7.6" rx="1.3" fill="${color}" transform="rotate(-26 20.1 11.5)"/>
    <rect x="8.4" y="19.2" width="3" height="9" rx="1.4" fill="${color}" transform="rotate(12 9.9 19.5)"/>
    <rect x="14.6" y="19.2" width="3" height="9" rx="1.4" fill="${color}" transform="rotate(-16 16.1 19.5)"/>
  </svg>`;
}

function boatSVG(color) {
  return `<svg class="avatar" viewBox="0 0 42 26" aria-hidden="true">
    <path d="M2 15 Q5 21 13 21 L29 21 Q38 21 39 14 L33 14 Q20 17 6 14 Z" fill="${color}"/>
    <path d="M35 14 Q41 12 38.5 4.5 Q35 9 31 11 Z" fill="${color}"/>
    <circle cx="37.5" cy="7.5" r="1.5" fill="#fffdf6"/>
    <circle cx="13" cy="10.5" r="2.6" fill="${color}"/>
    <rect x="18.4" y="4.5" width="1.8" height="9.5" rx="0.9" fill="${color}" transform="rotate(26 19.3 9)"/>
    <circle cx="24" cy="10.5" r="2.6" fill="${color}" opacity="0.75"/>
  </svg>`;
}

function avatarFor(pid, theme) {
  const color = colorOf(pid);
  return theme === 'dragon' ? boatSVG(color) : runnerSVG(color);
}

/* ---------- 赛道组件：mini（手机顶部）/ big（大屏）共用 ---------- */

// 实时名次：先完赛的在前（按完赛时间），未完赛按进度比例——
// 各年级题量不同，不能用答对题数直接比大小
function sortPlayers(st) {
  return [...st.players].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishedAt || 0) - (b.finishedAt || 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    const ra = a.progress / Math.max(1, a.total);
    const rb = b.progress / Math.max(1, b.total);
    return (rb - ra) || (a.pid < b.pid ? -1 : 1);
  });
}

function lanesEl(mini, selfPid) {
  const box = h('div', { class: 'lanes' + (mini ? ' mini' : '') });
  box.appendChild(h('div', { class: 'finishline' }));
  const rows = new Map(); // pid -> {lane, run, tag, pct, rank}
  let curTheme = '';

  function sync(st) {
    if (st.theme !== curTheme) {
      curTheme = st.theme;
      box.classList.toggle('t-track', st.theme !== 'dragon');
      box.classList.toggle('t-dragon', st.theme === 'dragon');
    }
    const ids = new Set(st.players.map((p) => p.pid));
    for (const [pid, r] of rows) {
      if (!ids.has(pid)) { r.lane.remove(); rows.delete(pid); }
    }
    for (const p of st.players) {
      let r = rows.get(p.pid);
      if (!r) {
        const lane = h('div', { class: 'lane' });
        const rank = h('span', { class: 'rank' }, '');
        const run = h('div', { class: 'runner' + (p.pid === selfPid ? ' mine' : '') });
        run.innerHTML = avatarFor(p.pid, curTheme);
        const tag = h('span', { class: 'tag' }, '');
        const pct = h('span', { class: 'pct' }, '');
        // 冲线后整块翻到终点线左侧，标签顺序也随之镜像，保证"完赛"不压线
        run.append(rank, tag, pct);
        lane.appendChild(run);
        box.appendChild(lane);
        rows.set(p.pid, (r = { lane, run, tag, pct, rank }));
      }
      r.tag.textContent = p.nickname;
      const total = Math.max(1, p.total);
      // 终点线在 92%；冲线后停在 84% 并整体左翻，与终点线留出明显间隙
      const pos = p.finished ? 84 : 4 + (p.progress / total) * 80;
      r.run.style.left = pos + '%';
      r.pct.textContent = p.finished ? '完赛' : `${Math.round((p.progress / total) * 100)}%`;
      r.run.classList.toggle('done', !!p.finished);
      // 冲线后把整块头像翻到终点线左侧，避免跑出赛道被裁掉
      r.run.classList.toggle('at-finish', !!p.finished);
      r.run.classList.toggle('offline-run', !p.online && st.status === 'racing');
    }
    const order = sortPlayers(st);
    order.forEach((p, i) => {
      const r = rows.get(p.pid);
      if (r) r.rank.textContent = String(i + 1);
    });
  }
  return { el: box, sync };
}

/* ---------- 领奖台 + 名次列表 ---------- */

function podiumEl(st) {
  const byPid = new Map(st.players.map((p) => [p.pid, p]));
  const top = (st.ranks && st.ranks.length ? st.ranks : sortPlayers(st).map((p) => p.pid))
    .map((pid) => byPid.get(pid)).filter(Boolean).slice(0, 3);
  const order = [1, 0, 2]; // 视觉：2 1 3
  const box = h('div', { class: 'podium' });
  for (const i of order) {
    const p = top[i];
    const col = h('div', { class: `col p${i + 1}` });
    if (p) {
      col.append(
        h('div', { class: 'who' }, p.nickname),
        h('div', { class: 'block' }, String(i + 1)),
      );
    } else {
      col.append(h('div', { class: 'block', style: 'visibility:hidden' }, '-'));
    }
    box.appendChild(col);
  }
  return box;
}

function ranksEl(st, selfPid) {
  const byPid = new Map(st.players.map((p) => [p.pid, p]));
  const order = (st.ranks && st.ranks.length ? st.ranks : sortPlayers(st).map((p) => p.pid));
  const box = h('div', { class: 'ranks' });
  order.forEach((pid, i) => {
    const p = byPid.get(pid);
    if (!p) return;
    box.appendChild(h('div', { class: 'rank-row' + (pid === selfPid ? ' mine' : '') },
      h('span', { class: 'no' }, `${i + 1}.`),
      h('span', { class: 'pdot', style: `background:${colorOf(pid)}` }),
      h('span', {}, p.nickname + (pid === selfPid ? '（我）' : '')),
      h('span', { class: 'acc' },
        p.finished ? `${p.progress}/${p.total} 对 · 完赛` : `${p.progress}/${p.total} 对 · 未冲线`),
    ));
  });
  return box;
}

/* ---------- 分享弹层 ---------- */

function qrSvg(url) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2 })
      .replace(/\swidth="[^"]+"/, ' width="100%"')
      .replace(/\sheight="[^"]+"/, ' height="100%"');
  } catch { return ''; }
}

function shareModal(code) {
  const url = joinUrl(code);
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) overlay.remove(); } });
  const modal = h('div', { class: 'modal' },
    h('h3', {}, '邀请小伙伴扫码加入'),
    h('div', { class: 'qr', html: qrSvg(url) }),
    h('div', { class: 'link' }, url),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary btn-sm', onclick: async (e) => {
        const ok = await copyText(url);
        toast(ok ? '链接已复制' : '复制失败，长按链接手动复制');
        e.target.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(() => { e.target.textContent = '复制链接'; }, 1600);
      } }, '复制链接'),
      h('button', { class: 'btn btn-sm', onclick: () => overlay.remove() }, '关闭'),
    ),
  );
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/* ---------- 首页 ---------- */

function mountHome(container, prefillCode) {
  container.innerHTML = '';
  let grade = prefs.grade;

  const bunting = `<svg class="bunting" viewBox="0 0 110 46" aria-hidden="true">
    <path d="M0 6 Q55 16 110 6" stroke="${'#2c2620'}" stroke-width="2" fill="none"/>
    <path d="M8 8 l9 16 l9 -13 Z" fill="#c9573f"/>
    <path d="M34 11 l9 16 l9 -14 Z" fill="#3f7a4e"/>
    <path d="M62 12 l9 15 l9 -13 Z" fill="#d9a13b"/>
    <path d="M88 10 l9 14 l9 -12 Z" fill="#2f6b9e"/>
  </svg>`;

  const nick = h('input', { class: 'text', maxlength: '12', placeholder: '给自己起个昵称', value: prefs.nick });
  const gradeBtns = [];
  const gradeGrid = h('div', { class: 'grade-grid' });
  for (const g of [1, 2, 3, 4]) {
    const b = h('button', {
      class: 'grade-btn' + (g === grade ? ' on' : ''), type: 'button',
      onclick: () => { grade = g; prefs.grade = g; gradeBtns.forEach((x, i) => x.classList.toggle('on', i + 1 === g)); },
    }, GRADE_NAMES[g]);
    gradeBtns.push(b);
    gradeGrid.appendChild(b);
  }
  const codeInput = h('input', {
    class: 'text code', inputmode: 'numeric', maxlength: '8',
    placeholder: '8 位房间号', value: prefillCode || '',
    oninput: () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 8); },
  });
  const createBtn = h('button', { class: 'btn btn-primary', type: 'button' }, '创建房间（当房主）');
  const joinBtn = h('button', { class: 'btn btn-green', type: 'button' }, '加入房间');

  async function doCreate() {
    prefs.nick = nick.value.trim();
    createBtn.disabled = true;
    const r = await api('/api/rooms', { nickname: prefs.nick || '小选手', grade });
    createBtn.disabled = false;
    if (!r.ok) return toast(r.data.error || '创建失败');
    store.set(r.data.code, { token: r.data.token, pid: r.data.pid });
    location.hash = `#/room/${r.data.code}`;
  }

  async function doJoin() {
    const code = codeInput.value.trim();
    if (!/^\d{8}$/.test(code)) return toast('房间号是 8 位数字哦');
    prefs.nick = nick.value.trim();
    joinBtn.disabled = true;
    const r = await api(`/api/rooms/${code}/join`, { nickname: prefs.nick || '小选手', grade });
    joinBtn.disabled = false;
    if (!r.ok) return toast(r.data.error || '加入失败');
    store.set(code, { token: r.data.token, pid: r.data.pid });
    location.hash = `#/room/${code}`;
  }
  createBtn.addEventListener('click', doCreate);
  joinBtn.addEventListener('click', doJoin);

  const root = h('div', { class: 'screen' },
    h('div', { class: 'home-hero', html: bunting },
      h('h1', {}, '口算竞速场'),
      h('div', { class: 'sub' }, '一 ~ 四年级 · 分龄口算 · 同房间各做各的题 · 跑道大屏直播'),
    ),
    h('div', { class: 'panel' },
      h('div', { class: 'ptitle' }, '我是选手'),
      h('div', { class: 'field' }, h('label', { class: 'cap' }, '昵称'), nick),
      h('div', { class: 'field' }, h('label', { class: 'cap' }, '我的年级（决定题目难度）'), gradeGrid),
      createBtn,
    ),
    h('div', { class: 'panel' },
      h('div', { class: 'ptitle' }, '我有房间号'),
      h('div', { class: 'field' }, codeInput),
      joinBtn,
    ),
    h('div', { class: 'home-foot' },
      '玩法：房主创建房间 → 大屏展示二维码 → 同学扫码加入并选择自己年级 → 房主开始 → 全员同时开赛，答对前进，先到终点者胜。',
    ),
  );
  container.appendChild(root);
  if (prefillCode) nick.focus();
}

/* ---------- 大厅 ---------- */

function segControl(options, onPick) {
  const btns = options.map(([v, label]) =>
    h('button', { type: 'button', onclick: () => onPick(v) }, label));
  const box = h('div', { class: 'seg' }, btns);
  box.update = (val, disabled) => {
    btns.forEach((b, i) => {
      b.classList.toggle('on', options[i][0] === val);
      b.disabled = !!disabled;
    });
  };
  return box;
}

function mountLobby(container, ctx) {
  const isOwner = () => ctx.state.ownerPid === ctx.sess.pid;
  const root = h('div', { class: 'screen' });
  let armed = null; // 二次确认踢人

  const themeSeg = segControl([['track', '跑道'], ['dragon', '龙舟']], async (v) => {
    const r = await api(`/api/rooms/${ctx.code}/settings`, { token: ctx.sess.token, theme: v });
    if (!r.ok) toast(r.data.error || '修改失败');
  });
  const durSeg = segControl([[120, '2 分钟'], [180, '3 分钟'], [300, '5 分钟']], async (v) => {
    const r = await api(`/api/rooms/${ctx.code}/settings`, { token: ctx.sess.token, durationSec: v });
    if (!r.ok) toast(r.data.error || '修改失败');
  });

  const list = h('div', { class: 'players' });
  const startBtn = h('button', { class: 'btn btn-primary', style: 'width:100%' }, '开始比赛');
  const waiting = h('div', { class: 'waiting' }, '等待房主开始…');

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const r = await api(`/api/rooms/${ctx.code}/start`, { token: ctx.sess.token });
    startBtn.disabled = false;
    if (!r.ok) toast(r.data.error || '开始失败');
  });

  async function saveMe(patch) {
    const r = await api(`/api/rooms/${ctx.code}/me`, { token: ctx.sess.token, ...patch });
    if (!r.ok) toast(r.data.error || '修改失败');
  }

  function renderList(st) {
    list.innerHTML = '';
    st.players.forEach((p, i) => {
      const own = p.pid === ctx.sess.pid;
      const owner = p.pid === st.ownerPid;
      const row = h('div', { class: 'player-row' + (p.online ? '' : ' offline') });

      row.appendChild(h('div', { class: 'bib' }, String(i + 1)));
      row.appendChild(h('span', { class: 'pdot', style: `background:${colorOf(p.pid)}` }));

      const nameWrap = h('span', { class: 'pname' });
      nameWrap.appendChild(document.createTextNode(p.nickname));
      if (owner) nameWrap.appendChild(h('span', { class: 'role' }, '房主'));
      if (own) nameWrap.appendChild(h('span', { class: 'role' }, '我'));
      row.appendChild(nameWrap);

      const badge = h(own ? 'button' : 'span', {
        class: 'grade-badge',
        title: own ? '点击切换年级' : '',
        onclick: own ? () => saveMe({ grade: (p.grade % 4) + 1 }) : null,
      }, GRADE_NAMES[p.grade]);
      row.appendChild(badge);

      const end = h('span', { class: 'row-end' });
      if (isOwner() && !own) {
        const kick = h('button', { class: 'btn btn-danger btn-sm' }, '移出');
        kick.addEventListener('click', async () => {
          if (armed !== p.pid) {
            armed = p.pid;
            kick.textContent = '确认移出？';
            setTimeout(() => { if (armed === p.pid) { armed = null; kick.textContent = '移出'; } }, 2600);
            return;
          }
          armed = null;
          const r = await api(`/api/rooms/${ctx.code}/kick`, { token: ctx.sess.token, pid: p.pid });
          if (!r.ok) toast(r.data.error || '移出失败');
        });
        end.appendChild(kick);
      }
      row.appendChild(end);
      list.appendChild(row);
    });
  }

  const codeBlock = h('div', {},
    h('div', { class: 'lbl' }, '房间号'),
    h('div', { class: 'room-code' }, ctx.code),
  );
  const shareBtn = h('button', { class: 'btn btn-sm' }, '邀请');
  shareBtn.addEventListener('click', () => shareModal(ctx.code));
  const exitBtn = h('button', { class: 'btn btn-danger btn-sm' }, '退出');
  exitBtn.addEventListener('click', () => leaveRoom(ctx.code));

  root.append(
    h('div', { class: 'lobby-top' },
      codeBlock, h('span', { class: 'spacer' }),
      shareBtn,
      h('button', { class: 'btn btn-sm', onclick: () => location.hash = `#/big/${ctx.code}` }, '大屏'),
      exitBtn,
    ),
    h('div', { class: 'lobby-meta' },
      h('span', { class: 'cap' }, '主题'), themeSeg,
      h('span', { class: 'cap' }, '时长'), durSeg,
    ),
    list,
    h('div', { class: 'lobby-foot' }, startBtn, waiting),
  );
  container.appendChild(root);

  function update(st) {
    ctx.state = st;
    renderList(st);
    const owner = isOwner();
    themeSeg.update(st.theme, !owner);
    durSeg.update(st.durationSec, !owner);
    startBtn.style.display = owner ? '' : 'none';
    waiting.style.display = owner ? 'none' : '';
  }
  update(ctx.state);
  return { update, destroy() {}, kind: 'lobby' };
}

/* ---------- 结算 ---------- */

function mountResult(container, ctx) {
  const root = h('div', { class: 'screen' });
  const isOwner = () => ctx.state.ownerPid === ctx.sess.pid;
  const body = h('div', { style: 'flex:1;min-height:0;overflow-y:auto' });
  const againBtn = h('button', { class: 'btn btn-primary' }, '再来一局');
  const exitBtn = h('button', { class: 'btn' }, '退出房间');
  againBtn.addEventListener('click', async () => {
    againBtn.disabled = true;
    const r = await api(`/api/rooms/${ctx.code}/again`, { token: ctx.sess.token });
    againBtn.disabled = false;
    if (!r.ok) toast(r.data.error || '操作失败');
  });
  exitBtn.addEventListener('click', () => leaveRoom(ctx.code));

  root.append(
    h('div', { class: 'result-title' }, '比赛结束'),
    body,
    h('div', { class: 'result-foot' },
      isOwner() ? againBtn : h('span'),
      exitBtn,
    ),
  );
  container.appendChild(root);

  function update(st) {
    ctx.state = st;
    body.innerHTML = '';
    body.appendChild(podiumEl(st));
    body.appendChild(ranksEl(st, ctx.sess.pid));

    const me = st.players.find((p) => p.pid === ctx.sess.pid);
    if (me) {
      const rank = (st.ranks || []).indexOf(ctx.sess.pid);
      const wrongs = (st.you && st.you.wrongList) || [];
      const box = h('div', { class: 'wrongbox' },
        h('h4', {}, `我的成绩：第 ${rank + 1} 名 · 答对 ${me.progress}/${me.total} · 答错 ${me.wrong}`),
      );
      if (wrongs.length) {
        box.appendChild(h('div', { class: 'cap', style: 'font-size:13px;color:var(--ink-soft);margin:8px 0 4px' }, '错题回顾（赛后记得弄懂哦）'));
        for (const w of wrongs) {
          box.appendChild(h('div', { class: 'wrong-row' },
            h('span', {}, `${w.text} =`),
            h('span', { class: 'm' }, String(w.mine == null ? '—' : w.mine)),
            h('span', { class: 'r' }, String(w.right)),
          ));
        }
      }
      body.appendChild(box);
    }
    againBtn.parentElement.style.display = '';
    againBtn.style.display = isOwner() ? '' : 'none';
  }
  update(ctx.state);
  return { update, destroy() {}, kind: 'result' };
}

/* ---------- 被移出 / 房间解散 ---------- */

function mountEndScreen(container, title, desc) {
  container.innerHTML = '';
  const root = h('div', { class: 'end-screen' },
    h('div', { class: 'end-card' },
      h('h2', {}, title),
      h('p', {}, desc),
      h('button', { class: 'btn btn-primary', onclick: () => { location.hash = ''; route(); } }, '回到首页'),
    ),
  );
  container.appendChild(root);
  return { update() {}, destroy() {} };
}
