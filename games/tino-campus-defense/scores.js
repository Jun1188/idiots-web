/* Device-only scores: no names, identities, telemetry, server or shared ranking. */
(function(root){
'use strict';
const KEY='idiots-game-scores-v1';
const GAMES={'tino-run':'Tino Run','angry-tino':'앵그리티노','campus-line':'캠퍼스 라인'};
function clean(value){
 const out={}; for(const key of Object.keys(GAMES)){
  const item=value?.[key]||{};
  out[key]={total:Number.isSafeInteger(item.total)&&item.total>=0?item.total:0,runs:Number.isSafeInteger(item.runs)&&item.runs>=0?item.runs:0,
   best:Array.isArray(item.best)?item.best.filter(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000).sort((a,b)=>b-a).slice(0,5):[],seen:Array.isArray(item.seen)?item.seen.filter(x=>typeof x==='string'&&x.length<160).slice(-100):[]};
 } return out;
}
function record(state,event){
 if(!event||!Object.hasOwn(GAMES,event.game)||!Number.isSafeInteger(event.score)||event.score<0||event.score>10000000||typeof event.runId!=='string'||!event.runId||event.runId.length>=160)return false;
 const item=state[event.game]; if(item.seen.includes(event.runId))return false;
 item.total=Math.min(Number.MAX_SAFE_INTEGER,item.total+event.score);item.runs++;item.best=[...item.best,event.score].sort((a,b)=>b-a).slice(0,5);item.seen=[...item.seen,event.runId].slice(-100);return true;
}
function mount(win){
 const doc=win.document;if(doc.getElementById('game-scoreboard'))return;
 let state;try{state=clean(JSON.parse(win.localStorage.getItem(KEY)||'{}'));}catch(_){state=clean({});}
 const box=doc.createElement('details');box.id='game-scoreboard';box.className='game-scoreboard' + (doc.getElementById('start-screen') ? '' : ' game-scoreboard--standalone');
 const summary=doc.createElement('summary');summary.textContent='이 기기의 게임 기록';box.appendChild(summary);
 const note=doc.createElement('p');note.textContent='이 브라우저의 누적 점수·상위 5회 기록입니다. 다른 이용자와 공유되지 않습니다.';box.appendChild(note);
 const body=doc.createElement('div');box.appendChild(body);
 const clear=doc.createElement('button');clear.type='button';clear.textContent='이 기기 기록 지우기';box.appendChild(clear);
 const host=doc.getElementById('start-game-menu')||doc.querySelector('.start-games')||doc.getElementById('start-menu')||doc.querySelector('main')||doc.body;host.appendChild(box);
 function draw(){body.replaceChildren();for(const [key,label] of Object.entries(GAMES)){const row=doc.createElement('section'),heading=doc.createElement('h4'),list=doc.createElement('ol');const item=state[key];heading.textContent=label+' · 누적 '+item.total.toLocaleString()+'점 / '+item.runs+'회';row.appendChild(heading);if(!item.best.length){const p=doc.createElement('p');p.textContent='아직 완료한 게임이 없어요.';row.appendChild(p);}else{for(const score of item.best){const li=doc.createElement('li');li.textContent=score.toLocaleString()+'점';list.appendChild(li);}row.appendChild(list);}body.appendChild(row);}}
 win.addEventListener('pageshow',()=>{try{state=clean(JSON.parse(win.localStorage.getItem(KEY)||'{}'));draw();}catch(_){}});
 win.addEventListener('storage',e=>{if(e.key!==KEY)return;try{state=clean(JSON.parse(e.newValue||'{}'));draw();}catch(_){}});
 function receive(event){if(!record(state,event))return;try{win.localStorage.setItem(KEY,JSON.stringify(state));}catch(_){note.textContent='저장이 허용되지 않아 현재 탭에서만 기록합니다. 다른 이용자와 공유되지 않습니다.';}draw();}
 win.addEventListener('idiots:game-result',e=>receive(e.detail));
 win.addEventListener('message',e=>{if(e.origin!==win.location.origin||e.data?.type!=='idiots:game-result')return;const allowed=Array.from(doc.querySelectorAll('iframe')).some(frame=>frame.contentWindow===e.source);if(allowed)receive(e.data);});
 clear.addEventListener('click',()=>{if(!win.confirm('이 브라우저에 저장한 게임 기록을 지울까요?'))return;state=clean({});try{win.localStorage.removeItem(KEY);}catch(_){}draw();});draw();
}
if(typeof module==='object'&&module.exports)module.exports={clean,record,GAMES};else if(root?.document){if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>mount(root),{once:true});else mount(root);}
})(typeof window!=='undefined'?window:null);
