/* ============================================================
   我的女友景甜 · 关系图谱 × 时序图 · 无限画布
   世界坐标 = 设计像素；#world 承载 transform(z,x,y)
   ============================================================ */
'use strict';

const $ = s => document.querySelector(s);
const viewport = $('#viewport'), world = $('#world'), gridEl = $('#grid');
const svg = $('#edges'), nodesEl = $('#nodes'), fx = $('#fx'), fctx = fx.getContext('2d');

const SVG_OFF = { x: 0, y: 0 };                    // svg 原点与世界原点对齐，路径直接用世界坐标
svg.style.left = '0px';
svg.style.top  = '0px';
svg.setAttribute('width', '10'); svg.setAttribute('height', '10');

const C = { rose:'#ff6b8d', gold:'#ffc555', svc:'#8fa8ff', cyan:'#57d7ff', pale:'#cfd2e4', red:'#ff4d4d' };

/* ---------------- 数据：节点 ----------------
   x,y = 卡片中心（世界坐标）；w = 宽度；hub = 参与关系图聚焦 */
const NODES = [
{ id:'hero', x:640, y:430, w:1210, hub:false, cls:'hero', html:`
  <div class="ht">
    <div class="kick">INFINITE CANVAS · 关系图谱 × 时序图 · 2007 — 2026</div>
    <h1>我的女友<em>景甜</em></h1>
    <div class="sub">从 2007 年那张发糊的 QQ 图，到 2026 年 3 月海崖上的那通电话——这张画布收拢了十九年里所有的人和事。<br>每条线都在流动，只有一条，停在了第八天。</div>
    <div class="two">
      <p>一颗卵子的重量，<b>三点五微克</b>。</p>
      <p>五千万美元现金的重量，<b>两点五吨</b>。</p>
    </div>
    <div class="qqrow">
      <img src="assets/qq2007.png" alt="2007年的QQ图片">
      <div class="t">好友申请写了四十分钟，只发出一句“你好”；<br>十九年、七台设备，图跟着人走——像素越来越高，她却越来越糊</div>
    </div>
    <div class="hints"><span>拖拽平移</span><span>滚轮缩放</span><span>悬停卡片高亮关系</span><span>点按卡片聚焦</span><span>顶部可跳转章节</span></div>
  </div>
  <div class="photo"><img src="assets/jt-cannes.jpg" alt="红毯"><div class="cap">“以后别叫我景甜了，<br>叫我妈妈吧。”</div></div>` },

{ id:'credits', x:760, y:1105, w:560, hub:false, cls:'credits', html:`
  <div class="kick">CREDITS</div>
  <div class="ln">原文 · 同名网络虚构小说《我的女友景甜》｜ 本页 · 无限画布可视化实验<br>图片 · 公开网络与 Wikimedia Commons，仅作氛围示意<br>人物、情节与金额均为虚构，请勿与现实对应</div>` },

{ id:'jt', x:3280, y:240, w:330, hub:true, cls:'queen', html:`
  <div class="ph"><img src="assets/jt-cannes.jpg" alt="景甜"><div class="cap">JING TIAN · 2007 → 2026</div></div>
  <div class="nm"><h3>景甜</h3><span class="mama">“妈妈”</span></div>
  <div class="q">“我喜欢一个地方，<b>因为她而空着</b>。”</div>
  <div class="q">“你知道我要这些东西的时候在想什么吗——我在想，<b>你会不会有一次说不</b>。”</div>` },

{ id:'wo', x:2420, y:330, w:300, hub:true, cls:'', ac:C.gold, html:`
  <div class="accent"></div>
  <div class="kick">THE ONE WHO PAID · 付钱的人</div>
  <h3>我</h3>
  <div class="ln">后来我去美国读书、创业，越来越忙，那张图跟着我换了七台设备。第一个十亿的时候，还在想校内网那个问题；一百亿的时候，也在想。后来不想了——人人网倒闭了。<br>十九年后，景甜宇宙的名单上，加了我。</div>` },

{ id:'assistant', x:2260, y:-180, w:290, hub:true, cls:'', ac:C.svc, html:`
  <div class="accent"></div>
  <div class="kick">STAFF · 事情都归他们办</div>
  <h3>助理 × 11</h3>
  <div class="ln">买下整座影厅、在影院门口把现金递给购票的观众、坐水上飞机去马累取戒指。十一个人，早上六点半到，等我们睡了才走——我知道的她的近况，大半来自他们每月汇总的付款单。</div>
  <div class="q">贴胶带的两个女孩把它做成了一门工艺：窗框归一个，空调和插座的灯归一个；下午三点玻璃最烫、胶带最容易掉，就改成早上贴。<b>她知道她们的名字。我不知道。</b></div>` },

{ id:'finance', x:1840, y:-470, w:280, hub:true, cls:'', ac:'#b9a08a', html:`
  <div class="accent"></div>
  <div class="kick">FORMER CFO · 以前跟她一起的</div>
  <h3>财务</h3>
  <div class="ln">进去了，扛了事，出来走投无路，找了她三天，她一直没回。在飞马尔代夫的飞机上她连上星链，打字删了改、改了删，最后转了八万——“你不懂”，她说。<br>那天剩下的时间，她没怎么说话。</div>` },

{ id:'cleaner', x:2890, y:-520, w:290, hub:true, cls:'', ac:C.svc, html:`
  <div class="accent"></div>
  <div class="kick">HOUSEKEEPING · 她走之后</div>
  <h3>清洁工</h3>
  <div class="q">“没人住，为什么还要做？”<br>“<b>登记上写着有人</b>。”</div>
  <div class="ln">她住了八天就走了。剩下二十二天，清洁工每天照常上去，换毛巾、擦台面、掖好被角，退出来把门带上。一座失去皇后的凡尔赛宫。</div>` },

{ id:'montage', x:3800, y:-560, w:350, hub:true, cls:'place', html:`
  <div class="ph"><img src="assets/montage.jpg" alt="蒙太奇拉古纳海滩"><div class="cap">MONTAGE LAGUNA BEACH</div></div>
  <div class="bd"><div class="kick">海崖之上 · 太平洋</div>
  <div class="ln">一层，三十天，一百万美元，为了她的隐私。<b style="color:#ff8d8d">第八天，她打了那个电话，之后没有人再见过她。</b>玻璃上的胶痕清不掉，最后整块换掉——那面窗，朝着太平洋。</div></div>` },

{ id:'g700', x:4430, y:-620, w:310, hub:true, cls:'place', html:`
  <div class="ph"><img src="assets/g700.jpg" alt="湾流G700"><div class="cap">GULFSTREAM G700</div></div>
  <div class="bd"><div class="ln">与那层楼一起空着的，还有停在 Van Nuys 的它，机组每天照常报到。至于 A330：两百人的机身只坐三十个人，太轻，配平不对，每次都多加油，加到够重，落地再放掉。<br>每次都这样。</div></div>` },

{ id:'stars', x:4620, y:40, w:410, hub:true, cls:'stars', html:`
  <div class="kick">景甜宇宙 · 陪衬名单</div>
  <div class="row"><span class="mv">战国</span><span class="names">孙红雷 · 吴镇宇 · 金喜善 · 中井贵一 · 姜武</span></div>
  <div class="row"><span class="mv">长城</span><span class="names">张艺谋 · 刘德华 · 马特·达蒙</span></div>
  <div class="row"><span class="mv">然后</span><span class="names">成龙 ·…… 名单越来越长</span></div>
  <div class="ft">他们不知道自己为什么出现在这里。来都来了，总得发生些什么——<b style="color:#d9d5c7">但是什么都没有发生。</b>后来我明白，她要的就是这个：一个因为她而空着的地方。</div>` },

{ id:'surrogate', x:4520, y:660, w:320, hub:true, cls:'', ac:C.gold, html:`
  <div class="accent"></div>
  <div class="kick">SURROGATE · 一月就定好的人</div>
  <h3>代孕者</h3>
  <div class="ln">加州人，三十四岁，生过两个。定金二十万美元，不退。档案里有她的照片，我没看过。孩子预计二〇二七年出生，快一点的话，还能属马。<br>我没有问过为什么必须代孕——我以为她怕疼。</div>` },

{ id:'athlete', x:4060, y:1060, w:300, hub:true, cls:'forbidden', html:`
  <div class="kick">FORBIDDEN NAME · 禁忌词</div>
  <h3>那个运动员</h3>
  <div class="ln">我们像交换暗号一样交换过彼此的前任，像王朝核对年号，只有一个名字绕了过去。<br>我知道妈妈背上的纹身是因为他纹的——可能因为太大了，洗不掉。</div>` },

{ id:'accounts', x:2820, y:800, w:320, hub:true, cls:'', ac:C.gold, html:`
  <div class="accent"></div>
  <div class="kick">ACCOUNTS · 彩礼去向</div>
  <h3>景国庆 · 田心爱</h3>
  <div class="ln">她说，我爸妈把我养这么大不容易，你得给彩礼。报了两个名字、两个账号，三千万转了过去，田心爱回了两个字：<b style="color:#ffc555">收到</b>。<br>这两个名字，我是在那四十几页里第一次见到的。</div>` },

{ id:'claude', x:3150, y:1060, w:350, hub:true, cls:'claude', html:`
  <div class="bar"><i></i>CLAUDE · API · 2026.03</div>
  <div class="say">“不要把这五千万美元给她。”</div>
  <div class="ln">我问：她不再爱我了吗？<br><span class="a">“对于爱情，我不关心，也不理解。<br>但是你不能把这五千万美元给她。”</span><br>它一点犹豫都没有，它不为难。从来没有人替我说过“不”。我当时想，这大概是更高的一种东西——人做不到这样。<span class="cursor"></span></div>` },

{ id:'nail', x:3660, y:920, w:230, hub:true, cls:'artifact', html:`
  <div class="ph"><img src="assets/nailfile.jpg" alt="指甲锉"></div>
  <div class="kick">她留下的 · 那套工具</div>
  <div class="ln">“磨到不刮人为止。”第一次看完电影那晚，她把我的手放在她腿上，一根一根磨了快一个小时。她说，要是以后我不在了，就再没有人给你抛指甲了。<br>现在我的指甲，还是磨人的。</div>` },

{ id:'xiaonei', x:1950, y:60, w:300, hub:true, cls:'place', html:`
  <div class="ph" style="height:150px;background:#05060a;display:flex;align-items:center;justify-content:center"><img src="assets/qq2007.png" style="width:64%;image-rendering:pixelated" alt="2007 QQ 图片"></div>
  <div class="bd"><div class="kick">2007 · 北大宿舍 · 故事从这里开始</div>
  <div class="ln">那年我进北大，一年房租一千块。QQ 弹出代言人是她的窗口，我把图存了下来；在校内网找到她，留言写了删、删了写，四十分钟，最后发出去一句<b style="color:#ff8da6">“你好”</b>。</div>
  <div class="q">她没有通过，也许根本没用过校内网。我没有再申请第二次——只是从那天起，我总在算一件事：到了什么程度，她才会通过。</div></div>` },

{ id:'ledger', x:5850, y:230, w:900, hub:false, cls:'ledger', html:`
  <div class="sub">THE LEDGER · Ⅲ · 这场爱情，最后是被计价的</div>
  <h2>这场爱情的计价单位</h2>
  <div class="rows">
    <div class="r"><span class="n">那通电话 · 第八天</span><span class="v">$50,000,000</span></div>
    <div class="r"><span class="n">彩礼 · 两个名字“收到”</span><span class="v">¥30,000,000</span></div>
    <div class="r"><span class="n">卡特兰的香蕉 · “烂了怎么办”</span><span class="v">$6,200,000</span></div>
    <div class="r"><span class="n">蒙太奇一层 · 三十天隐私</span><span class="v">$1,000,000</span></div>
    <div class="r"><span class="n">代孕定金 · 不退</span><span class="v">$200,000</span></div>
    <div class="r"><span class="n">勒索 · 她想了三天</span><span class="v">¥80,000</span></div>
    <div class="r"><span class="n">A330 每次多加又放掉的油</span><span class="v">&gt; 一层楼</span></div>
    <div class="r"><span class="n">特纳里费的窗 · 胶痕清不掉</span><span class="v">整块玻璃</span></div>
    <div class="r"><span class="n">影院门口领现金的人</span><span class="v">26 位</span></div>
    <div class="r"><span class="n">胶带 · 后来又补了二十卷</span><span class="v">50 + 20 卷</span></div>
    <div class="r"><span class="n">电话两头的沉默</span><span class="v">11 秒</span></div>
    <div class="r"><span class="n">心跳 · 和平时没有区别</span><span class="v">62 bpm</span></div>
  </div>
  <div class="vs">
    <div class="cell"><div class="a">一颗卵子的重量</div><div class="b">3.5 微克</div></div>
    <div class="cell"><div class="a">五千万美元现金的重量</div><div class="b">2.5 吨</div></div>
  </div>
  <div class="ft">—— 如果那天我给了，她会留下来吗。我想了很久。</div>` },

{ id:'finale', x:7060, y:1950, w:820, hub:false, cls:'finale', html:`
  <div class="bgimg"><img src="assets/hknite.jpg" alt="凌晨三点的香港"></div>
  <div class="scrim"></div>
  <div class="inner">
    <div class="kick">EPILOGUE · Ⅳ · 凌晨三点</div>
    <h2>凌晨三点的香港，<br>什么都没有发生。</h2>
    <div class="qz">“我没有哭。我一直在等我哭。”手按在胸口数了数：一分钟六十几下，和平时没有区别——像一个医生在给别人做检查。原来是这样。<br>如果那天我给了，她会留下来吗。</div>
    <div class="end"><span>THE END</span><span>维多利亚港 · 06:00 对岸开始亮灯</span></div>
  </div>` },
];

/* ---------------- 数据：时间线 ---------------- */
const SPINE_Y = 1900, SPINE_X0 = 200, SPINE_X1 = 6420;
const EVENTS = [
{ x:400,  side:'up',   date:'2007',      t:'QQ 弹窗 · 校内网', img:'assets/pku.jpg',        ln:['那年我进北大，一年房租一千块。QQ 弹出代言人是她的窗口，我把图存了下来','校内网的好友申请写了四十分钟，最后只发出去一句“你好”','她没有通过——也许她根本没用过校内网'] },
{ x:870,  side:'down', date:'2011',      t:'《战国》· 一亿五千万', img:'assets/jt-warring.jpg', ln:['北京很冷，我买了一件一百五十块的羽绒服，犹豫了三天','同一年，她的一亿五千万《战国》上映，孙红雷、金喜善们被请来陪衬','来都来了，总得发生些什么——但是什么都没有发生'] },
{ x:1340, side:'up',   date:'后来',      t:'《长城》与成龙', img:'assets/jt-changcheng.jpg', ln:['后来是一亿五千万美元的《长城》，再后来是成龙，名单越来越长','我在美国读书、创业，设备换了一台又一台，那张图一直跟着我'] },
{ x:1810, side:'down', date:'相识 · 香港', t:'瑰丽酒店 · 初见', img:'assets/cinema.jpg',   ln:['瑰丽酒店第一面，我以为自己会紧张，没有','卡特兰的香蕉六百二十万，她问：“那它烂了怎么办？”','包下《疯狂动物城 2》整场，二十六个人在门口领了现金。那晚她磨了我十个手指，快一个小时'] },
{ x:2280, side:'up',   date:'相识后 · 三个月', t:'四十几页',      ln:['我让人做了四十几页的东西：项目、股权、景国庆、田心爱','她讲的和上面写的不太一样，我没有说；她一直没讲的，我也没有问','我全部相信她说的。但是我一个字也不信'] },
{ x:2750, side:'down', date:'特纳里费',   t:'大西洋上的岛', img:'assets/teide.jpg',      ln:['她在地图上指了特纳里费，第二天中午，三十个人和一架 A330 出发了','黑胶带贴满整个房间，每天重贴，两个女孩把它做成了一门工艺','泰德公园的日落她说美，“不过不如青海德令哈的”；山顶许愿——“不告诉你”'] },
{ x:3220, side:'up',   date:'马尔代夫',   t:'索尼娃贾尼', img:'assets/soneva.jpg',       ln:['飞马尔代夫的卧室里，她说了那个愿望：要一个孩子，必须代孕','也是在这段航程上，八万块转给了走投无路的财务','到了索尼娃贾尼，三千万彩礼转了过去，田心爱回了两个字：收到'] },
{ x:3690, side:'down', date:'2026.1.2',  t:'求婚',        ln:['新年的第二天，我求婚了','戒指是助理坐水上飞机去马累买回来的，装在一个酒店信封里','“钻戒太小了，以后补个大的。”然后她问：你能来北京吗？我沉默了'] },
{ x:4160, side:'up',   date:'春节',      t:'维港烟花', img:'assets/fireworks.jpg',      ln:['回到香港，她见了我父母。五张卡，轮着往那两个账号转','春节维港放烟花，一百万人涌来又退去，没有她','“今年定好海南过年了。明年吧。”'] },
{ x:4630, side:'down', date:'2 月',      t:'北京 · 抽血',  ln:['“今天早上抽了八管血。”“辛苦了。”','后来才知道那是激素六项、B 超、AMH——天没亮的北京，她大概六点就出了门','我是从助理每月的付款单里知道的。2.25 她落地香港：“除非先看到房子。”'] },
{ x:5100, side:'up',   date:'2.28',      t:'蒙太奇 · 拉古纳海滩', img:'assets/a330.jpg', ln:['房子没看成——半年看了十几套，她都嫌不好看','时间太紧，她还是上了 G700，落在海崖上的那一层','三十天，一百万美元，为了隐私。她住了八天'] },
{ x:5570, side:'down', date:'第八天',    t:'五千万美元', hot:true, ln:['“五千万，美元。”我说：让我想想','Claude 替我说了不，它一点犹豫都没有','十一秒沉默之后：“行。我知道了。”她挂了','之后，没有人再见过她'] },
];

/* ---------------- 数据：边 ---------------- */
const EDGES = [
{ id:'love1',  from:'wo',        to:'jt',        c:C.rose, bend:-150, label:'十九年，从一张糊掉的图开始' },
{ id:'stop',   from:'wo',        to:'jt',        c:C.gold, bend:55,  label:'第八天的电话——线，停在这里', stop:.56 },
{ id:'mom',    from:'jt',        to:'wo',        c:C.rose, bend:180, label:'“以后别叫我景甜了，叫我妈妈吧”' },
{ id:'hello',  from:'xiaonei',   to:'jt',        c:C.rose, bend:150, label:'四十分钟写出的“你好”，未通过', dashed:true },
{ id:'caili',  from:'wo',        to:'accounts',  c:C.gold, bend:30,  label:'彩礼三千万 · 田心爱回了两个字' },
{ id:'allin',  from:'wo',        to:'assistant', c:C.svc,  bend:-30, label:'影厅、胶带、戒指，都归他们办' },
{ id:'ring',   from:'assistant', to:'jt',        c:C.svc,  bend:-110, label:'水上飞机去马累，取回戒指' },
{ id:'extort', from:'finance',   to:'jt',        c:C.gold, bend:-60, label:'想了三天，转了八万' },
{ id:'clean',  from:'cleaner',   to:'montage',   c:C.svc,  bend:-40, label:'“登记上写着有人” · 又做了 22 天' },
{ id:'stay',   from:'jt',        to:'montage',   c:C.rose, bend:80,  label:'住了八天，打了那个电话' },
{ id:'jet',    from:'g700',      to:'montage',   c:C.svc,  bend:30,  label:'机组每天照常报到' },
{ id:'stars',  from:'jt',        to:'stars',     c:C.pale, bend:-90, label:'来都来了，什么都没有发生' },
{ id:'womb',   from:'jt',        to:'surrogate', c:C.gold, bend:40,  label:'一月定好的人 · 定金二十万，不退' },
{ id:'taboo',  from:'athlete',   to:'jt',        c:C.rose, bend:-50, label:'背上的纹身，洗不掉', dashed:true },
{ id:'claude', from:'claude',    to:'wo',        c:C.cyan, bend:60,  label:'它替我说了“不”，没有一点犹豫', terminal:true },
{ id:'nail',   from:'nail',      to:'wo',        c:C.rose, bend:100, label:'十个手指，磨了快一个小时' },
];

/* ---------------- 相机 ---------------- */
const cam = { x:0, y:0, z:1 };
let vw = innerWidth, vh = innerHeight;

const toScreen = (wx, wy) => ({ x: wx * cam.z + cam.x, y: wy * cam.z + cam.y });
function applyCam () {
  world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
  const g = 34;
  gridEl.style.backgroundPosition = `${cam.x * .55}px ${cam.y * .55}px`;
  gridEl.style.opacity = Math.min(.8, Math.max(.12, (cam.z - .1) * 1.4));
  $('#zoom-pct').textContent = Math.round(cam.z * 100) + '%';
}
function zoomAt (px, py, factor) {
  const minz = vw < 760 ? .5 : .12;
  const z2 = Math.min(2.6, Math.max(minz, cam.z * factor));
  cam.x = px - (px - cam.x) * (z2 / cam.z);
  cam.y = py - (py - cam.y) * (z2 / cam.z);
  cam.z = z2; applyCam();
}
function rectCenterZoom (r, pad = 130, cap = 1.5) {
  const floor = vw < 760 ? .5 : .12;          // 窄屏不无限缩小，保证可读
  const z = Math.max(floor, Math.min((vw - pad * 2) / r.w, (vh - pad * 2) / r.h, cap));
  return { x: vw / 2 - (r.x + r.w / 2) * z, y: vh / 2 - (r.y + r.h / 2) * z, z };
}
/* 平滑飞行 */
let flight = null;
function flyTo (rect, dur = 1.5) {
  const t = rectCenterZoom(rect);
  flight = { t0: performance.now(), dur: dur * 1000, a: { ...cam }, b: t };
}
function stepFlight (now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.t0) / flight.dur);
  const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  cam.x = flight.a.x + (flight.b.x - flight.a.x) * e;
  cam.y = flight.a.y + (flight.b.y - flight.a.y) * e;
  cam.z = flight.a.z + (flight.b.z - flight.a.z) * e;
  applyCam();
  if (k >= 1) flight = null;
}

/* ---------------- 构建 DOM ---------------- */
function cardRect (n) {
  const h = n.cls === 'hero' ? 760 : n.cls === 'ledger' ? 900 : n.cls === 'finale' ? 620 :
            n.cls === 'queen' ? 560 : n.cls === 'artifact' ? 340 : n.cls === 'place' ? 300 :
            n.id === 'stars' ? 280 : n.id === 'credits' ? 150 : 200;
  return { x: n.x - n.w / 2, y: n.y - h / 2, w: n.w, h };
}
const RECTS = {};

function buildNodes () {
  for (const n of NODES) {
    const el = document.createElement('div');
    el.className = 'card ' + n.cls;
    el.id = 'nd-' + n.id;
    if (n.ac) el.style.setProperty('--ac', n.ac);
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    el.style.width = n.w + 'px';
    el.innerHTML = n.html;
    nodesEl.appendChild(el);
    RECTS[n.id] = cardRect(n);
    if (n.hub) {
      el.addEventListener('mouseenter', () => focusNode(n.id, true));
      el.addEventListener('mouseleave', () => focusNode(n.id, false));
      el.__tap = () => flyTo(expand(RECTS[n.id], 220), 1.2);
    }
  }
  /* 章节标签 */
  const LBL = [
    [1980, -780, 'Ⅰ · 关系网 · 十九年的人和事'],
    [230, 1360, 'Ⅱ · 时序图 TIMELINE 2007 → 2026'],
    [5850, -360, 'Ⅲ · 账单 THE LEDGER'],
    [7060, 1545, 'Ⅳ · 尾声 EPILOGUE'],
  ];
  for (const [x, y, t] of LBL) {
    const el = document.createElement('div');
    el.className = 'slabel';
    const [num, ...rest] = t.split(' · ');
    el.innerHTML = `<i>${num}</i>${rest.join(' · ')}`;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    nodesEl.appendChild(el);
  }
}

const expand = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + m * 2, h: r.h + m * 2 });

/* ---------------- SVG 边 ---------------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const nodeC = id => { const n = NODES.find(n => n.id === id); return { x: n.x, y: n.y }; };
function bez (a, b, bend) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const c1x = a.x + dx * .3 + nx * bend, c1y = a.y + dy * .3 + ny * bend;
  const c2x = b.x - dx * .3 + nx * bend, c2y = b.y - dy * .3 + ny * bend;
  return `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
}
const edges = {};   // id -> {path, comet, len, color, stopT}
function buildEdges () {
  const defs = document.createElementNS(SVGNS, 'defs');
  defs.innerHTML = `<filter id="fglow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <linearGradient id="spineg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C.gold}" stop-opacity=".9"/>
      <stop offset=".86" stop-color="${C.gold}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${C.gold}" stop-opacity=".12"/>
    </linearGradient>`;
  svg.appendChild(defs);

  for (const e of EDGES) {
    const a = nodeC(e.from), b = nodeC(e.to);
    const d = bez(a, b, e.bend);
    const g = document.createElementNS(SVGNS, 'g');
    g.classList.add('edge'); if (e.dashed) g.classList.add('dashed');
    if (e.stop) g.classList.add('stopped');
    g.dataset.id = e.id;
    const mk = (cls, extra) => {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d); p.setAttribute('class', cls);
      p.setAttribute('stroke', e.c); if (extra) for (const k in extra) p.setAttribute(k, extra[k]);
      g.appendChild(p); return p;
    };
    mk('e-glow');
    let core;
    if (e.stop) {
      core = mk('e-core', { opacity: .3 });
      const solid = mk('e-core');
      edges.solidPending = edges.solidPending || [];
      edges.solidPending.push({ el: solid, e });
    } else core = mk('e-core');
    mk('e-dash', { style: `--dur:${(Math.random() * 2 + 5).toFixed(1)}s` });
    svg.appendChild(g);

    /* 彗星 */
    const comet = document.createElementNS(SVGNS, 'g');
    comet.setAttribute('filter', 'url(#fglow)');
    comet.innerHTML = `<circle r="7" fill="${e.c}" opacity=".22"/><circle r="2.6" fill="#fff" stroke="${e.c}" stroke-width="1.4"/>`;
    svg.appendChild(comet);

    const path = g.querySelector('.e-core');
    const len = path.getTotalLength();
    edges[e.id] = { path, comet, len, color: e.c, stopT: e.stop || 1, solid: e.stop ? true : false, e };

    /* 标签 */
    const lab = document.createElement('div');
    lab.className = 'elabel' + (e.terminal ? ' terminal' : '');
    lab.style.setProperty('--c', e.c);
    lab.textContent = e.label;
    const lp = path.getPointAtLength(len * (e.stop ? .3 : .5));
    lab.style.left = lp.x + 'px'; lab.style.top = (lp.y - (e.bend < 0 ? 26 : -26)) + 'px';
    lab.dataset.edge = e.id;
    nodesEl.appendChild(lab);

    /* 停止标记 ✕ */
    if (e.stop) {
      const sp = path.getPointAtLength(len * e.stop);
      const sx = document.createElementNS(SVGNS, 'g');
      sx.classList.add('stopx');
      sx.setAttribute('transform', `translate(${sp.x},${sp.y})`);
      sx.innerHTML = `<circle r="17" fill="#0a0c14" stroke="${C.gold}" stroke-width="1.6"/>
        <line x1="-6.5" y1="-6.5" x2="6.5" y2="6.5" stroke="${C.gold}" stroke-width="2" stroke-linecap="round"/>
        <line x1="6.5" y1="-6.5" x2="-6.5" y2="6.5" stroke="${C.gold}" stroke-width="2" stroke-linecap="round"/>
        <circle r="26" fill="none" stroke="${C.gold}" stroke-width=".7" opacity=".4"/>`;
      svg.appendChild(sx);
    }
  }
  for (const s of edges.solidPending || []) {
    const rec = edges[s.e.id];
    s.el.setAttribute('stroke-dasharray', `${rec.len * s.e.stop} ${rec.len}`);
  }
}

/* ---------------- 时间线 ---------------- */
function buildTimeline () {
  const g = document.createElementNS(SVGNS, 'g');
  g.classList.add('edge'); g.dataset.id = 'spine';
  const d = `M ${SPINE_X0} ${SPINE_Y} L ${SPINE_X1} ${SPINE_Y}`;
  const mk = (cls, extra) => {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('d', d); p.setAttribute('class', cls);
    if (extra) for (const k in extra) p.setAttribute(k, extra[k]);
    g.appendChild(p); return p;
  };
  mk('e-glow', { stroke: C.gold });
  mk('e-core', { stroke: 'url(#spineg)', 'stroke-width': 2 });
  mk('e-dash', { stroke: C.gold, style: '--dur:9s' });
  svg.appendChild(g);
  const spineComet = document.createElementNS(SVGNS, 'g');
  spineComet.setAttribute('filter', 'url(#fglow)');
  spineComet.innerHTML = `<circle r="10" fill="${C.gold}" opacity=".25"/><circle r="3.6" fill="#fff" stroke="${C.gold}" stroke-width="1.6"/>`;
  svg.appendChild(spineComet);
  edges.spine = { path: g.querySelector('.e-core'), comet: spineComet, len: SPINE_X1 - SPINE_X0, color: C.gold, stopT: 1, e: { from: null, to: null } };

  for (const ev of EVENTS) {
    const stem = document.createElementNS(SVGNS, 'path');
    const y2 = ev.side === 'up' ? SPINE_Y - 96 : SPINE_Y + 96;
    stem.setAttribute('d', `M ${ev.x} ${y2} L ${ev.x} ${SPINE_Y}`);
    stem.setAttribute('stroke', ev.hot ? C.red : 'rgba(143,168,255,.5)');
    stem.setAttribute('stroke-width', '1.2');
    stem.setAttribute('stroke-dasharray', '3 6');
    svg.appendChild(stem);
    const dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('cx', ev.x); dot.setAttribute('cy', SPINE_Y); dot.setAttribute('r', ev.hot ? 6.5 : 4.5);
    dot.setAttribute('class', 'spine-dot');
    if (ev.hot) dot.setAttribute('stroke', C.red);
    svg.appendChild(dot);

    const el = document.createElement('div');
    el.className = 'card event ' + ev.side + (ev.hot ? ' hot' : '');
    el.style.left = ev.x + 'px';
    el.style.top = (ev.side === 'up' ? SPINE_Y - 96 - 165 : SPINE_Y + 96 + 165) + 'px';
    const img = ev.img ? `<div class="ph"><img src="${ev.img}" alt=""></div>` : '';
    el.innerHTML = `${ev.side === 'up' ? img : ''}<span class="date">${ev.date}</span><h4>${ev.t}</h4>${ev.ln.map(l => `<div class="ln">${l}</div>`).join('')}${ev.side === 'down' ? img : ''}`;
    el.__tap = () => flyTo(expand(RECTS['ev' + ev.x], 110), 1);
    nodesEl.appendChild(el);
    RECTS['ev' + ev.x] = { x: ev.x - 200, y: (ev.side === 'up' ? SPINE_Y - 96 - 165 : SPINE_Y + 96 + 165) - 210, w: 400, h: 420 };
  }
  /* 终点帽 */
  const cap = document.createElementNS(SVGNS, 'g');
  cap.classList.add('spine-cap');
  cap.setAttribute('transform', `translate(${SPINE_X1},${SPINE_Y})`);
  cap.innerHTML = `<line x1="0" y1="-26" x2="0" y2="26" stroke="${C.gold}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="0" cy="0" r="9" fill="none" stroke="${C.gold}" stroke-width=".8" opacity=".5"/>`;
  svg.appendChild(cap);
  const capLab = document.createElement('div');
  capLab.className = 'elabel'; capLab.style.setProperty('--c', C.gold);
  capLab.textContent = '时间线，停在二〇二六年三月';
  capLab.style.left = SPINE_X1 + 'px'; capLab.style.top = SPINE_Y - 54 + 'px';
  nodesEl.appendChild(capLab);
}

/* ---------------- 悬停聚焦 ---------------- */
function focusNode (id, on) {
  world.classList.toggle('focus', on);
  nodesEl.classList.toggle('focus', on);
  if (!on) return;
  for (const e of EDGES) {
    if (e.from === id || e.to === id) {
      svg.querySelector(`.edge[data-id="${e.id}"]`).classList.add('on');
      nodesEl.querySelector(`.elabel[data-edge="${e.id}"]`).classList.add('on');
      $('#nd-' + e.from).classList.add('on');
      $('#nd-' + e.to).classList.add('on');
    }
  }
}

/* ---------------- FX 画布：尘埃 + 沿线火花 ---------------- */
let dust = [], sparks = [], lastSpark = 0;
function sizeFx () {
  vw = innerWidth; vh = innerHeight;
  const dpr = Math.min(2, devicePixelRatio || 1);
  fx.width = vw * dpr; fx.height = vh * dpr;
  fx.style.width = vw + 'px'; fx.style.height = vh + 'px';
  fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function seedDust () {
  dust = [];
  for (let i = 0; i < 130; i++) dust.push({
    x: Math.random() * 7600 - 200, y: Math.random() * 3400 - 900,
    r: .6 + Math.random() * 1.5, v: .04 + Math.random() * .12,
    tw: Math.random() * Math.PI * 2, warm: Math.random() < .3,
  });
}
function spawnSpark () {
  const pool = EDGES;
  const e = pool[(Math.random() * pool.length) | 0];
  const rec = edges[e.id]; if (!rec) return;
  const t = .1 + Math.random() * .8;
  const p = rec.path.getPointAtLength(rec.len * t);
  sparks.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * .5, vy: (Math.random() - .5) * .5 - .12, life: 1, decay: .006 + Math.random() * .008, c: e.c, r: 1 + Math.random() * 1.6 });
  if (sparks.length > 70) sparks.shift();
}
function stepFx (now) {
  fctx.clearRect(0, 0, vw, vh);
  fctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    d.y -= d.v * .6; d.tw += .02;
    const s = toScreen(d.x, d.y);
    if (s.x < -10 || s.x > vw + 10 || s.y < -10 || s.y > vh + 10) continue;
    const a = .18 + .16 * Math.sin(d.tw);
    fctx.beginPath();
    fctx.fillStyle = d.warm ? `rgba(255,205,140,${a})` : `rgba(160,185,255,${a})`;
    fctx.arc(s.x, s.y, d.r, 0, 7); fctx.fill();
  }
  if (now - lastSpark > 160) { spawnSpark(); lastSpark = now; }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.x += s.vx; s.y += s.vy; s.life -= s.decay;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    const p = toScreen(s.x, s.y);
    fctx.beginPath();
    fctx.fillStyle = s.c + Math.round(s.life * 150).toString(16).padStart(2, '0');
    fctx.arc(p.x, p.y, s.r * (0.6 + s.life * .6), 0, 7); fctx.fill();
  }
  fctx.globalCompositeOperation = 'source-over';
}

/* ---------------- 主循环 ---------------- */
let comets = [];
function initComets () {
  comets = [];
  for (const e of EDGES) {
    const rec = edges[e.id]; if (!rec) continue;
    comets.push({ rec, t: Math.random() * .9, speed: 90 + Math.random() * 60, dir: 1, dying: 0 });
  }
  comets.push({ rec: edges.spine, t: 0, speed: 560, dir: 1, spine: true });
}
function stepComets (now, dt) {
  for (const c of comets) {
    const { rec } = c;
    const adv = (c.speed * dt) / rec.len;
    c.t += adv;
    if (rec.stopT < 1) {
      if (c.t > rec.stopT - .02) { c.t = 0; }          // 到 ✕ 消失重来
      const p = rec.path.getPointAtLength(rec.len * c.t);
      const fade = Math.max(0, Math.min(1, (rec.stopT - c.t) * 6));
      rec.comet.setAttribute('transform', `translate(${p.x},${p.y})`);
      rec.comet.setAttribute('opacity', fade.toFixed(2));
    } else {
      if (c.t > 1) c.t -= 1;
      const p = rec.path.getPointAtLength(rec.len * c.t);
      rec.comet.setAttribute('transform', `translate(${p.x},${p.y})`);
    }
  }
}

/* ---------------- 交互 ---------------- */
function bindInput () {
  let dragging = false, moved = 0, lx = 0, ly = 0, downCard = null;
  const pts = new Map();
  viewport.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
      downCard = e.target.closest ? e.target.closest('.card') : null;
      viewport.classList.add('grabbing');
    }
    flight = null;
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [p1, p2] = [...pts.values()];
      const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (bindInput.pd) {
        zoomAt(mid.x, mid.y, d / bindInput.pd);
        cam.x += mid.x - bindInput.pm.x; cam.y += mid.y - bindInput.pm.y; applyCam();
      }
      bindInput.pd = d; bindInput.pm = mid;
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    moved += Math.abs(dx) + Math.abs(dy);
    cam.x += dx; cam.y += dy; lx = e.clientX; ly = e.clientY;
    applyCam();
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (pts.size < 2) { bindInput.pd = null; }
    if (pts.size === 0) {
      dragging = false; viewport.classList.remove('grabbing');
      if (moved <= 8 && downCard && downCard.__tap) downCard.__tap();
      downCard = null;
    }
  };
  viewport.addEventListener('pointerup', up);
  viewport.addEventListener('pointercancel', up);
  viewport.addEventListener('wheel', e => {
    e.preventDefault(); flight = null;
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0022));
    else zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * .0016));
  }, { passive: false });
  viewport.addEventListener('dblclick', e => { if (e.target === viewport || e.target.id === 'grid' || e.target.closest('.slabel')) zoomAt(e.clientX, e.clientY, 1.45); });

  document.querySelectorAll('#chips .chip').forEach(b => b.addEventListener('click', () => jump(b.dataset.jump)));
  addEventListener('keydown', e => {
    if (e.key === '0') jump('all');
    if (e.key >= '1' && e.key <= '5') jump(['hero', 'web', 'timeline', 'ledger', 'finale'][e.key - 1]);
    if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.2);
    if (e.key === '-') zoomAt(vw / 2, vh / 2, 1 / 1.2);
  });
}

const REGIONS = {
  hero: () => ({ x: 0, y: -30, w: 1320, h: 1280 }),
  web: () => ({ x: 1640, y: -860, w: 3300, h: 2160 }),
  timeline: () => ({ x: 140, y: 1440, w: 6600, h: 1100 }),
  ledger: () => ({ x: 5370, y: -370, w: 1060, h: 1040 }),
  finale: () => ({ x: 6420, y: 1400, w: 1280, h: 1080 }),
  all: () => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const k in RECTS) { const R = RECTS[k]; x0 = Math.min(x0, R.x); y0 = Math.min(y0, R.y); x1 = Math.max(x1, R.x + R.w); y1 = Math.max(y1, R.y + R.h); }
    return expand({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 90);
  },
};
function jump (k) { const f = REGIONS[k]; if (f) flyTo(f(), k === 'all' ? 1.7 : 1.4); }

/* ---------------- 启动 ---------------- */
function start () {
  sizeFx(); seedDust();
  buildNodes(); buildEdges(); buildTimeline();
  bindInput(); initComets();
  applyCam();
  const q = new URLSearchParams(location.search);
  const j = q.get('jump');
  if (j && REGIONS[j]) { const t = rectCenterZoom(REGIONS[j]()); Object.assign(cam, t); applyCam(); $('#intro').classList.add('gone'); }
  else {
    const t = rectCenterZoom(REGIONS.hero()); Object.assign(cam, t); applyCam();
    $('#btn-enter').addEventListener('click', () => { $('#intro').classList.add('gone'); setTimeout(() => jump('all'), 350); });
  }
  let last = performance.now();
  (function loop (now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    stepFlight(now);
    stepComets(now, dt);
    stepFx(now);
    requestAnimationFrame(loop);
  })(last);
}
start();
