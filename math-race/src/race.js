'use strict';

/* 竞速视图：手机答题端 + 大屏观赛端 */

/* ---------- 手机答题端 ---------- */

function mountRace(container, ctx) {
  const root = h('div', { class: 'screen race' });
  const timerEl = h('div', { class: 'timer' }, '--:--');
  const progEl = h('div', { class: 'race-prog' }, '');
  const lanes = lanesEl(true, ctx.sess.pid);

  const qtext = h('div', { class: 'qtext' }, '');
  const ansline = h('div', { class: 'ansline' }, '');
  const feedback = h('div', { class: 'feedback' }, '');
  const donePanel = h('div', { class: 'done-panel', style: 'display:none' },
    h('div', { class: 'big' }, '完赛！'),
    h('div', { class: 'sub' }, ''),
  );

  let input = '';
  let q = (ctx.state.you && ctx.state.you.question) || null;
  let finishedYou = !!(ctx.state.you && ctx.state.you.finished);
  let busy = false;
  let fbTimer = 0;
  let lastCount = -1;

  const keys = [];
  const keypad = h('div', { class: 'keypad' });
  const keyLabels = [['7'], ['8'], ['9'], ['4'], ['5'], ['6'], ['1'], ['2'], ['3'], ['del', '⌫'], ['0'], ['submit', '提交']];
  for (const [k, label] of keyLabels) {
    const isSubmit = k === 'submit';
    const b = h('button', {
      class: 'key' + (isSubmit ? ' submit' : ''),
      type: 'button', 'data-k': k,
      onclick: () => press(k),
    }, label || k);
    keys.push(b);
    keypad.appendChild(b);
  }

  function setKeysDisabled(dis) { keys.forEach((b) => { b.disabled = dis; }); }

  function press(k) {
    if (busy || finishedYou) return;
    if (k === 'del') { input = input.slice(0, -1); }
    else if (k === 'submit') { return submit(); }
    else if (input.length < 7) { input += k; AudioFX.tick(); }
    renderInput();
  }

  function renderInput() {
    ansline.innerHTML = '';
    if (input) ansline.appendChild(h('b', {}, input));
    else ansline.appendChild(document.createTextNode('输入答案…'));
  }

  function flash(type, text, ms) {
    feedback.className = `feedback show ${type}`;
    feedback.textContent = text;
    clearTimeout(fbTimer);
    fbTimer = setTimeout(() => { feedback.className = 'feedback'; }, ms);
  }

  async function submit() {
    if (busy || finishedYou || !q) return;
    if (!input) {
      ansline.style.color = 'var(--bad)';
      setTimeout(() => { ansline.style.color = ''; }, 350);
      return;
    }
    busy = true;
    setKeysDisabled(true);
    const r = await api(`/api/rooms/${ctx.code}/answer`, {
      token: ctx.sess.token, idx: q.idx, answer: Number(input),
    });
    busy = false;
    setKeysDisabled(false);
    if (!r.ok) {
      toast(r.data.error || '提交失败');
      if (r.data.error && r.data.error.includes('完赛')) finishedYou = true;
      renderBody();
      return;
    }
    if (r.data.correct) {
      AudioFX.correct();
      flash('ok', '答对了，前进！', 700);
    } else {
      AudioFX.wrong();
      flash('bad', `答错了 · 正确答案 ${r.data.rightAnswer}`, 1800);
    }
    input = '';
    if (r.data.finished) {
      finishedYou = true;
      AudioFX.finish();
    }
    q = r.data.next;
    renderBody();
    renderInput();
  }

  function renderBody() {
    const showDone = finishedYou;
    donePanel.style.display = showDone ? '' : 'none';
    keypad.style.display = showDone ? 'none' : '';
    qtext.style.visibility = showDone ? 'hidden' : 'visible';
    ansline.style.visibility = showDone ? 'hidden' : 'visible';
    if (showDone) {
      const order = sortPlayers(ctx.state);
      const myRank = order.findIndex((p) => p.pid === ctx.sess.pid) + 1;
      donePanel.querySelector('.sub').textContent = `目前第 ${myRank} 名，等其他小选手冲线…`;
    } else {
      qtext.textContent = q ? q.text : '';
      renderInput();
    }
  }

  const countdown = h('div', { class: 'countdown', style: 'display:none' }, '');

  root.append(
    h('div', { class: 'race-head' },
      timerEl, progEl, h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: () => { prefs.sound = !prefs.sound; toast(prefs.sound ? '音效开' : '音效关'); } }, '音效'),
      h('button', { class: 'btn btn-danger btn-sm', onclick: () => leaveRoom(ctx.code) }, '退出'),
    ),
    lanes.el,
    h('div', { class: 'qcard' }, qtext, ansline, feedback, donePanel),
    keypad,
    countdown,
  );
  container.appendChild(root);

  function onKey(e) {
    if (e.key >= '0' && e.key <= '9') press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('submit');
  }
  document.addEventListener('keydown', onKey);

  function update(st) {
    ctx.state = st;
    lanes.sync(st);
    const left = st.endAt ? st.endAt - serverNow() : st.durationSec * 1000;
    timerEl.textContent = fmtClock(left);
    timerEl.classList.toggle('low', left < 30000 && st.status === 'racing');
    const me = st.players.find((p) => p.pid === ctx.sess.pid);
    if (me) progEl.textContent = `${me.progress}/${me.total} 题`;

    const remain = st.startAt ? st.startAt - serverNow() : 0;
    if (st.status === 'racing' && remain > 0) {
      countdown.style.display = '';
      const n = Math.ceil(remain / 1000);
      const label = n >= 3 ? '3' : n === 2 ? '2' : n === 1 ? '1' : 'GO!';
      if (label !== countdown.textContent) {
        countdown.textContent = label;
        if (label === 'GO!') AudioFX.go(); else AudioFX.tick();
      }
      setKeysDisabled(true);
    } else {
      countdown.style.display = 'none';
      if (!busy && !finishedYou) setKeysDisabled(false);
    }
    if (finishedYou) renderBody(); // 更新实时名次
  }

  update(ctx.state);
  renderBody();
  // 倒计时/计时器靠本地心跳推进；SSE 状态只负责赛道与成员同步
  const ticker = setInterval(() => update(ctx.state), 300);
  return {
    update,
    destroy() {
      document.removeEventListener('keydown', onKey);
      clearTimeout(fbTimer);
      clearInterval(ticker);
    },
    kind: 'race',
  };
}

/* ---------- 大屏观赛端 ---------- */

function mountBig(container, ctx) {
  const root = h('div', { class: 'big' });
  let lanes = null;
  let lanesTheme = '';
  const body = h('div', { class: 'big-body' });
  const timerEl = h('div', { class: 'big-timer' }, '--:--');

  const head = h('div', { class: 'big-head' },
    h('div', { class: 'big-title' }, '口算竞速场'),
    h('div', { class: 'big-code' }, ctx.code),
    timerEl,
    h('button', { class: 'btn btn-sm big-exit', onclick: () => { location.hash = ''; route(); } }, '退出'),
  );
  root.append(head, body, h('div', { class: 'big-foot' }, '点击画面可全屏 · 手机端扫码加入'));

  function renderLobby(st) {
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'big-lobby' },
      h('div', { class: 'qrbox', html: qrSvg(joinUrl(ctx.code)) }),
      h('div', { class: 'side' },
        h('div', { class: 'code' }, ctx.code),
        h('div', { class: 'hint' }, '手机扫码 / 输房间号即可加入'),
        h('div', { class: 'chips' }, st.players.map((p) =>
          h('span', { class: 'chip' },
            h('span', { class: 'pdot', style: `background:${colorOf(p.pid)}` }),
            `${p.nickname}·${GRADE_NAMES[p.grade]}`,
          ))),
      ),
    ));
    const wait = h('div', { class: 'big-wait' }, st.players.length ? '选手就位，等待房主开始比赛…' : '等待选手加入…');
    body.appendChild(wait);
  }

  function renderRace(st) {
    if (!lanes || lanesTheme !== st.theme) {
      lanesTheme = st.theme;
      lanes = lanesEl(false, null);
      lanes.el.classList.add('big-lanes');
    }
    body.innerHTML = '';
    body.appendChild(lanes.el);
    lanes.sync(st);
  }

  function renderFinished(st) {
    body.innerHTML = '';
    const wrap = h('div', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' },
      h('div', { class: 'big-wait', style: 'margin-top:0' }, '比赛结束 · 恭喜获胜选手！'),
      podiumEl(st),
      ranksEl(st, null),
    );
    body.appendChild(wrap);
  }

  function update(st) {
    ctx.state = st;
    const left = st.endAt ? st.endAt - serverNow() : st.durationSec * 1000;
    timerEl.textContent = st.status === 'lobby' ? '' : fmtClock(left);
    timerEl.classList.toggle('low', st.status === 'racing' && left < 30000);
    if (st.status === 'lobby') { timerEl.textContent = '待开赛'; renderLobby(st); }
    else if (st.status === 'racing') renderRace(st);
    else renderFinished(st);
  }

  const onFs = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  root.addEventListener('click', onFs);

  container.innerHTML = '';
  container.appendChild(root);
  update(ctx.state);
  const ticker = setInterval(() => update(ctx.state), 500);
  return {
    update,
    destroy() { root.removeEventListener('click', onFs); clearInterval(ticker); },
    kind: 'big',
  };
}
