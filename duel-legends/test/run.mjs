import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { CARDS, DECKS } = require('../src/cards.js');
const Logic = require('../src/logic.js');
const AI = require('../src/ai.js');
let passed = 0, serial = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } }
function blank() { const g = Logic.createGame({ seed: 7 }); g.players.forEach(p => { p.hand = []; p.deck = ['spark_kite','spark_kite','spark_kite','spark_kite','spark_kite'].map(id => add(g,id)); p.monsters = [null,null,null]; p.spells = [null,null,null]; p.grave = []; p.lp = 8000; }); g.turn = 0; g.phase = 'main'; g.normalSummoned = false; g.winner = null; return g; }
function add(g, id) { const uid = 'test' + (++serial); g.cards[uid] = { uid, id }; return uid; }
function hand(g, p, id) { const uid = add(g,id); g.players[p].hand.push(uid); return uid; }
function monster(g, p, id, position = 'attack', faceDown = false) { const uid = add(g,id), i = g.players[p].monsters.findIndex(x => !x); g.players[p].monsters[i] = { uid, position, faceDown, attacked:false, buff:0 }; return uid; }
function spell(g, p, id) { const uid = add(g,id), i = g.players[p].spells.findIndex(x => !x); g.players[p].spells[i] = { uid, faceDown:true }; return uid; }
function battle(g) { g.phase = 'battle'; }

test('原创卡池不少于36种且字段完整', () => { assert.ok(Object.keys(CARDS).length >= 36); Object.values(CARDS).forEach(c => { assert.ok(c.id && c.name && c.desc && c.type); if(c.type==='monster') assert.ok(c.atk >= 0 && c.def >= 0 && c.level > 0); }); });
test('三套预设卡组均为20张有效卡牌', () => { assert.equal(DECKS.length,3); DECKS.forEach(d => { assert.equal(d.cards.length,20); d.cards.forEach(id => assert.ok(CARDS[id])); }); });
test('固定种子洗牌完全可复现', () => { const a=Logic.createGame({seed:123}),b=Logic.createGame({seed:123}); const ids=g=>g.players.map(p=>p.deck.map(u=>g.cards[u].id)); assert.deepEqual(ids(a),ids(b)); });
test('开局双方5手卡15卡组且LP8000', () => { const g=Logic.createGame({seed:1}); g.players.forEach(p=>{assert.equal(p.hand.length,5);assert.equal(p.deck.length,15);assert.equal(p.lp,8000);}); });
test('低星怪兽可攻击表示通常召唤', () => { const g=blank(),u=hand(g,0,'copperbell_ram'); assert.ok(Logic.act(g,{type:'summon',player:0,uid:u,position:'attack',tributes:[]}).ok); assert.equal(g.players[0].monsters[0].uid,u);assert.ok(g.normalSummoned); });
test('每回合通常召唤严格限一次且非法操作不改场面', () => { const g=blank(),a=hand(g,0,'copperbell_ram'),b=hand(g,0,'spark_kite'); Logic.act(g,{type:'summon',player:0,uid:a,position:'attack',tributes:[]}); const before=JSON.stringify(g.players); assert.equal(Logic.act(g,{type:'summon',player:0,uid:b,position:'attack',tributes:[]}).ok,false);assert.equal(JSON.stringify(g.players),before); });
test('5到6星需要一只自己场上祭品', () => { const g=blank(),t=monster(g,0,'spark_kite'),u=hand(g,0,'railhorn_rhino'); assert.equal(Logic.act(g,{type:'summon',player:0,uid:u,position:'attack',tributes:[]}).ok,false);assert.ok(Logic.act(g,{type:'summon',player:0,uid:u,position:'attack',tributes:[t]}).ok);assert.ok(g.players[0].grave.includes(t)); });
test('7星以上需要两只不同祭品', () => { const g=blank(),a=monster(g,0,'spark_kite'),b=monster(g,0,'spark_kite'),u=hand(g,0,'sunforge_dragon');assert.equal(Logic.act(g,{type:'summon',player:0,uid:u,position:'attack',tributes:[a,a]}).ok,false);assert.ok(Logic.act(g,{type:'summon',player:0,uid:u,position:'attack',tributes:[a,b]}).ok);assert.equal(g.players[0].grave.length,2); });
test('里侧守备怪兽可反转且不能当回合反复变更', () => { const g=blank(),u=monster(g,0,'stone_guard_ape','defense',true);assert.ok(Logic.act(g,{type:'flip',player:0,uid:u}).ok);assert.equal(g.players[0].monsters[0].position,'attack');assert.equal(Logic.act(g,{type:'changePosition',player:0,uid:u}).ok,false); });
test('直接攻击造成攻击力数值伤害', () => { const g=blank(),u=monster(g,0,'copperbell_ram');battle(g);assert.ok(Logic.act(g,{type:'attack',player:0,uid:u,targetUid:null}).ok);assert.equal(g.players[1].lp,6300); });
test('对方有怪兽时禁止直接攻击', () => { const g=blank(),u=monster(g,0,'copperbell_ram');monster(g,1,'spark_kite');battle(g);assert.equal(Logic.act(g,{type:'attack',player:0,uid:u,targetUid:null}).ok,false); });
test('攻击表示战斗破坏并结算差值', () => { const g=blank(),a=monster(g,0,'copperbell_ram'),d=monster(g,1,'spark_kite');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:d});assert.equal(g.players[1].lp,7100);assert.ok(g.players[1].grave.includes(d)); });
test('攻击守备怪兽无贯穿时不造成LP伤害', () => { const g=blank(),a=monster(g,0,'copperbell_ram'),d=monster(g,1,'mist_scale_carp','defense');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:d});assert.equal(g.players[1].lp,8000);assert.ok(g.players[1].grave.includes(d)); });
test('攻击高守备怪兽时攻击方承受差值', () => { const g=blank(),a=monster(g,0,'spark_kite'),d=monster(g,1,'stone_guard_ape','defense');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:d});assert.equal(g.players[0].lp,7300); });
test('贯穿怪兽攻击守备时造成差值伤害', () => { const g=blank(),a=monster(g,0,'sunforge_dragon'),d=monster(g,1,'mist_scale_carp','defense');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:d});assert.equal(g.players[1].lp,6400);assert.ok(g.players[1].grave.includes(d)); });
test('同攻击力战斗双方破坏', () => { const g=blank(),a=monster(g,0,'copperbell_ram'),d=monster(g,1,'copperbell_ram');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:d});assert.equal(g.players[0].monsters.filter(Boolean).length,0);assert.equal(g.players[1].monsters.filter(Boolean).length,0); });
test('一只怪兽每回合只能攻击一次', () => { const g=blank(),a=monster(g,0,'copperbell_ram');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null});assert.equal(Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null}).ok,false); });
test('伤害魔法扣除LP并进入墓地', () => { const g=blank(),u=hand(g,0,'black_seal_bolt');Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.equal(g.players[1].lp,7200);assert.ok(g.players[0].grave.includes(u)); });
test('治疗魔法恢复LP', () => { const g=blank();g.players[0].lp=5000;const u=hand(g,0,'furnace_refit');Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.equal(g.players[0].lp,6200); });
test('抽卡魔法真实从卡组抽一张', () => { const g=blank(),u=hand(g,0,'spark_relay'),n=g.players[0].deck.length;Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.equal(g.players[0].hand.length,1);assert.equal(g.players[0].deck.length,n-1); });
test('装备魔法强化自己最强怪兽', () => { const g=blank(),m=monster(g,0,'copperbell_ram'),u=hand(g,0,'molten_overdrive');Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.equal(g.players[0].monsters[0].buff,700); });
test('破坏魔法将对方怪兽送墓', () => { const g=blank(),m=monster(g,1,'copperbell_ram'),u=hand(g,0,'forbidden_redaction');Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.ok(g.players[1].grave.includes(m)); });
test('复活魔法把墓地怪兽特殊召回', () => { const g=blank(),m=add(g,'copperbell_ram'),u=hand(g,0,'clear_spring_return');g.players[0].grave.push(m);Logic.act(g,{type:'activateSpell',player:0,uid:u});assert.equal(g.players[0].monsters[0].uid,m);assert.ok(!g.players[0].grave.includes(m)); });
test('攻击无效陷阱消耗并阻止伤害', () => { const g=blank(),a=monster(g,0,'copperbell_ram');spell(g,1,'blank_page_barrier');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null});assert.equal(g.players[1].lp,8000);assert.equal(g.players[1].spells.filter(Boolean).length,0); });
test('破坏攻击怪兽陷阱阻止直接攻击', () => { const g=blank(),a=monster(g,0,'copperbell_ram');spell(g,1,'slag_counter');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null});assert.ok(g.players[0].grave.includes(a));assert.equal(g.players[1].lp,8000); });
test('反照陷阱按攻击力反伤', () => { const g=blank(),a=monster(g,0,'copperbell_ram');spell(g,1,'water_mirror_return');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null});assert.equal(g.players[0].lp,6300);assert.equal(g.players[1].lp,8000); });
test('盖卡占用魔陷格且三格满后拒绝', () => { const g=blank();for(let i=0;i<3;i++){const u=hand(g,0,'blank_page_barrier');assert.ok(Logic.act(g,{type:'setSpell',player:0,uid:u}).ok);}const u=hand(g,0,'blank_page_barrier');assert.equal(Logic.act(g,{type:'setSpell',player:0,uid:u}).ok,false); });
test('陷阱不能从手卡直接发动', () => { const g=blank(),u=hand(g,0,'blank_page_barrier');assert.equal(Logic.act(g,{type:'activateSpell',player:0,uid:u}).ok,false); });
test('结束回合轮转并抽卡重置召唤和攻击状态', () => { const g=blank();battle(g);Logic.act(g,{type:'advance',player:0});assert.equal(g.turn,1);assert.equal(g.phase,'main');assert.equal(g.players[1].hand.length,1);assert.equal(g.normalSummoned,false); });
test('其他玩家的行动被拒绝', () => { const g=blank(),u=hand(g,1,'copperbell_ram');assert.equal(Logic.act(g,{type:'summon',player:1,uid:u,position:'attack',tributes:[]}).ok,false); });
test('LP归零立即决定胜负', () => { const g=blank();g.players[1].lp=700;const a=monster(g,0,'copperbell_ram');battle(g);Logic.act(g,{type:'attack',player:0,uid:a,targetUid:null});assert.equal(g.winner,0);assert.equal(Logic.act(g,{type:'advance',player:0}).ok,false); });
test('卡组抽空立即判负', () => { const g=blank();g.players[1].deck=[];battle(g);Logic.act(g,{type:'advance',player:0});assert.equal(g.winner,0); });
test('认输结束对局', () => { const g=blank();Logic.act(g,{type:'surrender',player:0});assert.equal(g.winner,1); });
test('AI选择始终属于合法动作集合', () => { const g=Logic.createGame({seed:41});for(let i=0;i<100&&g.winner===null;i++){const p=g.turn,a=AI.choose(g,p);assert.ok(a);assert.ok(Logic.legal(g,p).some(x=>JSON.stringify(x)===JSON.stringify(a)));assert.ok(Logic.act(g,a).ok);} });
test('20局AI完整模拟均可结束且不产生非法动作', () => { for(let seed=1;seed<=20;seed++){const g=Logic.createGame({seed});let steps=0;while(g.winner===null&&steps++<3000){const p=g.turn,a=AI.choose(g,p)||{type:'advance',player:p};assert.ok(Logic.act(g,a).ok,'seed '+seed+' '+JSON.stringify(a));}assert.notEqual(g.winner,null,'seed '+seed);assert.ok(steps<3000);} });
console.log(`\n${passed} 项逻辑回归全部通过${process.exitCode ? '（存在失败）' : ''}`);
