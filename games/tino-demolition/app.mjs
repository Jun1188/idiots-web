import {createGame,setAim,trajectory,fire,step,undo,pause,resume,LEVELS,MATERIALS,WORLD,DT,AMMO,selectAmmo,chargePower,dragAngle} from './engine.mjs';
import {loadArt,createRenderer} from './renderer.mjs';
const $=selector=>document.querySelector(selector);
const canvas=$('#stage'),root=$('#game');
let state=createGame(),renderer,preview=null,raf=0,last=0,accumulator=0,drag=null,loaded=false,lastPhase='aim';
let chargeFrame=0,runId=crypto.randomUUID(),resultSent=false,audioContext=null,soundEnabled=false,lastSound=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function effectSound(kind){
 if(!soundEnabled||!audioContext||audioContext.state!=='running')return;
 const now=audioContext.currentTime;if(now-lastSound<.06)return;lastSound=now;
 const osc=audioContext.createOscillator(),gain=audioContext.createGain();
 osc.type=kind==='glass'?'sine':'triangle';const frequency=kind==='launch'?420:kind==='glass'?980:125;
 osc.frequency.setValueAtTime(frequency,now);osc.frequency.exponentialRampToValueAtTime(frequency*.35,now+.12);
 gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.045,now+.005);gain.gain.exponentialRampToValueAtTime(.0001,now+.14);
 osc.connect(gain);gain.connect(audioContext.destination);osc.start(now);osc.stop(now+.15);osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
$('#sound-enabled').addEventListener('change',async event=>{
 soundEnabled=event.target.checked;if(!soundEnabled)return;
 try{const Context=window.AudioContext||window.webkitAudioContext;if(!Context)throw new Error('unsupported');audioContext ||= new Context();await audioContext.resume();effectSound('launch');}
 catch(_){soundEnabled=false;event.target.checked=false;announce('이 브라우저에서 효과음을 사용할 수 없어요.');}
});
function announce(text){$('#announcement').textContent=text;}
function targetText(){
  if(!preview?.impact)return '궤적을 조절해 보세요';
  const hit=preview.impact;
  if(hit.type==='block'){
    const b=state.blocks.find(b=>b.id===hit.id);
    return `첫 충돌: ${MATERIALS[b.kind].label}${b.hp<b.maxHp?' · 손상됨':''}`;
  }
  return hit.type==='barrier'?'가림막에 막혀요. 각도를 높여보세요.':hit.type==='ground'?'바닥에 닿아요. 세기·각도를 조절하세요.':'화면 밖으로 벗어나요.';
}
function refresh(){
  const definition=LEVELS[state.level];
  const alive=state.blocks.filter(b=>b.hp>0).length;
  canvas.dataset.remainingBlocks=String(alive);
  canvas.dataset.totalBlocks=String(state.blocks.length);
  canvas.dataset.remainingHp=String(Math.round(state.blocks.reduce((sum,b)=>sum+Math.max(0,b.hp),0)));
  canvas.dataset.angle=String(state.angle);canvas.dataset.power=String(state.power);
  $('#level-name').textContent=definition.name;
  $('#ammo').textContent=`남은 발 ${state.shotsLeft} / ${definition.shots}`;
  $('#damage').textContent=`철거 ${Math.round((1-alive/state.blocks.length)*100)}%`;
  $('#remaining').textContent=`목표 ${alive}개`;
  $('#charge').value=state.power;
  $('#angle-value').textContent=`${state.angle}°`;$('#power-value').textContent=`${state.power}%`;
  const aiming=loaded&&state.phase==='aim';
  $('#aim-handle').disabled=!aiming;$('#aim-handle').hidden=!aiming;
  document.querySelectorAll('[name=ammo-type]').forEach(input=>{input.disabled=!aiming||Boolean(drag);input.checked=input.value===state.ammoType;});
  $('#undo').disabled=!loaded||!state.lastShot||state.phase==='paused';
  $('#reset').disabled=!loaded;
  $('#pause').disabled=!loaded||['won','lost'].includes(state.phase);
  $('#pause').textContent=state.phase==='paused'?'계속하기':'일시정지';
  $('#target').textContent=state.phase==='aim'?targetText():state.phase==='flight'?'티노 비행 중':state.phase==='settling'?'지지부가 무너지는 중':state.phase==='paused'?'일시정지 · 조준과 비행이 멈췄어요.':state.phase==='won'?'구역 철거 완료':'남은 발을 모두 사용했어요.';
  $('#brief').textContent=definition.brief;
  const feedback=state.shotDestroyed?`${state.shotDestroyed}개 ${state.shotDestroyed>1?'연쇄 파괴':'파괴'}`:'';
  if($('#shot-feedback').textContent!==feedback)$('#shot-feedback').textContent=feedback;
  const finished=['won','lost'].includes(state.phase);
  $('#result').hidden=!finished;
  if(finished){
    if(!resultSent){
      resultSent=true;
      const score=state.blocks.filter(b=>b.hp<=0).length*100+(state.phase==='won'?500+state.stars*100:0);
      const detail={game:'angry-tino',score,runId};
      window.dispatchEvent(new CustomEvent('idiots:game-result',{detail}));
      if(window.parent!==window)window.parent.postMessage({type:'idiots:game-result',...detail},location.origin);
    }
    const won=state.phase==='won';
    $('#result-title').textContent=won?'구역 철거 완료':'한 번 더 조준해 볼까요?';
    $('#result-description').textContent=won?`${state.used}발로 완료 · 별 ${state.stars}개 / 3개. ${state.undoCount?'되돌리기를 활용했어요.':'한 발 한 발 정확했어요.'}`:'되돌리면 마지막 조준값 그대로 다시 해볼 수 있어요. 지지부를 맞히면 위 모형도 함께 무너집니다.';
    $('#next').textContent=won?(state.level<LEVELS.length-1?'다음 구역 →':'처음부터 다시'):'이 구역 다시';
  }
}
function camera(reset=false){
 const wrap=$('.stage-wrap'),r=canvas.getBoundingClientRect();
 const scale=r.width/WORLD.width;
 const maximum=Math.max(0,wrap.scrollWidth-wrap.clientWidth);
 if(reset)wrap.scrollLeft=0;
 else if(state.phase==='flight'&&state.projectile){
  const target=Math.max(0,Math.min(maximum,state.projectile.x*scale-wrap.clientWidth*.4));
  wrap.scrollLeft=reduced?target:wrap.scrollLeft+(target-wrap.scrollLeft)*.14;
 }
 canvas.dataset.cameraX=String(wrap.scrollLeft/scale);
 canvas.dataset.viewportWorldWidth=String(wrap.clientWidth/scale);
 canvas.dataset.phase=state.phase;
 canvas.dataset.worldWidth=String(WORLD.width);
 canvas.dataset.shooterX=String(WORLD.origin.x);
 canvas.dataset.shooterY=String(WORLD.origin.y);
 canvas.dataset.projectileX=state.projectile?String(state.projectile.x):'';
 canvas.dataset.projectileY=state.projectile?String(state.projectile.y):'';
}
function paint(){if(renderer)renderer.render(state,preview,Boolean(drag));camera();}
function aim(){preview=trajectory(state);refresh();paint();}
function stopLoop(){cancelAnimationFrame(raf);raf=0;last=0;accumulator=0;}
function loop(now){
  raf=0;if(!['flight','settling'].includes(state.phase))return;
  const delta=last?Math.min((now-last)/1000,.08):0;last=now;accumulator+=delta;
  while(accumulator>=DT&&['flight','settling'].includes(state.phase)){step(state);accumulator-=DT;}
  paint();refresh();
  if(state.phase!==lastPhase){
    if(state.phase==='settling'){effectSound(state.ammoType==='glass'?'glass':'impact');}
    if(state.phase==='settling')announce(state.lastImpact.type==='block'?`명중! 남은 목표 ${state.blocks.filter(b=>b.hp>0).length}개.`:'빗나갔어요. 다음 발은 궤적의 끝을 확인하세요.');
    if(state.phase==='won')announce(`${LEVELS[state.level].name} 완료. ${state.used}발, 별 ${state.stars}개.`);
    if(state.phase==='lost')announce('남은 발을 모두 사용했습니다. 되돌리거나 다시 시작할 수 있어요.');
    lastPhase=state.phase;
  }
  if(['flight','settling'].includes(state.phase))raf=requestAnimationFrame(loop);
  else{stopLoop();if(state.phase==='aim'){camera(true);aim();}else $('#next').focus({preventScroll:true});}
}
function launch(){cancelAnimationFrame(chargeFrame);chargeFrame=0;if(!loaded||!fire(state))return;drag=null;canvas.classList.remove('aiming');preview=null;lastPhase='flight';refresh();effectSound('launch');announce('발사!');raf=requestAnimationFrame(loop);}
function reset(level=state.level){cancelCharge();stopLoop();runId=crypto.randomUUID();resultSent=false;state=createGame(level);lastPhase='aim';drag=null;canvas.classList.remove('aiming');camera(true);aim();}
function togglePause(force=false){
  if(!loaded)return;
  cancelCharge();
  if(state.phase==='paused'&&!force){resume(state);lastPhase=state.phase;if(['flight','settling'].includes(state.phase))raf=requestAnimationFrame(loop);refresh();paint();return;}
  if(pause(state)){stopLoop();drag=null;canvas.classList.remove('aiming');refresh();paint();announce('일시정지했습니다. 계속하기를 누르면 이어집니다.');}
}
document.querySelectorAll('[name=ammo-type]').forEach(input=>input.addEventListener('change',()=>{if(selectAmmo(state,input.value))aim();}));
$('#undo').addEventListener('click',()=>{if(undo(state)){cancelCharge();stopLoop();lastPhase='aim';camera(true);aim();announce('마지막 한 발을 되돌렸습니다.');}});
$('#reset').addEventListener('click',()=>reset());
$('#next').addEventListener('click',()=>{reset(state.phase==='won'?(state.level+1)%LEVELS.length:state.level);$('#aim-handle').focus({preventScroll:true});});
$('#pause').addEventListener('click',()=>togglePause());
$('#overview').addEventListener('click',()=>{cancelCharge();const enabled=$('.stage-wrap').classList.toggle('overview');$('#overview').setAttribute('aria-pressed',String(enabled));$('#overview').textContent=enabled?'가까이 보기':'맵 전체 보기';camera(true);aim();});
$('#fullscreen').addEventListener('click',async()=>{cancelCharge();try{if(document.fullscreenElement)await document.exitFullscreen();else{await root.requestFullscreen();root.focus({preventScroll:true});}}catch(_){announce('이 브라우저에서는 전체 화면을 지원하지 않아요. 가로로 돌리면 넓게 볼 수 있어요.');}});
$('.stage-wrap').addEventListener('scroll',()=>{canvas.dataset.cameraX=String($('.stage-wrap').scrollLeft/(canvas.getBoundingClientRect().width/WORLD.width));},{passive:true});
const coordinates=event=>{const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)/r.width*WORLD.width,y:(event.clientY-r.top)/r.height*WORLD.height};};
function tickCharge(now){
  if(!drag||state.phase!=='aim')return;
  setAim(state,state.angle,chargePower(now-drag.started));aim();
  chargeFrame=requestAnimationFrame(tickCharge);
}
function beginCharge(id){
  if(drag||state.phase!=='aim'||!loaded)return false;
  drag={id,angle:state.angle,power:state.power,started:performance.now()};
  canvas.classList.add('aiming');tickCharge(performance.now());return true;
}
function cancelCharge(){
  cancelAnimationFrame(chargeFrame);chargeFrame=0;
  if(!drag)return;
  const previous=drag;drag=null;canvas.classList.remove('aiming');
  setAim(state,previous.angle,previous.power);
  if(typeof previous.id==='number'&&canvas.hasPointerCapture(previous.id))canvas.releasePointerCapture(previous.id);
}
$('.stage-wrap').addEventListener('pointerdown',event=>{
  if(event.button!==0)return;
  const p=coordinates(event);if(Math.hypot(p.x-WORLD.origin.x,p.y-WORLD.origin.y)>100)return;
  if(beginCharge(event.pointerId)){root.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);event.preventDefault();}
});
$('.stage-wrap').addEventListener('pointermove',event=>{
  if(!drag||event.pointerId!==drag.id)return;
  const p=coordinates(event);setAim(state,dragAngle(p.x,p.y,state.angle),state.power);aim();
});
function finishDrag(event,cancelled=false){
  if(!drag||event.pointerId!==drag.id)return;
  if(cancelled){cancelCharge();aim();return;}
  const id=drag.id;const p=coordinates(event);setAim(state,dragAngle(p.x,p.y,state.angle),chargePower(performance.now()-drag.started));
  drag=null;cancelAnimationFrame(chargeFrame);chargeFrame=0;canvas.classList.remove('aiming');
  if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  launch();
}
$('.stage-wrap').addEventListener('pointerup',event=>finishDrag(event));
$('.stage-wrap').addEventListener('pointercancel',event=>finishDrag(event,true));
canvas.addEventListener('lostpointercapture',event=>finishDrag(event,true));
window.addEventListener('resize',()=>{cancelCharge();if(loaded)aim();});
// Pointer charging is cancellable even if focus was outside the game when the drag began.
// Clear drag before releasing capture so pointerup/lostcapture cannot launch afterwards.
window.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancelCharge();aim();}
},true);
function closeHelp(){$('#help').hidden=true;$('#help-button').setAttribute('aria-expanded','false');$('#help-button').focus();}
$('#help-button').addEventListener('click',()=>{if(!$('#help').hidden){closeHelp();return;}togglePause(true);$('#help').hidden=false;$('#help-button').setAttribute('aria-expanded','true');$('#close-help').focus();});
$('#close-help').addEventListener('click',closeHelp);
root.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const key=event.key.toLowerCase();
  if(key==='escape'){event.preventDefault();if(drag){cancelCharge();aim();}else if(!$('#help').hidden)closeHelp();else togglePause(true);return;}
  const onAim=event.target===canvas||event.target===$('#aim-handle')||event.target===root;
  if(!onAim)return;
  if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();setAim(state,state.angle+(['arrowup','arrowleft'].includes(key)?1:-1),state.power);aim();}
  if(key===' '){event.preventDefault();if(!event.repeat)beginCharge('keyboard');}
  if(!event.repeat&&key==='p')togglePause();
  if(!event.repeat&&key==='u')$('#undo').click();
});
root.addEventListener('keyup',event=>{
  if(event.key===' '&&drag?.id==='keyboard'){
    event.preventDefault();setAim(state,state.angle,chargePower(performance.now()-drag.started));drag=null;launch();
  }
});
root.addEventListener('focusout',event=>{if(event.target===$('#aim-handle')&&drag?.id==='keyboard'){cancelCharge();aim();}});
window.addEventListener('blur',()=>togglePause(true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)togglePause(true);});
window.addEventListener('pagehide',()=>togglePause(true));
try{const art=await loadArt();renderer=createRenderer(canvas,art,reduced);$('#badge').src=renderer.badgeUrl();document.querySelectorAll('[data-ammo-art]').forEach(img=>img.src=renderer.spriteUrl(img.dataset.ammoArt));loaded=true;$('#loading').hidden=true;aim();}
catch(error){$('#loading').textContent='그림을 불러오지 못했어요. 연결을 확인하고 새로고침해 주세요.';console.error('Angry Tino art load failed',error);}
