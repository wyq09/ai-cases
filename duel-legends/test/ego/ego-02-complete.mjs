const task=await taskSpace('duel-legends-ui');const page=task.page('p1');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await page.goto('http://127.0.0.1:8794/index.html?seed=19&fast=1');await page.waitForTimeout(250);
await page.click('#startBtn');
let steps=0;
while(steps++<400){
  const status=await page.evaluate(()=>({winner:__duel.state().winner,turn:__duel.state().turn}));
  if(status.winner!==null) break;
  if(status.turn===1){await page.waitForTimeout(80);continue;}
  const action=await page.evaluate(()=>DuelAI.choose(__duel.state(),0));
  if(!action||action.type==='advance') await page.click('#phaseBtn');
  else{
    await page.click('.game-card[data-uid="'+action.uid+'"]');
    const index=await page.evaluate(a=>__duel.legal().filter(x=>x.uid===a.uid).findIndex(x=>JSON.stringify(x)===JSON.stringify(a)),action);
    if(index<0) throw new Error('UI action not found '+JSON.stringify(action));
    await page.click('#detailActions .action-choice >> nth='+index);
  }
  await page.waitForTimeout(25);
}
await page.waitForFunction(()=>!document.querySelector('#resultModal').hidden,undefined,{timeout:3000});
const result=await page.evaluate(()=>({winner:__duel.state().winner,round:__duel.state().round,visible:!document.querySelector('#resultModal').hidden,title:document.querySelector('#resultTitle').textContent,errors:__errs}));
console.log(result);
if(result.winner===null||!result.visible||result.errors.length) process.exit(1);
console.log('PASS 手机端通过真实卡牌点击与阶段按钮完成整局');
await page.click('#rematchBtn');await page.waitForTimeout(150);
console.log('PASS 结算后真实点击再来一局',await page.evaluate(()=>__duel.state().winner===null&&__duel.state().round===1&&document.querySelectorAll('#hand .game-card').length===5));
await page.click('#menuBtn');await page.click('#menuSound');
console.log('PASS 对局菜单声音开关',await page.evaluate(()=>DuelAudio.muted===true));
await page.click('#menuSound');await page.click('#menuRules');
console.log('PASS 对局内规则入口',await page.evaluate(()=>!document.querySelector('#rulesModal').hidden));
await page.click('#rulesModal .wide');
await page.click('#logBtn');
console.log('PASS 战斗记录可打开',await page.evaluate(()=>!document.querySelector('#logModal').hidden&&document.querySelector('#log').textContent.includes('决斗开始')));
console.log('PASS 完整对局浏览器零错误',await page.evaluate(()=>__errs.length===0),await page.evaluate(()=>__errs));
