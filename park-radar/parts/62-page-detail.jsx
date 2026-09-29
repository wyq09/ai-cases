/* =====================================================================
   公园雷达 · 详情页
   ===================================================================== */
function DetailPage({ parkId, onBack, onOpenPark, onOpenChat, closing, zIndex }) {
    const park = PARK_BY_ID[parkId];
    const st = useStore();
    const scrollerRef = useRef(null);
    const sceneRef = useRef(null);
    const barRef = useRef(null);
    const headRef = useRef(null);
    const likeBtnRef = useRef(null);
    const favBtnRef = useRef(null);
    const [progress, setProgress] = useState(0);
    const [faqOpen, setFaqOpen] = useState(0);
    const [navModal, setNavModal] = useState(false);
    const [cLikes, setCLikes] = useState(st.cLikes);
    const os = openState(park);
    const liked = st.likes.includes(park.id);
    const faved = st.favs.includes(park.id);
    const color = catMeta(park.cat).color || 'app-teal';
    const ti = todayIdx();

    useEffect(() => { pushHistory(park.id); }, [park.id]);

    const onScroll = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        const p = max > 0 ? el.scrollTop / max : 0;
        setProgress(p);
        if (sceneRef.current) sceneRef.current.style.transform = `translateY(${el.scrollTop * 0.32}px) scale(${1 + el.scrollTop * 0.00012})`;
        if (headRef.current) headRef.current.style.opacity = el.scrollTop > 210 ? '1' : '0';
    }, []);

    const doLike = () => {
        const on = toggleLike(park, likeBtnRef.current);
        if (on) {
            const el = likeBtnRef.current;
            if (el) {
                const r = el.getBoundingClientRect();
                floatWord(r.left + r.width / 2, r.top - 10, String(baseLikes(park) + 1), '#e05a5a');
            }
        }
    };

    const related = PARKS.filter(x => x.id !== park.id && (x.cat === park.cat || x.tags.some(t => park.tags.includes(t)))).sort((a, b) => b.rating - a.rating).slice(0, 3);

    return (
        <div className={cn('detail-page', closing && 'closing')} style={zIndex ? { zIndex } : undefined}>
            <div className="scroll-progress"><div className="bar" ref={barRef} style={{ transform: `scaleX(${progress})` }} /></div>

            {/* 滚动后浮现的紧凑头 */}
            <div ref={headRef} style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 55, opacity: 0, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: `calc(10px + env(safe-area-inset-top)) 14px 10px`,
                background: 'rgba(250,247,233,0.94)', backdropFilter: 'blur(10px)',
                borderBottom: '2px solid #ece1c6', transition: 'opacity 0.25s var(--animal-ease)',
            }}>
                <span style={{ fontWeight: 900, fontSize: 15.5, color: 'var(--animal-text)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{park.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 800, color: 'var(--animal-text-body)' }}>
                    <Icon name="StarIcon" size={14} />{park.rating.toFixed(1)}
                </span>
            </div>

            <div className="detail-scroller" ref={scrollerRef} onScroll={onScroll}>
                {/* Hero 场景 */}
                <div className="detail-hero">
                    <div style={{ position: 'absolute', inset: 0 }} ref={sceneRef}><SceneArt park={park} variant="hero" /></div>
                    <div className="hero-top">
                        <button className="hero-circle-btn" aria-label="返回" onClick={onBack}><Icon name="ArrowLeftIcon" size={20} /></button>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="hero-circle-btn" aria-label="分享" onClick={() => toast('info', '分享链接已复制（演示）')}>
                                <Icon name="ShareIcon" size={18} />
                            </button>
                            <button ref={favBtnRef} className={cn('hero-circle-btn hero-fav', faved && 'on')} aria-label={faved ? '取消收藏' : '收藏'}
                                onClick={() => toggleFav(park, favBtnRef.current)}>
                                <Icon name="BookmarkIcon" size={18} style={faved ? undefined : { filter: 'grayscale(1)', opacity: 0.55 }} />
                            </button>
                        </div>
                    </div>
                    <div className="hero-title-band">
                        <div style={{ minWidth: 0 }}>
                            <h1 className="hero-name">{park.name}</h1>
                            <div className="hero-sub">
                                <TagC color={color} variant="solid" size="small" icon={catMeta(park.cat).icon}>{catMeta(park.cat).label}</TagC>
                                <TagC color="default" variant="solid" size="small" icon="LocationIcon">{park.district}</TagC>
                            </div>
                        </div>
                        <div className="hero-rating-chip">
                            <span className="num">{park.rating.toFixed(1)}</span>
                            <span className="lbl">{park.reviews} 条评价</span>
                        </div>
                    </div>
                </div>

                {/* 内容区 */}
                <div className="detail-sheet">
                    {/* 基本信息 */}
                    <section className="detail-section">
                        <div className="info-grid">
                            <div className="info-cell">
                                <span className="ic-circle" style={{ background: '#e0f2f1' }}><Icon name="ClockIcon" size={21} /></span>
                                <span><span className="k">开放时间</span><span className="v" style={{ color: os.open ? 'var(--animal-success-active)' : 'var(--animal-error)' }}>{os.open ? '营业中' : '已闭园'} · {park.open === '全天' ? '全天' : `${park.open}-${park.close}`}</span></span>
                            </div>
                            <div className="info-cell">
                                <span className="ic-circle" style={{ background: '#fff8e1' }}><Icon name="TagIcon" size={20} /></span>
                                <span><span className="k">门票</span><span className="v">{park.ticketNote}</span></span>
                            </div>
                            <div className="info-cell">
                                <span className="ic-circle" style={{ background: '#ffebee' }}><Icon name="MapIcon" size={20} /></span>
                                <span style={{ minWidth: 0 }}><span className="k">距离 · 地址</span><span className="v" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{park.distance}km · {park.address}</span></span>
                            </div>
                            <div className="info-cell">
                                <span className="ic-circle" style={{ background: '#f1f8e9' }}><Icon name="SunIcon" size={20} /></span>
                                <span><span className="k">最佳季节</span><span className="v">{park.best}</span></span>
                            </div>
                        </div>
                    </section>

                    {/* 数据带（odometer） */}
                    <section className="detail-section">
                        <div className="stat-band pattern pattern-app-yellow">
                            <div className="stat-cell">
                                <div className="stat-num"><Odometer value={park.area} /><span className="unit">公顷</span></div>
                                <div className="stat-lbl">园区面积</div>
                            </div>
                            <div className="stat-cell">
                                <div className="stat-num"><Odometer value={park.reviews} delay={80} /></div>
                                <div className="stat-lbl">累计评价</div>
                            </div>
                            <div className="stat-cell">
                                <div className="stat-num"><Odometer value={likeCount(park)} delay={160} /><span className="unit">赞</span></div>
                                <div className="stat-lbl">公园点赞</div>
                            </div>
                        </div>
                    </section>

                    {/* 简介 */}
                    <section className="detail-section">
                        <div className="section-head"><Ribbon color="rb-teal" variant="layer" size={14}>公园简介</Ribbon></div>
                        <p style={{ fontSize: 14, lineHeight: 1.85, color: 'var(--animal-text-body)', fontWeight: 500 }}>{park.desc}</p>
                    </section>

                    {/* 亮点 */}
                    <section className="detail-section">
                        <div className="section-head"><Ribbon color="rb-yellow" variant="layer" size={14}>不能错过</Ribbon></div>
                        {park.highlights.map((hgt, i) => (
                            <div className="highlight-item" key={i} style={{ animationDelay: `${0.1 + i * 0.09}s` }}>
                                <Icon name="CheckIcon" size={17} style={{ flexShrink: 0 }} />
                                <p>{hgt}</p>
                            </div>
                        ))}
                    </section>

                    {/* 一周人流 */}
                    <section className="detail-section">
                        <div className="section-head">
                            <Ribbon color="rb-blue" variant="layer" size={14}>一周人流趋势</Ribbon>
                            <span className="section-more"><CrowdDots level={park.crowd} />{crowdText(park.crowd)}</span>
                        </div>
                        <div className="crowd-chart">
                            {park.crowdWeek.map((c, i) => (
                                <div className="crowd-col" key={i}>
                                    <div className={cn('crowd-bar', i === ti && 'now', c >= 4 && i !== ti && 'peak')}
                                        style={{ height: `${Math.max(c, 0.4) / 5 * 100}%`, animationDelay: `${0.15 + i * 0.06}s` }} />
                                    <span className={cn('crowd-day', i === ti && 'now')}>{i === ti ? '今天' : WEEK_LABELS[i]}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 特色标签 */}
                    <section className="detail-section">
                        <div className="section-head"><Ribbon color="rb-pink" variant="layer" size={14}>公园特色</Ribbon></div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                            {park.features.map((f, i) => (
                                <TagC key={f} color={[color, 'app-yellow', 'app-teal', 'app-pink', 'app-blue', 'lime-green'][i % 6]} variant="soft" size="medium">{f}</TagC>
                            ))}
                        </div>
                    </section>

                    {/* 设施 */}
                    <section className="detail-section">
                        <div className="section-head"><Ribbon color="rb-green" variant="layer" size={14}>园区设施</Ribbon></div>
                        <div className="facility-grid">
                            {park.facilities.map((f, i) => (
                                <div className="facility" key={i} onClick={() => toast('info', `${f.label} · 详情见园区导览图`)}>
                                    <Icon name={f.icon} size={25} />
                                    <span>{f.label}</span>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 贴士 */}
                    <section className="detail-section">
                        <div className="tip-card card dashed">
                            <Icon name="BulbIcon" size={20} style={{ flexShrink: 0, marginTop: 1 }} />
                            <p style={{ color: 'var(--animal-text-muted)' }}><b style={{ color: 'var(--animal-text-body)' }}>游玩贴士 · </b>{park.tips}</p>
                        </div>
                    </section>

                    {/* 评论 */}
                    <section className="detail-section">
                        <div className="section-head">
                            <Ribbon color="rb-orange" variant="layer" size={14}>大家怎么说</Ribbon>
                            <span className="section-more">{park.reviews} 条<Icon name="ChevronRightIcon" size={12} /></span>
                        </div>
                        <div className="card" style={{ padding: '4px 14px' }}>
                            {park.comments.map((c, i) => {
                                const key = `${park.id}:${i}`;
                                const cLiked = cLikes.includes(key);
                                return (
                                    <div className="comment" key={i} style={{ animationDelay: `${0.08 * i}s` }}>
                                        <span className={cn('comment-avatar', c.bg)}><Icon name={c.icon} size={22} /></span>
                                        <div className="comment-main">
                                            <div className="comment-head">
                                                <span className="comment-user">{c.user}</span>
                                                <span className="comment-time">{c.time}</span>
                                            </div>
                                            <p className="comment-text">{c.text}</p>
                                            <button className={cn('comment-like', cLiked && 'liked')}
                                                onClick={e => {
                                                    const next = cLiked ? cLikes.filter(x => x !== key) : [key, ...cLikes];
                                                    setCLikes(next);
                                                    store.set({ cLikes: next });
                                                    if (!cLiked) {
                                                        const r = e.currentTarget.getBoundingClientRect();
                                                        burst(r.left + 12, r.top + 8, { count: 5, colors: ['#fc736d', '#f8a6b2'] });
                                                    }
                                                }}>
                                                <Icon name="HeartIcon" size={12} />{c.likes + (cLiked ? 1 : 0)}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* FAQ */}
                    <section className="detail-section">
                        <div className="section-head"><Ribbon color="rb-purple" variant="layer" size={14}>常见问题</Ribbon></div>
                        {park.faq.map(([qst, ans], i) => (
                            <div className={cn('faq-item', faqOpen === i && 'open')} key={i}>
                                <button className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? -1 : i)} aria-expanded={faqOpen === i}>
                                    <span className="q-icon">{faqOpen === i ? '−' : '?'}</span>
                                    <span className="q-text">{qst}</span>
                                    <Icon name="ChevronDownIcon" size={14} style={{ color: 'var(--animal-text-secondary)', transition: 'transform 0.3s var(--animal-ease)', transform: faqOpen === i ? 'rotate(180deg)' : 'none' }} />
                                </button>
                                <div className="faq-a-wrap"><div className="faq-a-inner"><div className="faq-a">{ans}</div></div></div>
                            </div>
                        ))}
                    </section>

                    {/* 相关推荐 */}
                    {related.length > 0 && (
                        <section className="detail-section">
                            <div className="section-head">
                                <Ribbon color="rb-teal" variant="layer" size={14}>猜你还想去</Ribbon>
                            </div>
                            {related.map((p, i) => (
                                <MiniPark key={p.id} park={p} index={i} onOpen={onOpenPark} reason={p.tags[0]} />
                            ))}
                        </section>
                    )}
                </div>
            </div>

            {/* 底部操作栏 */}
            <div className="detail-action-bar">
                <button className={cn('dab-icon-btn', faved && 'on fav')}
                    onClick={e => toggleFav(park, e.currentTarget)}>
                    <Icon name="BookmarkIcon" size={19} style={faved ? undefined : { filter: 'grayscale(1)', opacity: 0.6 }} />
                    <span>{faved ? '已收藏' : '收藏'}</span>
                </button>
                <button ref={likeBtnRef} className={cn('dab-icon-btn', liked && 'on')} onClick={doLike}>
                    <Icon name="HeartIcon" size={19} style={liked ? undefined : { filter: 'grayscale(1)', opacity: 0.5 }} />
                    <span className="dab-like-count">{likeCount(park) > 999 ? (likeCount(park) / 1000).toFixed(1) + 'k' : likeCount(park)}</span>
                </button>
                <Btn type="default" size="middle" icon="ChatIcon" style={{ height: 48, borderRadius: 16 }}
                    onClick={() => onOpenChat(`${park.name}怎么样？`, park.id)}>问小屿</Btn>
                <Btn type="primary" size="middle" icon="CompassIcon" style={{ flex: 1, height: 48 }}
                    onClick={() => setNavModal(true)}>导航前往</Btn>
            </div>

            <Modal open={navModal} title="出发去这里？" onClose={() => setNavModal(false)}
                footer={
                    <React.Fragment>
                        <Btn type="default" size="middle" onClick={() => setNavModal(false)}>再想想</Btn>
                        <Btn type="yellow" size="middle" icon="CheckIcon" onClick={() => { setNavModal(false); toast('success', '演示环境暂未接入地图导航'); }}>好的</Btn>
                    </React.Fragment>
                }>
                <p>{park.address}</p>
                <p style={{ fontSize: 13, marginTop: 6, color: 'var(--animal-text-secondary)' }}>距你 {park.distance} 公里 · 骑行约 {Math.round(park.distance * 4)} 分钟</p>
            </Modal>
        </div>
    );
}
