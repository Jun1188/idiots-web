/** Original deterministic projectile puzzle. Preview and play share this collision path. */
export const WORLD = { width: 1600, height: 720, ground: 640, gravity: 380, radius: 24, origin: { x: 140, y: 550 } };
export const AMMO = {
  impact: {label:'돌격 티노',sprite:'fly',damage:1,radius:60,description:'한 곳에 강한 충격'},
  echo: {label:'파동 티노',sprite:'celebrate',damage:.85,radius:130,description:'주변 모형까지 넓은 충격'},
  glass: {label:'연구 티노',sprite:'aim',damage:1,radius:72,description:'유리에는 두 배의 충격'},
};
export const chargePower = elapsed => Math.round(20 + 80 * Math.min(1,Math.max(0,elapsed)/1800));
/** Pull behind/down like a slingshot; forward/up aiming remains available for touch. */
export function dragAngle(x,y,fallback=45){
 const dx=x-WORLD.origin.x,dy=y-WORLD.origin.y;
 if(Math.hypot(dx,dy)<12)return fallback;
 const upward=dx<0?dy:-dy;
 return Math.max(12,Math.min(80,Math.atan2(upward,Math.max(5,Math.abs(dx)))*180/Math.PI));
}
export function selectAmmo(s,key){if(s.phase!=='aim'||!AMMO[key])return false;s.ammoType=key;return true;}
export const DT = 1 / 120;
export const MATERIALS = {
  brick: { hp: 145, label: '벽돌 외벽' },
  glass: { hp: 95, label: '유리 외벽' },
  pillar: { hp: 170, label: '건물 지지부' },
  roof: { hp: 85, label: '지붕' },
};
const block = (id, kind, x, y, w, h, supports = []) => ({ id, kind, x, y, w, h, supports, hp: MATERIALS[kind].hp, maxHp: MATERIALS[kind].hp });
// Campus motifs: long brick teaching wings, a low sports hall and stepped TIP towers.
// Uniformly scaled bays retain their window/slab proportions; roofs can span a gym.
function campus(id,x,bays,floors,kind='brick',scale=1,theme='engineering'){
 const out=[],pitch=112*scale,bayHeight=98*scale,baseY=WORLD.ground-bayHeight;
 for(let col=0;col<bays;col++){
  const foot=id+'p'+col,stories=Array.isArray(floors)?floors[col]:floors;
  const decor={building:id,theme,scale};
  out.push({...block(foot,'pillar',x+col*pitch,baseY,pitch,bayHeight),...decor,skin:theme==='sports'?'sports':col===Math.floor(bays/2)?'pillar':'glass'});
  let support=foot;
  for(let floor=0;floor<stories;floor++){
   const key=id+'f'+floor+'b'+col;
   out.push({...block(key,kind,x+col*pitch,baseY-(floor+1)*bayHeight,pitch,bayHeight,[support]),...decor,skin:theme==='research'?'research':theme==='tip'?'tip':kind});support=key;
  }
  if(theme!=='sports')out.push({...block(id+'r'+col,'roof',x+col*pitch,baseY-stories*bayHeight-45.5*scale,pitch,45.5*scale,[support]),...decor,skin:theme==='tip'?'crown':'roof'});
 }
 if(theme==='sports')out.push({...block(id+'r','roof',x,baseY-70*scale,pitch*bays,70*scale,out.map(b=>b.id)),building:id,theme,scale,skin:'sportsroof'});
 return out;
}
function scoreMobs(blocks){
 const roofs=blocks.filter(b=>b.kind==='roof'),groups=[...new Set(roofs.map(b=>b.building))];
 return groups.flatMap((group,i)=>{
  const roof=roofs.filter(b=>b.building===group).sort((a,b)=>a.y-b.y||a.x-b.x)[0];
  const kind=i%2?'professor':'exam',w=kind==='professor'?44:34,h=kind==='professor'?58:44;
  return [{id:group+'-bonus',kind,x:roof.x+(roof.w-w)/2,y:roof.y-h,w,h,support:roof.id,value:kind==='professor'?300:150,collected:false,falling:false,vy:0}];
 });
}
export const LEVELS = [
 {name:'01 · 공학관 앞마당',brief:'낮고 긴 공학관과 높은 연구관 사이로 조준하세요. 옥상의 F 시험지와 가상 교수님 몹은 추가 점수입니다.',shots:20,par:15,angle:35,power:65,
  blocks:[...campus('a',610,3,1,'brick',.8),...campus('b',1150,2,[1,2],'glass',.95,'research')],barriers:[]},
 {name:'02 · 체육관과 TIP',brief:'낮은 아치 지붕의 체육관 너머 TIP 타워를 공략하세요. 높은 층은 파괴 순서에 따라 점수 몹이 떨어집니다.',shots:20,par:16,angle:48,power:70,
  blocks:[...campus('c',650,2,0,'brick',1.15,'sports'),...campus('d',1170,2,[2,3],'glass',1,'tip')],barriers:[]},
 {name:'03 · 캠퍼스 스카이라인',brief:'작은 강의동·유리 연구동·높은 TIP 모형이 서로 떨어져 있습니다. 가까운 곳은 낮고 짧게, 먼 타워는 높게 쏘세요.',shots:28,par:23,angle:35,power:65,
  blocks:[...campus('e',550,3,1,'brick',.7),...campus('f',960,2,1,'glass',.85,'research'),...campus('g',1335,2,[2,3],'glass',.85,'tip')],barriers:[]},
];
export function createGame(level = 0) {
  const definition = LEVELS[level];
  if (!definition) throw new RangeError('Unknown level');
  return { level, ammoType:'impact', phase:'aim', resumePhase:null, angle:definition.angle, power:definition.power, shotsLeft:definition.shots, used:0, time:0,
    blocks:structuredClone(definition.blocks), barriers:structuredClone(definition.barriers), targets:scoreMobs(definition.blocks), bonusScore:0, projectile:null, rubble:[], events:[], lastImpact:null,
    lastShot:null, undoCount:0, settle:0, stars:0, hitStop:0, shotDestroyed:0, eventId:0 };
}
export const speedFor = power => 300 + power * 6.4;
export function setAim(s, angle, power) {
  if (s.phase !== 'aim') return false;
  s.angle = Math.round(Math.max(12,Math.min(80,angle)));
  s.power = Math.round(Math.max(20,Math.min(100,power)));
  return true;
}
function projectileFor(s) {
  const angle = s.angle * Math.PI / 180, speed = speedFor(s.power);
  return { ammoType:s.ammoType, x:WORLD.origin.x, y:WORLD.origin.y, vx:Math.cos(angle)*speed, vy:-Math.sin(angle)*speed, age:0 };
}
/** Entry time into expanded axis-aligned collider, including corner checks. */
export function segmentHit(a, b, rect, radius = WORLD.radius) {
  // Rounded-rectangle sweep: planes plus actual circular corners, not a square approximation.
  const dx=b.x-a.x, dy=b.y-a.y;
  const candidates=[];
  const add=(t,x,y)=>{if(t>=0&&t<=1)candidates.push({t,x,y});};
  if(dx!==0)for(const x of [rect.x-radius,rect.x+rect.w+radius]){
    const t=(x-a.x)/dx,y=a.y+t*dy;if(y>=rect.y&&y<=rect.y+rect.h)add(t,x,y);
  }
  if(dy!==0)for(const y of [rect.y-radius,rect.y+rect.h+radius]){
    const t=(y-a.y)/dy,x=a.x+t*dx;if(x>=rect.x&&x<=rect.x+rect.w)add(t,x,y);
  }
  const A=dx*dx+dy*dy;
  if(A>0)for(const cx of [rect.x,rect.x+rect.w])for(const cy of [rect.y,rect.y+rect.h]){
    const ox=a.x-cx,oy=a.y-cy,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-radius*radius,D=B*B-4*A*C;
    if(D>=0){const t=(-B-Math.sqrt(D))/(2*A);add(t,a.x+t*dx,a.y+t*dy);}
  }
  const nearestX=Math.max(rect.x,Math.min(rect.x+rect.w,a.x)),nearestY=Math.max(rect.y,Math.min(rect.y+rect.h,a.y));
  if((a.x-nearestX)**2+(a.y-nearestY)**2<=radius*radius)add(0,a.x,a.y);
  return candidates.sort((p,q)=>p.t-q.t)[0]||null;
}
export function advanceProjectile(p, blocks, barriers, dt = DT) {
  const next = { ...p, x:p.x+p.vx*dt, y:p.y+p.vy*dt+WORLD.gravity*dt*dt/2, vy:p.vy+WORLD.gravity*dt, age:p.age+dt };
  const hits=[];
  for(const b of blocks.filter(b=>b.hp>0)){
    const hit=segmentHit(p,next,b);if(hit)hits.push({...hit,type:'block',id:b.id});
  }
  for(const b of barriers){const hit=segmentHit(p,next,b);if(hit)hits.push({...hit,type:'barrier',id:b.id});}
  if(next.y+WORLD.radius>=WORLD.ground&&next.vy>0){
    const t=Math.max(0,Math.min(1,(WORLD.ground-WORLD.radius-p.y)/(next.y-p.y)));
    hits.push({t,x:p.x+(next.x-p.x)*t,y:WORLD.ground-WORLD.radius,type:'ground'});
  }
  if(next.x>WORLD.width+WORLD.radius||next.y<-600||next.age>12)hits.push({t:1,x:next.x,y:next.y,type:'miss'});
  const hit=hits.sort((a,b)=>a.t-b.t)[0];
  return { next:hit?{...next,x:hit.x,y:hit.y}:next,hit:hit||null };
}
export function trajectory(s) {
  let p=projectileFor(s);const points=[{x:p.x,y:p.y}];let impact=null;
  for(let i=0;i<120*13;i++){
    const result=advanceProjectile(p,s.blocks,s.barriers);p=result.next;
    if(i%8===0)points.push({x:p.x,y:p.y});
    if(result.hit){impact=result.hit;points.push({x:p.x,y:p.y});break;}
  }
  return {points,impact};
}
function event(s,type,data={}){s.events.push({...data,sequence:++s.eventId,type,time:s.time});}
function destroy(s,b,cause){
  if(b.hp<=0&&b.destroyed)return;
  b.hp=0;b.destroyed=true;
  // Four actual facade fragments carry the source artwork, material and impact momentum.
  // Glass does not delete its entire column: unsupported floors must fall and collide.
  const impulse=s.lastImpact?.type==='block'?Math.min(100,s.lastImpact.speed*.11):25;
  const columns=b.kind==='glass'?3:2,rows=b.kind==='roof'?1:2;
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const fw=b.w/columns,fh=b.h/rows;
    s.rubble.push({id:b.id+'-'+row+'-'+col,kind:b.kind,skin:b.skin,x:b.x+col*fw,y:b.y+row*fh,w:fw,h:fh,
      crop:[col/columns,row/rows,1/columns,1/rows],vx:(b.vx||0)+impulse+(col-(columns-1)/2)*55,
      vy:-(40+row*28+col*13),angle:b.angle||0,spin:(col%2?1:-1)*(1.5+row*.35),age:0,bounces:0});
  }
  s.shotDestroyed++;
  event(s,'destroy',{id:b.id,kind:b.kind,cause,count:s.shotDestroyed,x:b.x+b.w/2,y:b.y+b.h/2});
}
function collectTarget(s,t,cause){
 if(t.collected)return;t.collected=true;s.bonusScore+=t.value;
 event(s,'bonus',{id:t.id,kind:t.kind,value:t.value,cause,x:t.x+t.w/2,y:t.y+t.h/2});
}
function updateTargets(s,dt){
 for(const t of s.targets.filter(t=>!t.collected)){
  const support=s.blocks.find(b=>b.id===t.support);
  if(!t.falling&&(!support||support.hp<=0||support.falling)){t.falling=true;t.vy=0;}
  if(t.falling){t.vy+=WORLD.gravity*dt;t.y+=t.vy*dt;if(t.y+t.h>=WORLD.ground){t.y=WORLD.ground-t.h;collectTarget(s,t,'landed');}}
 }
}
function collapse(s){
  let changed=true;
  while(changed){changed=false;for(const b of s.blocks.filter(b=>b.hp>0&&b.supports.length)){
    if(!b.falling&&b.supports.every(id=>{const support=s.blocks.find(other=>other.id===id);return support.hp<=0||support.falling;})){b.falling=true;b.vy=0;b.fallAge=0;b.angle=0;
      const hit=s.lastImpact||{x:b.x+b.w/2,speed:240};
      b.vx=Math.max(-75,Math.min(75,(b.x+b.w/2-hit.x)*.2+hit.speed*.035));
      b.spin=(b.vx>=0?1:-1)*(.3+Math.min(.5,Math.abs(b.x+b.w/2-hit.x)/400));
      b.fallDelay=.06+Math.max(0,WORLD.ground-b.y-b.h)*.00025;b.contacts=[];
      event(s,'support-lost',{id:b.id,x:b.x+b.w/2,y:b.y+b.h/2});changed=true;}
  }}
}
function impact(s,p,hit){
  s.lastImpact={...hit,speed:Math.hypot(p.vx,p.vy),ammoType:p.ammoType};s.hitStop=hit.type==='block'?.055:0;event(s,'impact',{...s.lastImpact,hitType:hit.type});
  if(hit.type==='block'){
    const direct=s.blocks.find(b=>b.id===hit.id);
    const ammo=AMMO[p.ammoType]||AMMO.impact;
    const damage=Math.max(45,Math.min(155,Math.hypot(p.vx,p.vy)**2*.00028))*ammo.damage*(p.ammoType==='glass'&&direct.kind==='glass'?2:1);
    direct.hp-=damage;
    if(direct.hp<=0)destroy(s,direct,'hit');
    for(const b of s.blocks.filter(b=>b.hp>0&&b.id!==hit.id)){
      const x=Math.max(b.x,Math.min(b.x+b.w,hit.x)),y=Math.max(b.y,Math.min(b.y+b.h,hit.y));
      const distance=Math.hypot(hit.x-x,hit.y-y);
      if(distance<ammo.radius){b.hp-=damage*.2*(1-distance/ammo.radius);if(b.hp<=0)destroy(s,b,'impact');}
    }
    for(const t of s.targets.filter(t=>!t.collected)){
      const x=Math.max(t.x,Math.min(t.x+t.w,hit.x)),y=Math.max(t.y,Math.min(t.y+t.h,hit.y));
      if(Math.hypot(hit.x-x,hit.y-y)<ammo.radius)collectTarget(s,t,'impact');
    }
    collapse(s);
  }
  s.phase='settling';s.settle=1.1;
}
export function fire(s){
  if(s.phase!=='aim'||s.shotsLeft<=0)return false;
  s.lastShot={blocks:structuredClone(s.blocks),targets:structuredClone(s.targets),bonusScore:s.bonusScore,shotsLeft:s.shotsLeft,used:s.used,angle:s.angle,power:s.power,ammoType:s.ammoType};
  s.shotDestroyed=0;s.hitStop=0;s.rubble=[];s.projectile=projectileFor(s);s.shotsLeft--;s.used++;s.phase='flight';s.lastImpact=null;event(s,'launch');return true;
}
export function undo(s){
  if(!s.lastShot||s.phase==='paused')return false;
  const snapshot=s.lastShot;Object.assign(s,structuredClone(snapshot));
  s.projectile=null;s.rubble=[];s.events=[];s.hitStop=0;s.shotDestroyed=0;s.lastImpact=null;s.lastShot=null;s.phase='aim';s.stars=0;s.undoCount++;return true;
}
export function pause(s){if(!['aim','flight','settling'].includes(s.phase))return false;s.resumePhase=s.phase;s.phase='paused';return true;}
export function resume(s){if(s.phase!=='paused')return false;s.phase=s.resumePhase;s.resumePhase=null;return true;}
export function step(s,dt=DT){
  if(!['flight','settling'].includes(s.phase))return;
  dt=Math.max(0,Math.min(dt,DT));if(s.hitStop>0){s.hitStop=Math.max(0,s.hitStop-dt);return;}s.time+=dt;
  s.events=s.events.filter(e=>s.time-e.time<2);
  if(s.phase==='flight'){
    const result=advanceProjectile(s.projectile,s.blocks,s.barriers,dt);
    for(const t of s.targets.filter(t=>!t.collected))if(segmentHit(s.projectile,result.next,t))collectTarget(s,t,'projectile');
    s.projectile=result.next;
    if(result.hit)impact(s,result.next,result.hit);
  }else{
    s.settle-=dt;
    if(s.settle<=0&&!s.blocks.some(b=>b.hp>0&&b.falling)&&!s.targets.some(t=>!t.collected&&t.falling)){s.projectile=null;
      if(s.blocks.every(b=>b.hp<=0)){s.phase='won';s.stars=s.used<=LEVELS[s.level].par?3:s.shotsLeft>0?2:1;}
      else s.phase=s.shotsLeft>0?'aim':'lost';
    }
  }
  // Unsupported modules retain their artwork and mass until they actually land.
  for(const b of s.blocks.filter(b=>b.hp>0&&b.falling).sort((a,b)=>b.y-a.y)){
    b.fallAge+=dt;
    b.angle=Math.max(-.7,Math.min(.7,(b.angle||0)+b.spin*dt));
    if(b.fallAge<b.fallDelay)continue;
    b.vy+=WORLD.gravity*dt;b.x+=b.vx*dt;
    // Falling mass can knock an adjacent bay loose instead of vanishing on a timer.
    for(const other of s.blocks.filter(other=>other!==b&&other.hp>0&&!other.falling)){
      const ox=Math.min(b.x+b.w,other.x+other.w)-Math.max(b.x,other.x);
      const oy=Math.min(b.y+b.h,other.y+other.h)-Math.max(b.y,other.y);
      if(ox>8&&oy>8&&!b.contacts.includes(other.id)){
        b.contacts.push(other.id);const energy=Math.min(32,Math.abs(b.vx)*.15+b.vy*.045);
        other.hp-=energy;event(s,'chain-hit',{id:other.id,x:other.x+other.w/2,y:other.y+other.h/2,energy});
        b.vx*=.55;if(other.hp<=0){destroy(s,other,'side-impact');collapse(s);}
      }
    }
    const oldBottom=b.y+b.h,nextBottom=oldBottom+b.vy*dt;
    const surfaces=s.blocks.filter(other=>other!==b&&other.hp>0&&!other.falling&&other.y>=oldBottom-1&&Math.min(b.x+b.w,other.x+other.w)-Math.max(b.x,other.x)>Math.min(b.w,other.w)*.2);
    const floor=Math.min(WORLD.ground,...surfaces.map(other=>other.y));
    b.y+=b.vy*dt;
    if(nextBottom>=floor){
      b.y=floor-b.h;
      for(const other of surfaces.filter(other=>Math.abs(other.y-floor)<1)){
        other.hp-=Math.min(55,b.vy*.15);if(other.hp<=0)destroy(s,other,'fall-impact');
      }
      destroy(s,b,'landed');collapse(s);s.settle=Math.max(s.settle,.65);
    }
  }
  updateTargets(s,dt);
  for(const r of s.rubble){
    r.age+=dt;r.vy+=WORLD.gravity*dt;r.x+=r.vx*dt;r.y+=r.vy*dt;r.angle+=r.spin*dt;
    if(r.y+r.h>WORLD.ground){r.y=WORLD.ground-r.h;if(r.vy>45&&r.bounces<2){r.vy=-r.vy*.22;r.bounces++;}else r.vy=0;r.vx*=.88;r.spin*=.7;}
  }
  s.rubble=s.rubble.filter(r=>r.age<3).slice(-100);
}
