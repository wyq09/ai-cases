/* =====================================================================
   公园雷达 · 列表页（发现）
   ===================================================================== */
function ListPage({ onOpenPark, onOpenChat }) {
    const st = useStore();
    const [booting, setBooting] = useState(true);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('all');
    const [sort, setSort] = useState('rec');
    const [noticesOpen, setNoticesOpen] = useState(false);
    const [bellRing, setBellRing] = useState(false);
    const scrollerRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        const t = setTimeout(() => setBooting(false), 750);
        return () => clearTimeout(t);
    }, []);

    const filtered = useMemo(() => {
        let list = PARKS.slice();
        if (cat !== 'all') {
            list = list.filter(p => catMatch(cat, p));
        }
        const kw = q.trim().toLowerCase();
        if (kw) {
            list = list.filter(p =>
                `${p.name}${p.district}${p.address}${p.tags.join('')}${p.features.join('')}${catMeta(p.cat).label}${p.desc}`.toLowerCase().includes(kw)
            );
        }
        if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
        else if (sort === 'distance') list.sort((a, b) => a.distance - b.distance);
        else if (sort === 'quiet') list.sort((a, b) => a.crowd - b.crowd || b.rating - a.rating);
        else if (sort === 'free') list = list.filter(p => p.ticket === 0).concat(list.filter(p => p.ticket > 0).sort((a, b) => a.ticket - b.ticket));
        else list.sort((a, b) => (b.rating * 20 - b.distance - b.crowd) - (a.rating * 20 - a.distance - a.crowd));
        return list;
    }, [cat, sort, q]);

    const resetFilters = () => { setQ(''); setCat('all'); setSort('rec'); };

    const ringBell = () => {
        setBellRing(true);
        setTimeout(() => setBellRing(false), 1300);
        setNoticesOpen(true);
    };

    const h = new Date().getHours();
    const greet = h < 6 ? '夜深了' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';

    return (
        <div className="page-scroller" id="list-scroller" ref={scrollerRef}>
            <header className="home-header">
                <div className="home-top-row">
                    <div className="greet-wrap">
                        <span className="greet-hello"><Icon name="SunIcon" size={13} />{greet}，探索家</span>
                        <h1 className="greet-title">今天去哪个公园？</h1>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="loc-pill" onClick={() => toast('info', `当前定位：${CITY}（演示数据）`)}>
                            <Icon name="LocationIcon" size={13} />{CITY}
                            <Icon name="ChevronDownIcon" size={11} style={{ color: 'var(--animal-text-secondary)' }} />
                        </button>
                        <button className={cn('bell-btn', bellRing && 'ring')} aria-label="通知" onClick={ringBell}>
                            <Icon name="BellIcon" size={19} />
                            <i className="badge" />
                        </button>
                    </div>
                </div>
            </header>

            {/* 雷达横幅（signature） */}
            <div className="radar-banner pattern pattern-app-teal" onClick={() => {
                setBooting(true);
                setTimeout(() => { setBooting(false); toast('success', `雷达已重新扫描，发现 ${PARKS.length} 个公园`); }, 700);
            }} role="button" title="点击重新扫描">
                <div className="radar-widget">
                    <div className="radar-sweep" />
                    <i className="radar-blip" style={{ left: '22%', top: '30%', animationDelay: '0.4s' }} />
                    <i className="radar-blip" style={{ left: '64%', top: '22%', animationDelay: '1.5s' }} />
                    <i className="radar-blip" style={{ left: '48%', top: '66%', animationDelay: '2.3s' }} />
                    <i className="radar-blip" style={{ left: '76%', top: '58%', animationDelay: '0.9s' }} />
                    <i className="radar-center-dot" />
                </div>
                <div className="radar-info">
                    <div className="r1">雷达扫描中<b>{PARKS.length}</b>个公园在附近</div>
                    <div className="r2">已按口碑 · 距离 · 人流综合排序，点击卡片查看详情</div>
                    <div className="r3">
                        <TagC color="app-teal" variant="soft" size="small" icon="StarIcon">今日最佳：樱语谷</TagC>
                    </div>
                </div>
                <Icon name="RefreshIcon" size={17} style={{ color: 'var(--animal-primary-active)', opacity: 0.7 }} />
            </div>

            {/* 搜索行 */}
            <div className="search-row" style={{ display: 'flex', gap: 8 }}>
                <div className="input-wrap large" style={{ flex: 1 }}>
                    <span className="prefix"><Icon name="SearchIcon" size={17} /></span>
                    <input ref={inputRef} value={q} placeholder="搜索公园名、特色或区域…"
                        onChange={e => setQ(e.target.value)} enterKeyHint="search" />
                    {q && (
                        <button className="input-clear" aria-label="清空" onClick={() => { setQ(''); inputRef.current && inputRef.current.focus(); }}>
                            <Icon name="CloseIcon" size={13} />
                        </button>
                    )}
                </div>
                <button className="btn btn-teal btn-large" style={{ width: 52, padding: 0, borderRadius: '50%', flexShrink: 0 }}
                    aria-label="问 AI 助手" onClick={() => onOpenChat()}>
                    <Icon name="ChatIcon" size={22} />
                </button>
            </div>

            {/* 分类 chips */}
            <div className="cat-scroll">
                {CATS.map(c => (
                    <button key={c.key} className={cn('cat-chip', cat === c.key && 'active')}
                        onClick={() => setCat(c.key)}>
                        <Icon name={c.icon} size={15} />{c.label}
                    </button>
                ))}
            </div>

            {/* 排序 chips */}
            <div className="sort-row">
                {SORTS.map(s => (
                    <button key={s.key} className={cn('sort-chip', sort === s.key && 'active')}
                        onClick={() => setSort(s.key)}>{s.label}</button>
                ))}
            </div>

            <div className="result-count">
                共发现 <b>{booting ? '…' : filtered.length}</b> 个公园{cat !== 'all' && ` · ${catMeta(cat).label}`}
            </div>

            {/* 公园卡片流 */}
            <main className="feed" key={`${cat}-${sort}-${q}`}>
                {booting ? (
                    <React.Fragment>
                        <SkeletonCard /><SkeletonCard /><SkeletonCard />
                    </React.Fragment>
                ) : filtered.length ? (
                    filtered.map((p, i) => <ParkCard key={p.id} park={p} index={i} onOpen={onOpenPark} />)
                ) : (
                    <EmptyState
                        icon="SearchIcon"
                        title="雷达没有扫到符合条件的公园"
                        desc="换个关键词，或者让小屿帮你找找"
                        action={
                            <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                                <Btn type="default" size="middle" icon="RefreshIcon" onClick={resetFilters}>重置筛选</Btn>
                                <Btn type="teal" size="middle" icon="ChatIcon" onClick={() => onOpenChat(q ? `帮我找${q}` : null)}>问问小屿</Btn>
                            </div>
                        }
                    />
                )}
                {!booting && filtered.length > 0 && (
                    <div style={{ textAlign: 'center', padding: '6px 0 2px', fontSize: 12, color: 'var(--animal-text-disabled)', fontWeight: 600 }}>
                        — 已经到底啦，共 {filtered.length} 个公园 —
                    </div>
                )}
            </main>

            {/* 通知 Modal */}
            <Modal open={noticesOpen} title="公园快报" onClose={() => setNoticesOpen(false)}
                footer={<Btn type="yellow" size="middle" onClick={() => setNoticesOpen(false)}>知道啦</Btn>}>
                <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {NOTICES.map((n, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'rgba(255,253,242,0.7)', borderRadius: 15, border: '1.5px solid #eadfca' }}>
                            <span style={{ width: 34, height: 34, borderRadius: '50%', background: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 5px rgba(61,52,40,0.15)' }}>
                                <Icon name={n.icon} size={19} />
                            </span>
                            <span style={{ flex: 1 }}>
                                <b style={{ display: 'block', fontSize: 13.5, color: 'var(--animal-text)', fontWeight: 800 }}>{n.title}</b>
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--animal-text-muted)', marginTop: 2, lineHeight: 1.5 }}>{n.text}</span>
                                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--animal-text-disabled)', marginTop: 3, fontWeight: 600 }}>{n.time}</span>
                            </span>
                        </div>
                    ))}
                </div>
            </Modal>
        </div>
    );
}
