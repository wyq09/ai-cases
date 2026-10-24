# Duel Legends 模块契约

原创游戏王风格单机 H5。零外部资源。玩家下标 0，AI 下标 1。20 张卡组、LP 8000、起手 5 张；每回合一次通常召唤；4 星以下免祭品、5–6 星 1 祭品、7+ 星 2 祭品；3 怪兽格与 3 魔陷格。主阶段发动魔法/盖卡，战斗阶段攻击；盖放陷阱在对方攻击时自动依设置顺序触发。无额外卡组与玩家手动连锁。

## 文件与接口
- `cards.js` → `window.DuelCards` / CommonJS。`CARDS` 为 id→定义 map，`DECKS` 为 `[{id,name,desc,cards:[id...20]}]`。卡定义 `{id,name,type:'monster'|'spell'|'trap',level,atk,def,attribute,race,icon,desc,effect?}`。effect 仅允许 `{kind, value?, target?}`；kind 用 `draw,heal,damage,destroyMonster,buffAll,equip,destroySpell,revive,weaken,negateAttack,destroyAttacker,mirrorDamage`。
- `logic.js` → `window.DuelLogic` / CommonJS。`createGame({deck0,deck1,seed})` 返回 game；`act(game, action)` 返回 `{ok,error?,events?}`，非法不修改状态。action：`{type:'summon',player,uid,position:'attack'|'defense',faceDown?,tributes:[uid]}`、`setSpell`、`activateSpell`、`attack`（`uid,targetUid` 可空）、`flip`、`changePosition`、`advance`（main→battle→end→下一玩家 main）、`surrender`。`legal(game,player)` 返回建议动作数组；`getCard(uid)` 可在 game.cards 查实例。
- game：`{players:[{lp,deck:[uid],hand:[uid],monsters:[slot|null ×3],spells:[slot|null ×3],grave:[uid]}],cards:{uid:{uid,id}},turn,round,phase:'main'|'battle',normalSummoned,winner,log,events}`；monster slot `{uid,position,faceDown,attacked,buff}`，spell slot `{uid,faceDown}`。`act` 每次清空并填 `game.events`，事件含 `{type:'draw'|'summon'|'spell'|'trap'|'attack'|'damage'|'destroy'|'phase'|'win',...}`。
- `ai.js` → `window.DuelAI.choose(game,player)` 返回一个合法 action 或 null。只调用逻辑接口，不改状态。
- `art.js` → `window.DuelArt.card(card)` 返回卡图 SVG data URI；`avatar(who)` 返回角色 SVG data URI。
- `audio.js` → `window.DuelAudio.unlock()`、`play(name)`、`toggle()`、`muted`。
- `fx.js` → `window.DuelFx.burst(kind,element?)`、`text(message,element?)`、`shake()`，均可安全空调用。
- `game.js` 主线独占，连接 UI 和引擎。`window.__duel={state(),act(action),newGame(deckId,seed),legal()}` 为测试钩子。

## DOM
主界面 `#duelScreen`、`#homeScreen`、`#collectionScreen`；`#opponentField`、`#playerField`、`#hand`、`#phaseBtn`、`#turnLabel`、`#lp0`、`#lp1`、`#log`、`#cardModal`、`#resultModal`、`#collectionGrid`、`#deckChoices`、`#soundBtn`、`#menuBtn`。

存档：`duel-legends.profile.v1`（卡组、胜负、静音），配置与对局不持久化；固定种子可经 `?seed=` 注入。

主线负责 logic/ai/shell/style/game/build/test/索引；子代理仅写被分配文件，勿改他人模块。
