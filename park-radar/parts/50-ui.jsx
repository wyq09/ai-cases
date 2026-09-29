/* =====================================================================
   公园雷达 · UI 组件层（hand-rolled，镜像 animal-island-ui API）
   ===================================================================== */

/* ---------- Button ---------- */
function Btn({ type = 'default', size = 'middle', block, icon, children, onClick, disabled, className, style, title }) {
    return (
        <button title={title} disabled={disabled}
            className={cn('btn', `btn-${type}`, `btn-${size}`, block && 'btn-block', className)}
            style={style} onClick={onClick}>
            {icon && <Icon name={icon} size={size === 'small' ? 13 : size === 'large' ? 17 : 15} />}
            {children}
        </button>
    );
}

/* ---------- Tag ---------- */
function TagC({ color = 'default', variant = 'soft', size = 'small', icon, children, style, onClick }) {
    return (
        <span onClick={onClick} style={style}
            className={cn('tag', `tag-${size}`, variant === 'soft' ? `tag-soft-${color}` : variant === 'solid' ? `tag-solid-${color}` : `tag-${variant}-default`)}>
            {icon && <Icon name={icon} size={size === 'small' ? 12 : 14} />}
            {children}
        </span>
    );
}

/* ---------- 丝带标题 ---------- */
function Ribbon({ children, color = 'rb-teal', variant = 'ribbon', size = 15, style }) {
    if (variant === 'layer') {
        return (
            <span className={cn('ribbon-layer', color)} style={{ fontSize: size, ...style }}>
                <span className="ribbon-layer-front">{children}</span>
            </span>
        );
    }
    return (
        <span className={cn('ribbon', color)} style={{ fontSize: size, ...style }}>
            <span className="ribbon-body">
                <span className="ribbon-back ribbon-back-l" />
                <span className="ribbon-back ribbon-back-r" />
                <span className="ribbon-fold ribbon-fold-l" />
                <span className="ribbon-fold ribbon-fold-r" />
                <span className="ribbon-front" />
                <span className="ribbon-text">{children}</span>
            </span>
        </span>
    );
}

/* ---------- 人流点 ---------- */
function CrowdDots({ level }) {
    return (
        <span className="crowd-dots" title={`人流 ${level}/5`}>
            {[1, 2, 3, 4, 5].map(i => <i key={i} className={cn('crowd-dot', i <= level && `on-${level}`)} />)}
        </span>
    );
}

/* ---------- 开关 ---------- */
function SwitchCtl({ checked, onChange, label }) {
    return (
        <button role="switch" aria-checked={checked} aria-label={label}
            className={cn('switch', checked && 'on')}
            onClick={(e) => { e.stopPropagation(); onChange(!checked); }}>
            <span className="handle" />
        </button>
    );
}

/* ---------- Modal（SVG blob） ---------- */
function Modal({ open, title, children, onClose, footer }) {
    useEffect(() => {
        if (!open) return;
        const fn = e => e.key === 'Escape' && onClose && onClose();
        window.addEventListener('keydown', fn);
        return () => window.removeEventListener('keydown', fn);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="modal-mask" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                <div className="modal-blob">
                    {onClose && (
                        <button className="modal-close" onClick={onClose} aria-label="关闭">
                            <Icon name="CloseIcon" size={20} />
                        </button>
                    )}
                    {title && <div className="modal-title">{title}</div>}
                    <div className="modal-body">{children}</div>
                    {footer && <div className="modal-footer">{footer}</div>}
                </div>
            </div>
        </div>
    );
}

/* ---------- 空状态 ---------- */
function EmptyState({ icon = 'CompassIcon', title, desc, action }) {
    return (
        <div className="card dashed empty-state">
            <span className="e-ic"><Icon name={icon} size={60} /></span>
            <div className="e-title">{title}</div>
            {desc && <div className="e-desc">{desc}</div>}
            {action}
        </div>
    );
}

/* ---------- 骨架屏卡片 ---------- */
function SkeletonCard() {
    return (
        <div className="park-card" style={{ pointerEvents: 'none' }}>
            <div className="skeleton active" style={{ height: 132, borderRadius: 0 }} />
            <div className="pc-body">
                <div className="skeleton active" style={{ height: 18, width: '55%', marginBottom: 10 }} />
                <div className="skeleton active" style={{ height: 12, width: '80%', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                    <div className="skeleton active" style={{ height: 22, width: 56, borderRadius: 20 }} />
                    <div className="skeleton active" style={{ height: 22, width: 66, borderRadius: 20 }} />
                    <div className="skeleton active" style={{ height: 22, width: 48, borderRadius: 20 }} />
                </div>
            </div>
        </div>
    );
}

/* ---------- 公园卡片（列表页） ---------- */
function ParkCard({ park, index, onOpen }) {
    const st = useStore();
    const liked = st.likes.includes(park.id);
    const os = openState(park);
    const color = catMeta(park.cat).color || 'app-teal';
    const heartRef = useRef(null);
    return (
        <article className="park-card enter" style={{ animationDelay: `${Math.min(index, 8) * 0.06}s` }}>
            <div className="pc-scene" onClick={() => onOpen(park.id)}>
                <SceneArt park={park} variant="card" />
                <div className="pc-badges">
                    <TagC color={color} variant="solid" size="small" icon={catMeta(park.cat).icon}>{catMeta(park.cat).label}</TagC>
                    <button ref={heartRef} className={cn('pc-heart', liked && 'liked')} aria-label={liked ? '取消点赞' : '点赞'}
                        onClick={e => { e.stopPropagation(); toggleLike(park, heartRef.current); }}>
                        <Icon name="HeartIcon" size={18} />
                    </button>
                </div>
                <span className={cn('pc-open', !os.open && 'closed')}>
                    <i className="dot" />{os.open ? '营业中' : '已闭园'} · {park.open === '全天' ? '全天' : `${park.open}-${park.close}`}
                </span>
                <span className="pc-dist" style={{ position: 'absolute', bottom: 10, right: 10, zIndex: 5 }}>
                    <Icon name="LocationIcon" size={12} />{park.distance} km
                </span>
            </div>
            <div className="pc-body" onClick={() => onOpen(park.id)}>
                <div className="pc-title-row">
                    <h3 className="pc-name">{park.name}</h3>
                    <span className="pc-rating"><Icon name="StarIcon" size={15} />{park.rating.toFixed(1)}</span>
                </div>
                <div className="pc-meta">
                    <span className="m"><Icon name="ChatIcon" size={12} style={{ opacity: 0.6 }} />{park.reviews > 999 ? (park.reviews / 1000).toFixed(1) + 'k' : park.reviews} 条评价</span>
                    <span className="m"><CrowdDots level={park.crowd} />{crowdText(park.crowd)}</span>
                    <span className="m" style={{ marginLeft: 'auto', color: park.ticket === 0 ? 'var(--animal-success-active)' : undefined, fontWeight: 800 }}>
                        {park.ticket === 0 ? '免费' : `¥${park.ticket}`}
                    </span>
                </div>
                <div className="pc-tags">
                    {park.tags.slice(0, 4).map((t, i) => (
                        <TagC key={t} color={['app-teal', 'app-yellow', 'app-pink', 'app-blue'][i % 4]} variant="soft" size="small">{t}</TagC>
                    ))}
                </div>
            </div>
        </article>
    );
}

/* ---------- 迷你公园行（我的页 / 聊天） ---------- */
function MiniPark({ park, index, right, onOpen, onRemove, reason, removing }) {
    const color = catMeta(park.cat).color || 'app-teal';
    return (
        <div className={cn('mini-park', removing && 'removing')} style={{ animationDelay: `${Math.min(index, 6) * 0.05}s` }} onClick={() => onOpen(park.id)}>
            <div className="mini-thumb"><SceneArt park={park} variant="thumb" /></div>
            <div className="mini-info">
                <div className="mini-name">{park.name}</div>
                <div className="mini-meta">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}><Icon name="StarIcon" size={12} />{park.rating.toFixed(1)}</span>
                    <span>{park.distance} km</span>
                    <span style={{ color: park.ticket === 0 ? 'var(--animal-success-active)' : undefined }}>{park.ticket === 0 ? '免费' : `¥${park.ticket}`}</span>
                </div>
                <div className="mini-tags">
                    <TagC color={color} variant="soft" size="small">{catMeta(park.cat).label}</TagC>
                    {reason
                        ? <TagC color="app-yellow" variant="soft" size="small">{reason}</TagC>
                        : park.tags.slice(0, 2).map(t => <TagC key={t} color="default" variant="outlined" size="small">{t}</TagC>)}
                </div>
            </div>
            {right || (onRemove && (
                <button className="mini-del" aria-label="移除"
                    onClick={e => { e.stopPropagation(); onRemove(park); }}>
                    <Icon name="TrashIcon" size={17} />
                </button>
            ))}
        </div>
    );
}
