const task=await taskSpace('duel-legends-ui');const page=task.page('p1');
await page.goto('file:///Users/yiqunwu/wuyiqun/power_project/ai-x/ai_coding/ai-cases/duel-legends/index.html?seed=8&fast=1');await page.waitForTimeout(250);
const boot=await page.evaluate(()=>({hook:!!window.__duel,decks:document.querySelectorAll('.deck-choice').length,errors:__errs,external:performance.getEntriesByType('resource').filter(x=>/^https?:/.test(x.name)).map(x=>x.name)}));
console.log('PASS 单文件 file:// 离线启动',boot.hook&&boot.decks===3&&!boot.errors.length,boot);
await page.click('#startBtn');await page.waitForTimeout(150);
console.log('PASS 离线对局可开始',await page.evaluate(()=>__duel.state().players[0].hand.length===5&&document.querySelector('#duelScreen').classList.contains('active')));
console.log('PASS 离线零网络资源与JS错误',await page.evaluate(()=>__errs.length===0&&performance.getEntriesByType('resource').every(x=>!/^https?:/.test(x.name))));
if(boot.errors.length||boot.external.length)process.exit(1);
