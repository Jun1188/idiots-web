/** Original deterministic projectile puzzle. Preview and play share this collision path. */
export const WORLD = { width: 960, height: 540, ground: 470, gravity: 380, radius: 24, origin: { x: 124, y: 382 } };
export const AMMO = {
  impact: {label:'돌격 티노',sprite:'fly',damage:1,radius:60,description:'한 곳에 강한 충격'},
  echo: {label:'파동 티노',sprite:'celebrate',damage:.85,radius:130,description:'주변 모형까지 넓은 충격'},
  glass: {label:'연구 티노',sprite:'aim',damage:1,radius:72,description:'유리에는 두 배의 충격'},
};
export const chargePower = elapsed => Math.round(20 + 80 * Math.min(1,Math.max(0,elapsed)/1800));
export function dragAngle(x,y){return Math.max(12,Math.min(80,Math.atan2(WORLD.origin.y-y,Math.max(5,x-WORLD.origin.x))*180/Math.PI));}
export function selectAmmo(s,key){if(s.phase!=='aim'||!AMMO[key])return false;s.ammoType=key;return true;}
export const DT = 1 / 120;
export const MATERIALS = {
  brick: { hp: 120, label: '벽돌 외벽' },
  glass: { hp: 65, label: '유리 외벽' },
  pillar: { hp: 95, label: '지지 기둥' },
  roof: { hp: 80, label: '지붕' },
};
const block = (id, kind, x, y, w, h, supports = []) => ({ id, kind, x, y, w, h, supports, hp: MATERIALS[kind].hp, maxHp: MATERIALS[kind].hp });
export const LEVELS = [
  {
    name: '01 · 공학관 앞뜰', brief: '낮은 기둥을 노려보세요. 지지가 사라지면 위층도 무너집니다.', shots: 3, par: 2,
    angle: 12, power: 87,
    blocks: [block('a1','pillar',610,380,32,90),block('a2','pillar',730,380,32,90),block('a3','brick',593,292,88,88,['a1']),block('a4','brick',713,292,88,88,['a2']),block('a5','roof',585,229,225,63,['a3','a4'])], barriers: [],
  },
  {
    name: '02 · 유리 연구동', brief: '가림막을 넘겨 유리층을 맞히세요. 세로로 이어진 유리층은 함께 부서집니다.', shots: 4, par: 2,
    angle: 22, power: 55,
    blocks: [block('b1','glass',680,382,70,88),block('b2','glass',760,382,70,88),block('b3','glass',680,294,70,88,['b1']),block('b4','glass',760,294,70,88,['b2']),block('b5','roof',665,239,180,55,['b3','b4'])],
    barriers: [{id:'screen',x:430,y:360,w:159,h:110}],
  },
  {
    name: '03 · 마지막 연결동', brief: '높이가 다른 세 모형의 지지부를 살펴보세요. 남은 발을 나누는 것이 중요합니다.', shots: 5, par: 4,
    angle: 36, power: 65,
    blocks: [block('c1','pillar',535,380,32,90),block('c2','brick',535,306,95,74,['c1']),block('c3','roof',525,270,115,36,['c2']),block('c4','pillar',760,380,32,90),block('c5','glass',750,294,100,86,['c4']),block('c6','glass',750,208,100,86,['c5']),block('c7','roof',738,171,124,37,['c6']),block('c8','glass',650,306,80,84,['c9']),block('c9','pillar',665,390,28,80)],
    barriers: [],
  },
];
export function createGame(level = 0) {
  const definition = LEVELS[level];
  if (!definition) throw new RangeError('Unknown level');
  return { level, ammoType:'impact', phase:'aim', resumePhase:null, angle:definition.angle, power:definition.power, shotsLeft:definition.shots, used:0, time:0,
    blocks:structuredClone(definition.blocks), barriers:structuredClone(definition.barriers), projectile:null, rubble:[], events:[], lastImpact:null,
    lastShot:null, undoCount:0, settle:0, stars:0 };
}
export const speedFor = power => 220 + power * 4.2;
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
  if(next.x>WORLD.width+WORLD.radius||next.y<-600||next.age>9)hits.push({t:1,x:next.x,y:next.y,type:'miss'});
  const hit=hits.sort((a,b)=>a.t-b.t)[0];
  return { next:hit?{...next,x:hit.x,y:hit.y}:next,hit:hit||null };
}
export function trajectory(s) {
  let p=projectileFor(s);const points=[{x:p.x,y:p.y}];let impact=null;
  for(let i=0;i<120*10;i++){
    const result=advanceProjectile(p,s.blocks,s.barriers);p=result.next;
    if(i%8===0)points.push({x:p.x,y:p.y});
    if(result.hit){impact=result.hit;points.push({x:p.x,y:p.y});break;}
  }
  return {points,impact};
}
function event(s,type,data={}){s.events.push({type,time:s.time,...data});}
function destroy(s,b,cause){
  if(b.hp<=0&&b.destroyed)return;
  b.hp=0;b.destroyed=true;
  // In this model puzzle, touching glass panes in one column transmit a crack.
  if(b.kind==='glass'){
    for(const neighbor of s.blocks.filter(other=>other.hp>0&&other.kind==='glass'&&other.id!==b.id)){
      const horizontalOverlap=Math.min(b.x+b.w,neighbor.x+neighbor.w)-Math.max(b.x,neighbor.x);
      const touching=Math.abs(b.y+b.h-neighbor.y)<1||Math.abs(neighbor.y+neighbor.h-b.y)<1;
      if(horizontalOverlap>0&&touching)destroy(s,neighbor,'glass-chain');
    }
  }
  s.rubble.push({id:b.id,kind:b.kind,x:b.x,y:b.y,w:b.w,h:b.h,vx:((b.id.charCodeAt(1)%3)-1)*35,vy:-30,angle:0,age:0});
  event(s,'destroy',{id:b.id,cause,x:b.x+b.w/2,y:b.y+b.h/2});
}
function collapse(s){
  let changed=true;
  while(changed){changed=false;for(const b of s.blocks.filter(b=>b.hp>0&&b.supports.length)){
    if(!b.falling&&b.supports.every(id=>{const support=s.blocks.find(other=>other.id===id);return support.hp<=0||support.falling;})){b.falling=true;b.vy=0;b.fallAge=0;changed=true;}
  }}
}
function impact(s,p,hit){
  s.lastImpact={...hit,speed:Math.hypot(p.vx,p.vy)};event(s,'impact',s.lastImpact);
  if(hit.type==='block'){
    const direct=s.blocks.find(b=>b.id===hit.id);
    const ammo=AMMO[p.ammoType]||AMMO.impact;
    const damage=Math.max(45,Math.min(240,Math.hypot(p.vx,p.vy)**2*.00075))*ammo.damage*(p.ammoType==='glass'&&direct.kind==='glass'?2:1);
    direct.hp-=damage;
    if(direct.hp<=0)destroy(s,direct,'hit');
    for(const b of s.blocks.filter(b=>b.hp>0&&b.id!==hit.id)){
      const x=Math.max(b.x,Math.min(b.x+b.w,hit.x)),y=Math.max(b.y,Math.min(b.y+b.h,hit.y));
      const distance=Math.hypot(hit.x-x,hit.y-y);
      if(distance<ammo.radius){b.hp-=damage*.65*(1-distance/ammo.radius);if(b.hp<=0)destroy(s,b,'impact');}
    }
    collapse(s);
  }
  s.phase='settling';s.settle=.85;
}
export function fire(s){
  if(s.phase!=='aim'||s.shotsLeft<=0)return false;
  s.lastShot={blocks:structuredClone(s.blocks),shotsLeft:s.shotsLeft,used:s.used,angle:s.angle,power:s.power,ammoType:s.ammoType};
  s.projectile=projectileFor(s);s.shotsLeft--;s.used++;s.phase='flight';s.lastImpact=null;event(s,'launch');return true;
}
export function undo(s){
  if(!s.lastShot||s.phase==='paused')return false;
  const snapshot=s.lastShot;Object.assign(s,structuredClone(snapshot));
  s.projectile=null;s.rubble=[];s.events=[];s.lastImpact=null;s.lastShot=null;s.phase='aim';s.stars=0;s.undoCount++;return true;
}
export function pause(s){if(!['aim','flight','settling'].includes(s.phase))return false;s.resumePhase=s.phase;s.phase='paused';return true;}
export function resume(s){if(s.phase!=='paused')return false;s.phase=s.resumePhase;s.resumePhase=null;return true;}
export function step(s,dt=DT){
  if(!['flight','settling'].includes(s.phase))return;
  dt=Math.max(0,Math.min(dt,DT));s.time+=dt;
  s.events=s.events.filter(e=>s.time-e.time<1.3);
  if(s.phase==='flight'){
    const result=advanceProjectile(s.projectile,s.blocks,s.barriers,dt);s.projectile=result.next;
    if(result.hit)impact(s,result.next,result.hit);
  }else{
    s.settle-=dt;
    if(s.settle<=0&&!s.blocks.some(b=>b.hp>0&&b.falling)){s.projectile=null;
      if(s.blocks.every(b=>b.hp<=0)){s.phase='won';s.stars=s.used<=LEVELS[s.level].par?3:s.shotsLeft>0?2:1;}
      else s.phase=s.shotsLeft>0?'aim':'lost';
    }
  }
  // Unsupported modules retain their artwork and mass until they actually land.
  for(const b of s.blocks.filter(b=>b.hp>0&&b.falling).sort((a,b)=>b.y-a.y)){
    b.vy+=WORLD.gravity*dt;b.fallAge+=dt;
    const oldBottom=b.y+b.h,nextBottom=oldBottom+b.vy*dt;
    const surfaces=s.blocks.filter(other=>other!==b&&other.hp>0&&!other.falling&&other.y>=oldBottom-1&&b.x<other.x+other.w&&b.x+b.w>other.x);
    const floor=Math.min(WORLD.ground,...surfaces.map(other=>other.y));
    b.y+=b.vy*dt;
    if(nextBottom>=floor){
      b.y=floor-b.h;
      for(const other of surfaces.filter(other=>Math.abs(other.y-floor)<1)){
        other.hp-=Math.min(180,b.vy*.65);if(other.hp<=0)destroy(s,other,'fall-impact');
      }
      destroy(s,b,'landed');collapse(s);s.settle=Math.max(s.settle,.3);
    }
  }
  for(const r of s.rubble){r.age+=dt;r.vy+=WORLD.gravity*dt;r.x+=r.vx*dt;r.y+=r.vy*dt;r.angle+=r.vx*dt*.006;if(r.y+r.h>WORLD.ground){r.y=WORLD.ground-r.h;r.vy=Math.abs(r.vy)>45?-r.vy*.22:0;r.vx*=.9;}}
  s.rubble=s.rubble.filter(r=>r.age<1.4).slice(-20);
}
