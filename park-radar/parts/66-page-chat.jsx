/* =====================================================================
   公园雷达 · Agent 智能助手「小屿」聊天页
   ===================================================================== */
function ChatMsg({ m, isLast, onChip, onCard, busy }) {
    /* 动态速度：无论长短，整段打字约 2.4s 完成 */
    const spd = Math.max(5, Math.min(26, Math.round(2400 / Math.max((m.text || '').length, 1))));
    const { shown, done } = useTypewriter(m.text || '', spd, !!(m.streaming && isLast && !busy));
    const isUser = m.role === 'user';
    return (
        <div className={cn('msg-row', isUser ? 'user' : 'agent')}>
            {!isUser && (
                <span className="msg-avatar">
                    {isLast ? <FluidOrb size={34} color="#19c8b9" /> : <span className="orb-fallback" />}
                </span>
            )}
            {isUser && (
                <span className="msg-avatar user-av"><Icon name="RabbitIcon" size={20} /></span>
            )}
            <div style={{ minWidth: 0, maxWidth: '100%' }}>
                <div className="bubble">
                    {shown}
                    {m.streaming && isLast && !done && <i className="tw-caret" />}
                </div>
                {m.cards && m.cards.length > 0 && (!m.streaming || done || !isLast) && (
                    <div className="chat-cards">
                        {m.cards.map((c, i) => {
                            const p = PARK_BY_ID[c.id];
                            if (!p) return null;
                            return (
                                <div className="chat-park-card" key={c.id + i} style={{ animationDelay: `${i * 0.08}s` }} onClick={() => onCard(p.id)}>
                                    <span className="cpc-thumb"><SceneArt park={p} variant="thumb" /></span>
                                    <span className="cpc-info">
                                        <span className="cpc-name">{p.name}
                                            <span className="rate"><Icon name="StarIcon" size={11} />{p.rating.toFixed(1)}</span>
                                        </span>
                                        <span className="cpc-meta">{catMeta(p.cat).label} · {p.distance}km · {p.ticket === 0 ? '免费' : `¥${p.ticket}`} · {crowdText(p.crowd)}</span>
                                        {c.reason && <span className="cpc-reason"><Icon name="CompassIcon" size={11} />{c.reason}</span>}
                                    </span>
                                    <span className="cpc-go"><Icon name="ChevronRightIcon" size={14} /></span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {m.chips && m.chips.length > 0 && isLast && !busy && (!m.streaming || done) && (
                    <div className="chips-row">
                        {m.chips.map((c, i) => (
                            <button className="q-chip" key={c} style={{ animationDelay: `${0.1 + i * 0.06}s` }} onClick={() => onChip(c)}>{c}</button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

const CAPS = [
    { icon: 'SearchIcon', text: '按需求找公园', q: '帮我找个免费又能遛娃的公园' },
    { icon: 'CrowdDots', text: '避开人从众', q: '今天哪里人少清净？' },
    { icon: 'MoonIcon', text: '夜游去哪里', q: '晚上有夜景的公园推荐' },
    { icon: 'DogIcon', text: '带上毛孩子', q: '可以带狗去的公园' },
];

function ChatPage({ initialQ, initialParkId, onBack, onOpenPark, closing, zIndex }) {
    const st = useStore();
    const [msgs, setMsgs] = useState(() => LS.get('chat', []));
    const [busy, setBusy] = useState(false);
    const [input, setInput] = useState('');
    const [listening, setListening] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const bodyRef = useRef(null);
    const ctxRef = useRef(LS.get('chatCtx', { lastResults: [], lastParsed: null, moreOffset: 0, parkCtx: null }));
    const initRef = useRef(false);
    const busyRef = useRef(false);

    const scrollBottom = (smooth = true) => requestAnimationFrame(() => {
        const el = bodyRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth && !sysReduced() ? 'smooth' : 'auto' });
    });

    useEffect(() => { LS.set('chat', msgs.slice(-40)); }, [msgs]);
    useEffect(() => { LS.set('chatCtx', ctxRef.current); }, [msgs, busy]);
    useEffect(() => { scrollBottom(false); }, [busy]);

    const pushMsg = m => setMsgs(prev => [...prev, { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);

    const applyReply = (reply) => {
        if (reply.meta) {
            const m = reply.meta;
            if (m.lastResults) ctxRef.current.lastResults = m.lastResults;
            if (m.lastParsed !== undefined) ctxRef.current.lastParsed = m.lastParsed;
            ctxRef.current.moreOffset = m.moreOffset || 0;
        }
        if (reply.parkCtx) ctxRef.current.parkCtx = reply.parkCtx;
        setBusy(false); busyRef.current = false;
        pushMsg({ role: 'agent', text: reply.text, cards: reply.cards || [], chips: reply.chips || [], streaming: true });
        scrollBottom();
    };

    async function agentReply(text, directReply) {
        if (busyRef.current) return;
        setBusy(true); busyRef.current = true;
        scrollBottom();
        let reply;
        if (directReply) {
            await sleep(500);
            reply = normalizeReply(directReply, null);
        } else {
            reply = await agentAsk(text, { favs: st.favs, likes: st.likes, history: st.history, user: '探索家' }, ctxRef.current);
        }
        applyReply(reply);
    }

    function send(text) {
        const t = String(text == null ? input : text).trim();
        if (!t || busyRef.current) return;
        setInput('');
        pushMsg({ role: 'user', text: t });
        scrollBottom();
        agentReply(t);
    }

    function handleChip(label) {
        if (busyRef.current) return;
        const r = resolveChip(label, ctxRef.current);
        if (r && r.nav) {
            pushMsg({ role: 'user', text: label });
            onOpenPark(r.nav.split('/park/')[1]);
            return;
        }
        pushMsg({ role: 'user', text: label });
        scrollBottom();
        if (r && r.direct) agentReply(null, r.direct);
        else agentReply((r && r.q) || label);
    }

    /* 首次进入：欢迎语 + 初始问题 */
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        if (initialParkId) ctxRef.current.parkCtx = initialParkId;
        if (!LS.get('chat', []).length) {
            setMsgs([{
                id: 'welcome', role: 'agent', streaming: true,
                text: `嗨，我是小屿，公园雷达的智能助手！\n告诉我你的想法，比如「找个人少的免费湖边公园」，我会为你扫描${CITY}的 ${PARKS.length} 座公园。`,
                chips: DEFAULT_CHIPS, cards: [],
            }]);
            if (initialQ) setTimeout(() => send(initialQ), 1400);
        } else if (initialQ) {
            setTimeout(() => send(initialQ), 500);
        }
    }, []);

    function mic() {
        if (busyRef.current) return;
        setListening(true);
        toast('info', '正在聆听…（演示环境为模拟识别）');
        setTimeout(() => {
            setListening(false);
            const demo = ['附近适合遛娃的公园', '有没有安静的湖边公园', '周末可以带狗去哪里'];
            setInput(demo[Math.floor(Math.random() * demo.length)]);
        }, 1500);
    }

    const showWelcome = msgs.length <= 1 && !busy;

    return (
        <div className={cn('chat-page', closing && 'closing')} style={zIndex ? { zIndex } : undefined}>
            <header className="chat-header">
                <button className="hero-circle-btn" aria-label="返回" onClick={onBack} style={{ width: 36, height: 36 }}><Icon name="ArrowLeftIcon" size={18} /></button>
                <span className="chat-avatar">
                    <FluidOrb size={46} color="#19c8b9" />
                    <i className="status" />
                </span>
                <span className="chat-title">
                    <span className="n">{AGENT_NAME}<span className="ai-tag">AI AGENT</span></span>
                    <span className="s">公园雷达智能助手 · 支持自然语言找公园</span>
                </span>
                <span className="chat-actions">
                    <button className="hero-circle-btn" aria-label="清空对话" style={{ width: 36, height: 36 }} onClick={() => setClearOpen(true)}>
                        <Icon name="RefreshIcon" size={17} />
                    </button>
                </span>
            </header>

            <div className="chat-body" ref={bodyRef}>
                {showWelcome && (
                    <div className="chat-welcome">
                        <FluidOrb size={86} color="#19c8b9" />
                        <div className="w-title">想去什么样的公园？问我就好</div>
                        <div className="w-desc">我会理解你的需求 —— 人群、预算、距离、玩法，<br />然后从全城的公园里帮你挑出最合适的。</div>
                        <div className="cap-grid">
                            {CAPS.map((c, i) => (
                                <button className="cap-card" key={c.text} style={{ animationDelay: `${0.15 + i * 0.08}s` }} onClick={() => send(c.q)}>
                                    <Icon name={c.icon === 'CrowdDots' ? 'SnailIcon' : c.icon} size={20} />{c.text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {msgs.map((m, i) => (
                    <ChatMsg key={m.id} m={m} isLast={i === msgs.length - 1} busy={busy}
                        onChip={handleChip} onCard={id => onOpenPark(id)} />
                ))}
                {busy && (
                    <div className="msg-row agent">
                        <span className="msg-avatar"><FluidOrb size={34} color="#19c8b9" /></span>
                        <div className="bubble">
                            <span className="typing-dots"><i /><i /><i /></span>
                        </div>
                    </div>
                )}
            </div>

            <div className="chat-input-bar">
                <button className="hero-circle-btn" aria-label="语音输入" onClick={mic}
                    style={{ width: 42, height: 42, flexShrink: 0, background: listening ? '#ffe9b0' : undefined, borderColor: listening ? 'var(--animal-warning)' : undefined, animation: listening ? 'sun-breathe 0.8s ease-in-out infinite' : undefined }}>
                    <Icon name="MicIcon" size={19} />
                </button>
                <div className="input-wrap large" style={{ flex: 1 }}>
                    <input value={input} placeholder={listening ? '正在聆听…' : '说说你想去什么样的公园…'}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') send(); }}
                        enterKeyHint="send" />
                    {input && <button className="input-clear" aria-label="清空" onClick={() => setInput('')}><Icon name="CloseIcon" size={13} /></button>}
                </div>
                <button className="send-btn" disabled={!input.trim() || busy} aria-label="发送" onClick={() => send()}>
                    <Icon name="RocketIcon" size={20} />
                </button>
            </div>

            <Modal open={clearOpen} title="清空对话记录？" onClose={() => setClearOpen(false)}
                footer={
                    <React.Fragment>
                        <Btn type="default" size="middle" onClick={() => setClearOpen(false)}>取消</Btn>
                        <Btn type="danger" size="middle" icon="TrashIcon" onClick={() => {
                            setMsgs([]);
                            ctxRef.current = { lastResults: [], lastParsed: null, moreOffset: 0, parkCtx: null };
                            LS.set('chat', []); LS.set('chatCtx', ctxRef.current);
                            initRef.current = false;
                            setClearOpen(false);
                            setTimeout(() => { initRef.current = true; setMsgs([{ id: 'welcome2', role: 'agent', streaming: true, text: `我们重新开始吧！想去什么样的公园？`, chips: DEFAULT_CHIPS, cards: [] }]); }, 60);
                            toast('success', '对话已清空');
                        }}>清空</Btn>
                    </React.Fragment>
                }>
                <p>小屿会忘记这次会话里聊过的所有内容。</p>
            </Modal>
        </div>
    );
}
