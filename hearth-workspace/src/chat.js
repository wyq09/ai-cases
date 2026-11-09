/* ==========================================================================
   Hearth — Chat view (streaming replies)
   ========================================================================== */

const TONE_CLASS = {
  violet: "tag-violet",
  blue: "tag-blue",
  green: "tag-green",
  amber: "tag-amber",
  rose: "tag-rose",
  sky: "tag-sky",
};

const TONE_BG = {
  violet: "var(--violet-soft);color:var(--violet)",
  blue: "var(--blue-soft);color:var(--blue)",
  green: "var(--green-soft);color:var(--green)",
  amber: "var(--amber-soft);color:var(--amber)",
  rose: "var(--rose-soft);color:var(--rose)",
  sky: "var(--sky-soft);color:var(--sky)",
};

const TONE_FILL = {
  violet: "var(--violet)",
  blue: "var(--blue)",
  green: "var(--green)",
  amber: "var(--amber)",
  rose: "var(--rose)",
  sky: "var(--sky)",
};

function chatComposerHtml() {
  const atts = state.chat.attachments
    .map(
      (a) => `<span class="att-chip">${ic(a.icon || "file", 13)}<span>${esc(a.name)}</span>
        <button data-act="detach" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">${ic("close", 11)}</button></span>`
    )
    .join("");
  return `
  <div class="composer" id="composer">
    ${atts ? `<div class="chat-attachments">${atts}</div>` : ""}
    <textarea id="chatInput" rows="2" placeholder="Ask Hearth to plan, remember, or do anything…" data-autofocus></textarea>
    <div class="composer-bar">
      <button class="tool-btn" data-act="attach-menu" title="Attach" aria-label="Attach">${ic("plus", 17)}</button>
      <button class="tool-btn" data-act="attach-file" title="Attach file" aria-label="Attach file">${ic("paperclip", 16)}</button>
      <button class="tool-btn" data-act="mic" id="btnMic" title="Voice input" aria-label="Voice input">${ic("mic", 16)}</button>
      <span class="spacer"></span>
      <button class="send-btn" data-act="send" id="btnSend" title="Send" aria-label="Send message">${ic("send", 17)}</button>
    </div>
    <input type="file" id="filePicker" multiple hidden />
  </div>
  <p class="composer-hint">AI can make mistakes, please verify important details. Your data is private and never shared.</p>`;
}

function chatWelcomeHtml() {
  return `
  <div class="chat-hero">
    <div class="orb"></div>
    <h1 class="chat-greeting">Good morning, <em>RahMan</em></h1>
  </div>`;
}

function chatSuggestionsHtml() {
  const extra = state.showExtraIdeas ? CHAT_EXTRA : [];
  return `
  <div class="suggestions">
    <ul class="sug-list">
      ${CHAT_SUGGESTIONS.map(
        (s) => `<li><button class="sug" data-act="sug" data-label="${esc(s.label)}">
          <span class="sug-ico" style="background:${TONE_BG[s.tone]}">${ic(s.icon, 14)}</span>
          <span>${esc(s.label)}</span></button></li>`
      ).join("")}
      ${extra
        .map(
          (s) => `<li><button class="sug" data-act="sug" data-label="${esc(s.label)}">
            <span class="sug-ico" style="background:${TONE_BG[s.tone]}">${ic(s.icon, 14)}</span>
            <span>${esc(s.label)}</span></button></li>`
        )
        .join("")}
    </ul>
    <button class="sug-more" data-act="more-ideas">${state.showExtraIdeas ? "Fewer ideas" : "More Ideas"}</button>
  </div>`;
}

function messageHtml(m, i) {
  if (m.role === "user") {
    return `<div class="msg msg-user" data-idx="${i}">
      <div class="msg-bubble">${esc(m.text)}</div>
    </div>`;
  }
  const html = m.html || `<span>${esc(m.text)}</span>`;
  return `<div class="msg msg-ai" data-idx="${i}">
    <span class="avatar avatar-md" style="background:var(--violet-soft);color:var(--violet)">✳</span>
    <div style="min-width:0;flex:1">
      ${m.status ? `<div class="stream-status" id="streamStatus">${ic("sparkle2", 12)}<span>${esc(m.status)}</span></div>` : ""}
      <div class="msg-bubble" id="bubble-${i}">${html}</div>
      ${
        m.done
          ? `<div class="msg-actions">
              <button class="msg-act" data-act="copy" data-idx="${i}" title="Copy">${ic("copy", 14)}</button>
              <button class="msg-act ${m.liked ? "is-on" : ""}" data-act="like" data-idx="${i}" title="Good answer">${ic("thumbsUp", 14)}</button>
              <button class="msg-act" data-act="regen" data-idx="${i}" title="Regenerate">${ic("refresh", 14)}</button>
            </div>`
          : ""
      }
    </div>
  </div>`;
}

function renderChat() {
  const msgs = state.chat.messages;
  const hasThread = msgs.length > 0;
  return `
  <div class="chat-wrap ${hasThread ? "has-thread" : ""}">
    ${hasThread ? `<div class="chat-thread" id="chatThread">${msgs.map(messageHtml).join("")}</div>` : chatWelcomeHtml()}
    ${chatComposerHtml()}
    ${hasThread ? "" : chatSuggestionsHtml()}
  </div>`;
}

/* ----------------------------- streaming ----------------------------- */

const STREAM_STAGES = [
  "Thinking about it…",
  "Searching your memory…",
  "Checking goals & files…",
  "Drafting a response…",
];

let streamToken = 0;

function replyFor(prompt) {
  return pickReply(prompt, CHAT_REPLIES) || CHAT_DEFAULT;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function streamMessage(idx, text) {
  const token = ++streamToken;
  const msg = state.chat.messages[idx];
  const statusEl = $("#streamStatus span");
  const bubble = $(`#bubble-${idx}`);
  if (!bubble) return;

  msg.status = STREAM_STAGES[0];
  if (statusEl) statusEl.textContent = msg.status;

  for (let i = 1; i < STREAM_STAGES.length; i++) {
    await sleep(340);
    if (token !== streamToken) return;
    msg.status = STREAM_STAGES[i];
    const s = $("#streamStatus span");
    if (s) s.textContent = msg.status;
  }

  await sleep(280);
  if (token !== streamToken) return;

  const statusPill = $("#streamStatus");
  if (statusPill) statusPill.remove();

  if (state.settings.streaming) {
    // Append-only text node + a caret: far cheaper than re-writing innerHTML
    // on every chunk, and the scroll only follows every few chunks.
    const span = document.createElement("span");
    const caret = document.createElement("span");
    caret.className = "caret";
    bubble.textContent = "";
    bubble.appendChild(span);
    bubble.appendChild(caret);
    let i = 0;
    const chunk = 3;
    let tick = 0;
    while (i < text.length) {
      if (token !== streamToken) return;
      i = Math.min(text.length, i + chunk);
      span.textContent = text.slice(0, i);
      if (++tick % 6 === 0) bubble.scrollIntoView({ block: "end" });
      await sleep(9);
    }
    bubble.scrollIntoView({ block: "end" });
    bubble.innerHTML = formatReply(text);
  } else {
    await sleep(220);
    bubble.innerHTML = formatReply(text);
  }

  msg.text = text;
  msg.html = formatReply(text);
  msg.done = true;
  msg.status = "";
  refreshMessage(idx);
}

function refreshMessage(idx) {
  const host = $("#chatThread");
  if (!host) return;
  host.innerHTML = state.chat.messages.map(messageHtml).join("");
  const last = host.querySelector(`[data-idx="${idx}"]`);
  if (last) last.scrollIntoView({ block: "end" });
}

/* ----------------------------- interactions ----------------------------- */

function scrollThreadToEnd() {
  const thread = $("#chatThread");
  if (thread) thread.scrollIntoView({ block: "end" });
}

function bindChat() {
  const ta = $("#chatInput");
  if (!ta) return;

  const grow = () => {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 190)}px`;
  };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });
  requestAnimationFrame(grow);

  if (!state.chat.messages.length) setTimeout(() => ta.focus(), 80);
}

function sendChat(text) {
  const ta = $("#chatInput");
  const prompt = (text ?? (ta ? ta.value : "")).trim();
  if (!prompt || state.chat.busy) return;

  if (ta) {
    ta.value = "";
    ta.style.height = "auto";
  }
  state.chat.busy = true;

  state.chat.messages.push({ role: "user", text: prompt });
  const aiIndex = state.chat.messages.length;
  state.chat.messages.push({ role: "ai", text: "", html: "", done: false, status: STREAM_STAGES[0] });

  render();
  requestAnimationFrame(() => {
    scrollThreadToEnd();
    streamMessage(aiIndex, replyFor(prompt)).then(() => {
      state.chat.busy = false;
      persist();
    });
  });
}

function startVoice() {
  const btn = $("#btnMic");
  const ta = $("#chatInput");
  if (!btn || !ta) return;
  if (btn.classList.contains("is-rec")) {
    btn.classList.remove("is-rec");
    return;
  }
  btn.classList.add("is-rec");
  toast("Listening…", "mic");
  setTimeout(() => {
    btn.classList.remove("is-rec");
    ta.value = "Plan my week and summarise my open tasks";
    ta.dispatchEvent(new Event("input"));
    ta.focus();
    toast("Transcribed", "check");
  }, 1800);
}

function attachMenu(anchor) {
  openMenu(
    anchor,
    [
      { type: "label", label: "Attach" },
      { id: "device", label: "Upload from device", icon: "cloudUp", onSelect: () => $("#filePicker").click() },
      {
        id: "library",
        label: "From your files",
        icon: "folder",
        onSelect: () => {
          state.files.slice(0, 2).forEach((f) => state.chat.attachments.push({ id: f.id, name: f.name, icon: f.icon }));
          render();
          toast("2 files attached", "paperclip");
        },
      },
      { id: "image", label: "Add an image", icon: "image", onSelect: () => $("#filePicker").click() },
      { id: "goal", label: "Link a goal", icon: "goals", onSelect: () => { go("goals"); toast("Pick a goal to link it", "goals"); } },
    ],
    { name: "attach" }
  );
}

/* ----------------------------- view-level events ----------------------------- */

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;

  if (act === "send") {
    sendChat();
  } else if (act === "sug") {
    const label = el.dataset.label;
    const prompt = CHAT_REPLIES[label] ? label : `${label} — help me plan this`;
    sendChat(prompt);
  } else if (act === "more-ideas") {
    state.showExtraIdeas = !state.showExtraIdeas;
    render();
  } else if (act === "mic") {
    startVoice();
  } else if (act === "attach-menu") {
    e.stopPropagation();
    attachMenu(el);
  } else if (act === "attach-file") {
    $("#filePicker").click();
  } else if (act === "detach") {
    state.chat.attachments = state.chat.attachments.filter((a) => a.id !== el.dataset.id);
    render();
  } else if (act === "copy") {
    const m = state.chat.messages[Number(el.dataset.idx)];
    if (m) {
      if (navigator.clipboard) navigator.clipboard.writeText(m.text).catch(() => {});
      toast("Copied to clipboard", "copy");
    }
  } else if (act === "like") {
    const m = state.chat.messages[Number(el.dataset.idx)];
    if (m) {
      m.liked = !m.liked;
      el.classList.toggle("is-on", m.liked);
      toast(m.liked ? "Thanks — noted for future answers" : "Feedback removed", "thumbsUp");
    }
  } else if (act === "regen") {
    const idx = Number(el.dataset.idx);
    const prev = state.chat.messages.slice(0, idx).reverse().find((m) => m.role === "user");
    if (!prev) return;
    state.chat.messages[idx] = { role: "ai", text: "", html: "", done: false, status: STREAM_STAGES[0] };
    render();
    requestAnimationFrame(() => streamMessage(idx, replyFor(prev.text)));
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "filePicker" && e.target.files.length) {
    Array.from(e.target.files).forEach((f) => {
      state.chat.attachments.push({
        id: `up-${f.name}-${f.size}`,
        name: f.name,
        icon: f.type.startsWith("image/") ? "image" : "file",
      });
    });
    toast(`${e.target.files.length} file(s) attached`, "paperclip");
    e.target.value = "";
    render();
  }
});
