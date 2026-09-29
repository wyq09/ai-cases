/* =====================================================================
   公园雷达 · App 路由 + 粘滞 TabBar（gooey，参考 rare-ui gooey-nav）
   ===================================================================== */
function TabBar({ tab, onTab, onOrb }) {
    const [hint, setHint] = useState(() => !sessionStorage.getItem('park-radar:orb-hint'));
    useEffect(() => {
        if (!hint) return;
        sessionStorage.setItem('park-radar:orb-hint', '1');
        const t = setTimeout(() => setHint(false), 6500);
        return () => clearTimeout(t);
    }, [hint]);
    const blobLeft = tab === 'list' ? '15.9%' : '84.1%';
    return (
        <nav className="tabbar" aria-label="主导航">
            <div className="tab-goo-layer" aria-hidden="true">
                <span className="tab-blob" style={{ left: blobLeft }} />
                <span className="tab-blob tab-blob-lead" style={{ left: blobLeft }} />
                <span className="tab-blob tab-blob-trail" style={{ left: blobLeft }} />
            </div>
            <button className={cn('tab-item', tab === 'list' && 'active')} onClick={() => onTab('list')} aria-label="发现">
                <Icon name="HomeIcon" size={22} />
                <span>发现</span>
            </button>
            <div className="tab-orb-dock">
                {hint && <span className="orb-hint">试试对我说：想找个人少的湖边公园<i className="hint-caret" /></span>}
                <button className="tab-orb-btn" onClick={onOrb} aria-label="打开智能助手">
                    <span className="tab-orb-wrap">
                        <span className="tab-orb-halo" />
                        <FluidOrb size={54} color="#19c8b9" className="tab-orb" />
                    </span>
                    <span className="tab-orb-label">问小屿</span>
                </button>
            </div>
            <button className={cn('tab-item', tab === 'me' && 'active')} onClick={() => onTab('me')} aria-label="我的">
                <Icon name="UserIcon" size={22} />
                <span>我的</span>
            </button>
        </nav>
    );
}

function App() {
    const st = useStore();
    const [tab, setTab] = useState('list');
    const [detail, setDetail] = useState(null);       // parkId
    const [chat, setChat] = useState(null);           // {q, parkId}
    const [top, setTop] = useState(null);             // 'detail' | 'chat' —— 谁后打开谁在上
    const [closingD, setClosingD] = useState(false);
    const [closingC, setClosingC] = useState(false);
    const listScrollerPos = useRef(0);

    /* reduceMotion 全局类 */
    useEffect(() => {
        document.body.classList.toggle('reduce-motion', !!(st.settings && st.settings.reduceMotion));
    }, [st.settings && st.settings.reduceMotion]);

    /* 首帧入场动画 */
    useEffect(() => { document.body.classList.add('app-ready'); }, []);

    /* hash 路由（支持深链与浏览器前进后退） */
    useEffect(() => {
        const parse = () => {
            const h = location.hash || '#/';
            if (h.startsWith('#/park/')) {
                const id = decodeURIComponent(h.slice(7));
                if (PARK_BY_ID[id]) setDetail(id);
                else location.replace('#/');
            } else if (h.startsWith('#/chat')) {
                const qs = new URLSearchParams(h.split('?')[1] || '');
                setChat({ q: qs.get('q') || null, parkId: qs.get('park') || null });
                chatHashRef.current = h;
                /* 注意：不清 detail —— 聊天可以叠在详情页之上（堆栈语义） */
            } else if (h.startsWith('#/me')) {
                setTab('me'); setDetail(null); setChat(null);
            } else {
                setTab('list'); setDetail(null); setChat(null);
            }
        };
        parse();
        window.addEventListener('hashchange', parse);
        return () => window.removeEventListener('hashchange', parse);
    }, []);

    const navTo = (h) => { if (location.hash !== h) location.hash = h; };

    /* 用 ref 保存最新状态，供关闭回调计算回退目标（避免旧闭包） */
    const stateRef = useRef({ tab, detail, chat });
    stateRef.current = { tab, detail, chat };
    const chatHashRef = useRef('#/chat');
    const tabHash = () => (stateRef.current.tab === 'me' ? '#/me' : '#/');

    /* 打开/关闭（带退场动画；关闭时用 replace 显式回到下层，避免踩到过期 history） */
    const openPark = useCallback((id) => {
        if (!PARK_BY_ID[id]) return;
        setClosingD(false);
        setDetail(id);
        setTop('detail');
        navTo('#/park/' + id);
    }, []);
    const closeDetail = useCallback(() => {
        setClosingD(true);
        setTimeout(() => {
            setClosingD(false);
            setDetail(null);
            if (location.hash.startsWith('#/park/')) {
                location.replace(stateRef.current.chat ? chatHashRef.current : tabHash());
            }
        }, sysReduced() ? 0 : 260);
    }, []);
    const openChat = useCallback((q, parkId) => {
        setClosingC(false);
        setChat({ q: q || null, parkId: parkId || null });
        setTop('chat');
        let h = '#/chat';
        const qs = [];
        if (q) qs.push('q=' + encodeURIComponent(q));
        if (parkId) qs.push('park=' + parkId);
        if (qs.length) h += '?' + qs.join('&');
        chatHashRef.current = h;
        navTo(h);
    }, []);
    const closeChat = useCallback(() => {
        setClosingC(true);
        setTimeout(() => {
            setClosingC(false);
            setChat(null);
            if (location.hash.startsWith('#/chat')) {
                const d = stateRef.current.detail;
                location.replace(d ? '#/park/' + d : tabHash());
            }
        }, sysReduced() ? 0 : 280);
    }, []);
    const goTab = useCallback((t) => {
        setTab(t);
        navTo(t === 'me' ? '#/me' : '#/');
        /* 保留列表滚动位置：切回时恢复 */
        const el = document.getElementById(t === 'me' ? 'me-scroller' : 'list-scroller');
        if (t === 'list' && el) el.scrollTop = listScrollerPos.current;
    }, []);
    useEffect(() => {
        const el = document.getElementById('list-scroller');
        if (!el) return;
        const fn = () => { listScrollerPos.current = el.scrollTop; };
        el.addEventListener('scroll', fn, { passive: true });
        return () => el.removeEventListener('scroll', fn);
    }, []);

    /* 从聊天卡片打开详情：详情盖在聊天上 */
    const openParkFromChat = useCallback((id) => { openPark(id); }, [openPark]);

    const stacked = !!(chat && detail);
    const detailZ = stacked ? (top === 'detail' ? 970 : 940) : 950;
    const chatZ = stacked ? (top === 'chat' ? 970 : 940) : 960;

    return (
        <div className="app">
            {/* 常驻 tab 页（保留状态与滚动位置） */}
            <div className={cn('tab-page', tab !== 'list' && 'hidden')}>
                <ListPage onOpenPark={openPark} onOpenChat={openChat} />
            </div>
            <div className={cn('tab-page', tab !== 'me' && 'hidden')}>
                <MePage onOpenPark={openPark} onGoList={() => goTab('list')} />
            </div>

            {/* 覆盖层页面 */}
            {detail && (
                <DetailPage parkId={detail} closing={closingD}
                    zIndex={detailZ}
                    onBack={closeDetail}
                    onOpenPark={openParkFromChat}
                    onOpenChat={openChat} />
            )}
            {chat && (
                <ChatPage key={chat.parkId || 'chat'} initialQ={chat.q} initialParkId={chat.parkId}
                    onBack={closeChat} onOpenPark={openParkFromChat} closing={closingC} zIndex={chatZ} />
            )}

            {/* 底部导航（无覆盖层时显示） */}
            {!detail && !chat && (
                <TabBar tab={tab} onTab={goTab} onOrb={() => openChat(null, null)} />
            )}
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
