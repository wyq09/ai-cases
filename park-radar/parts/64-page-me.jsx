/* =====================================================================
   公园雷达 · 我的页面
   ===================================================================== */
const BADGES = [
    { key: 'fav1', name: '初次收藏', icon: 'BookmarkIcon', color: 'app-yellow', bg: 'pattern-app-yellow', need: s => s.favs.length >= 1, desc: '收藏第一个公园' },
    { key: 'like3', name: '点赞达人', icon: 'ThumbsUpIcon', color: 'app-pink', bg: 'pattern-app-pink', need: s => s.likes.length >= 3, desc: '点赞 3 个公园' },
    { key: 'hist5', name: '公园猎人', icon: 'CompassIcon', color: 'app-teal', bg: 'pattern-app-teal', need: s => s.history.length >= 5, desc: '浏览 5 个公园' },
    { key: 'all', name: '全能探索家', icon: 'TrophyIcon', color: 'purple', bg: 'pattern-purple', need: s => s.favs.length >= 1 && s.likes.length >= 3 && s.history.length >= 5, desc: '达成全部成就' },
];

function MePage({ onOpenPark, onGoList }) {
    const st = useStore();
    const [tab, setTab] = useState('favs');
    const [aboutOpen, setAboutOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [removing, setRemoving] = useState(null);

    const favParks = st.favs.map(id => PARK_BY_ID[id]).filter(Boolean);
    const likeParks = st.likes.map(id => PARK_BY_ID[id]).filter(Boolean);
    const histParks = st.history.map(x => PARK_BY_ID[x.id]).filter(Boolean);

    const setSetting = (k, v) => store.set(s => ({ settings: { ...s.settings, [k]: v } }));

    const removeItem = (park, from) => {
        setRemoving(park.id + from);
        setTimeout(() => {
            if (from === 'favs') store.set(s => ({ favs: s.favs.filter(x => x !== park.id) }));
            if (from === 'likes') store.set(s => ({ likes: s.likes.filter(x => x !== park.id) }));
            if (from === 'hist') store.set(s => ({ history: s.history.filter(x => x.id !== park.id) }));
            setRemoving(null);
            toast('info', `已从${from === 'favs' ? '收藏' : from === 'likes' ? '点赞' : '足迹'}中移除`);
        }, 320);
    };

    const list = tab === 'favs' ? favParks : tab === 'likes' ? likeParks : histParks;
    const unlocked = BADGES.filter(b => b.need(st)).length;

    const emptyCfg = {
        favs: { icon: 'BookmarkIcon', title: '还没有收藏的公园', desc: '在公园卡片上点书签，就会出现在这里' },
        likes: { icon: 'HeartIcon', title: '还没有点赞的公园', desc: '遇到喜欢的公园，点心形告诉它' },
        hist: { icon: 'CompassIcon', title: '还没有浏览足迹', desc: '去发现页逛逛，足迹会自动记录' },
    }[tab];

    return (
        <div className="page-scroller" id="me-scroller">
            {/* 头部资料卡 */}
            <header className="me-header pattern pattern-app-teal">
                <div className="me-profile">
                    <div className="me-avatar">
                        <Icon name="FoxIcon" size={40} />
                        <span className="lvl">Lv.{1 + Math.floor((st.favs.length + st.likes.length + st.history.length) / 4)}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="me-name">公园探索家</div>
                        <div className="me-desc">
                            <Icon name="LocationIcon" size={12} />{CITY} · 已解锁 {unlocked}/{BADGES.length} 枚徽章
                        </div>
                    </div>
                    <Btn type="default" size="small" icon="PencilIcon" onClick={() => toast('info', '演示环境暂不支持编辑资料')}>编辑</Btn>
                </div>
                <div className="me-stats">
                    <div className="me-stat" onClick={() => setTab('favs')}>
                        <div className="num"><Odometer value={st.favs.length} /></div>
                        <div className="lbl">收藏</div>
                    </div>
                    <div className="me-stat" onClick={() => setTab('likes')}>
                        <div className="num"><Odometer value={st.likes.length} delay={70} /></div>
                        <div className="lbl">点赞</div>
                    </div>
                    <div className="me-stat" onClick={() => setTab('hist')}>
                        <div className="num"><Odometer value={st.history.length} delay={140} /></div>
                        <div className="lbl">足迹</div>
                    </div>
                    <div className="me-stat" onClick={() => toast('info', `探索积分 ${st.favs.length * 10 + st.likes.length * 5 + st.history.length * 2}（演示）`)}>
                        <div className="num"><Odometer value={st.favs.length * 10 + st.likes.length * 5 + st.history.length * 2} delay={210} /></div>
                        <div className="lbl">积分</div>
                    </div>
                </div>
            </header>

            {/* 成就徽章 */}
            <section className="me-section">
                <div className="section-head" style={{ marginBottom: 10 }}>
                    <Ribbon color="rb-yellow" variant="layer" size={13}>探索成就</Ribbon>
                    <span className="section-more">{unlocked}/{BADGES.length} 已解锁</span>
                </div>
                <div className="badge-row">
                    {BADGES.map(b => {
                        const got = b.need(st);
                        return (
                            <div key={b.key} className={cn('badge', got ? `pattern ${b.bg} unlocked` : 'locked')}
                                onClick={() => toast(got ? 'success' : 'info', got ? `已达成「${b.name}」！` : `${b.name}：${b.desc}`)}>
                                <span className="b-ic"><Icon name={b.icon} size={23} /></span>
                                <span className="b-name" style={{ color: got ? 'var(--animal-text-body)' : undefined }}>{b.name}</span>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* 收藏/点赞/足迹 */}
            <section className="me-section">
                <div className="me-tabs">
                    <button className={cn('me-tab', tab === 'favs' && 'active')} onClick={() => setTab('favs')}>
                        <Icon name="BookmarkIcon" size={14} />收藏<span className="cnt">{favParks.length}</span>
                    </button>
                    <button className={cn('me-tab', tab === 'likes' && 'active')} onClick={() => setTab('likes')}>
                        <Icon name="HeartIcon" size={14} />点赞<span className="cnt">{likeParks.length}</span>
                    </button>
                    <button className={cn('me-tab', tab === 'hist' && 'active')} onClick={() => setTab('hist')}>
                        <Icon name="ClockIcon" size={14} />足迹<span className="cnt">{histParks.length}</span>
                    </button>
                </div>
                <div key={tab}>
                    {list.length ? list.map((p, i) => (
                        <MiniPark key={p.id + tab} park={p} index={i} onOpen={onOpenPark}
                            removing={removing === p.id + tab}
                            onRemove={() => removeItem(p, tab)} />
                    )) : (
                        <EmptyState icon={emptyCfg.icon} title={emptyCfg.title} desc={emptyCfg.desc}
                            action={<Btn type="teal" size="middle" icon="SearchIcon" style={{ marginTop: 6 }} onClick={onGoList}>去发现公园</Btn>} />
                    )}
                </div>
            </section>

            {/* 设置 */}
            <section className="me-section">
                <div className="section-head" style={{ marginBottom: 10 }}>
                    <Ribbon color="rb-green" variant="layer" size={13}>偏好设置</Ribbon>
                </div>
                <div className="setting-row">
                    <span className="s-ic" style={{ background: '#e0f2f1' }}><Icon name="BellIcon" size={20} /></span>
                    <span className="s-main">
                        <span className="s-name">公园快报通知</span>
                        <span className="s-desc">花期、活动与限流提醒</span>
                    </span>
                    <SwitchCtl label="通知开关" checked={st.settings.notify} onChange={v => { setSetting('notify', v); toast('info', v ? '已开启快报通知' : '已关闭快报通知'); }} />
                </div>
                <div className="setting-row">
                    <span className="s-ic" style={{ background: '#fff8e1' }}><Icon name="EyeIcon" size={20} /></span>
                    <span className="s-main">
                        <span className="s-name">记录浏览足迹</span>
                        <span className="s-desc">帮我记住看过的公园</span>
                    </span>
                    <SwitchCtl label="足迹开关" checked={st.settings.record} onChange={v => setSetting('record', v)} />
                </div>
                <div className="setting-row">
                    <span className="s-ic" style={{ background: '#f3e5f5' }}><Icon name="LeafIcon" size={20} /></span>
                    <span className="s-main">
                        <span className="s-name">减弱动效</span>
                        <span className="s-desc">减少动画，界面更平稳省电</span>
                    </span>
                    <SwitchCtl label="动效开关" checked={st.settings.reduceMotion}
                        onChange={v => { setSetting('reduceMotion', v); document.body.classList.toggle('reduce-motion', v); }} />
                </div>
                <div className="setting-row clickable" onClick={() => setClearOpen(true)}>
                    <span className="s-ic" style={{ background: '#ffebee' }}><Icon name="TrashIcon" size={20} /></span>
                    <span className="s-main">
                        <span className="s-name" style={{ color: 'var(--animal-error)' }}>清除本地数据</span>
                        <span className="s-desc">收藏、点赞、足迹与聊天记录</span>
                    </span>
                    <Icon name="ChevronRightIcon" size={14} style={{ color: 'var(--animal-text-disabled)' }} />
                </div>
                <div className="setting-row clickable" onClick={() => setAboutOpen(true)}>
                    <span className="s-ic" style={{ background: '#e8f5e9' }}><Icon name="BulbIcon" size={20} /></span>
                    <span className="s-main">
                        <span className="s-name">关于公园雷达</span>
                        <span className="s-desc">版本 1.0.0 · 设计与动效致谢</span>
                    </span>
                    <Icon name="ChevronRightIcon" size={14} style={{ color: 'var(--animal-text-disabled)' }} />
                </div>
            </section>

            <footer className="me-footer">
                公园雷达 ParkRadar · 演示应用，公园与数据均为虚构<br />
                视觉风格致敬 <a href="https://github.com/guokaigdg/animal-island-ui" target="_blank" rel="noreferrer">animal-island-ui</a> · 动效致敬 <a href="https://rareui.com" target="_blank" rel="noreferrer">Rare UI</a>
            </footer>

            {/* 清除数据确认（blob modal） */}
            <Modal open={clearOpen} title="清除本地数据？" onClose={() => setClearOpen(false)}
                footer={
                    <React.Fragment>
                        <Btn type="default" size="middle" onClick={() => setClearOpen(false)}>取消</Btn>
                        <Btn type="danger" size="middle" icon="TrashIcon" onClick={() => {
                            LS.clearAll();
                            store.set({ favs: [], likes: [], cLikes: [], history: [], settings: { notify: true, record: true, reduceMotion: false } });
                            LS.set('chat', []);
                            document.body.classList.remove('reduce-motion');
                            setClearOpen(false);
                            toast('success', '本地数据已清除');
                        }}>清除</Btn>
                    </React.Fragment>
                }>
                <p>收藏、点赞、足迹和聊天记录都会被清空，且无法恢复。</p>
            </Modal>

            {/* 关于（blob modal） */}
            <Modal open={aboutOpen} title="关于公园雷达" onClose={() => setAboutOpen(false)}
                footer={<Btn type="yellow" size="middle" onClick={() => setAboutOpen(false)}>关闭</Btn>}>
                <div style={{ textAlign: 'left', fontSize: 13, lineHeight: 1.8 }}>
                    <p><b>公园雷达 v1.0.0</b> —— 帮你发现身边好公园的 H5 演示应用。</p>
                    <hr className="divider-wave" />
                    <p style={{ fontSize: 12, color: 'var(--animal-text-secondary)' }}>
                        · 视觉设计语言：<a href="https://github.com/guokaigdg/animal-island-ui" target="_blank" rel="noreferrer">animal-island-ui</a>（MIT）<br />
                        · 特效动画参考：<a href="https://rareui.com" target="_blank" rel="noreferrer">Rare UI</a>（Fluid Orb / 粒子爆发 / 数字滚轮 / 粘滞导航）<br />
                        · 图标：<a href="https://github.com/guokaigdg/naive-icons" target="_blank" rel="noreferrer">naive-icons</a>（MIT）<br />
                        · 城市与公园数据均为虚构，仅供演示。
                    </p>
                </div>
            </Modal>
        </div>
    );
}
