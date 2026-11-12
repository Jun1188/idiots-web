/** Campus Window: deterministic grab-and-throw platform defense, no DOM or clocks. */
export const WIDTH=720, HEIGHT=540, STEP=1/120, DURATION=180;
export const PLATFORMS=[{x:340,y:170,w:340},{x:180,y:330,w:380},{x:60,y:490,w:490}];
export const PADS=[{x:460,y:170},{x:300,y:330},{x:180,y:490}];
export const FACILITIES={signal:{name:'캠퍼스 안내탑',cost:40,description:'주변 티노 걸음을 늦춰요'},bumper:{name:'공학 실습관',cost:55,description:'가까운 티노를 오른쪽으로 튕겨요'}};
export function createGame(){return {phase:'ready',time:0,hp:10,energy:60,units:[],facilities:[],events:[],nextId:1,nextSpawn:2,spawned:0,saved:0,leaked:0,held:null,score:0};}
export function command(s,action,arg){
 if(action==='start'&&s.phase==='ready'){s.phase='playing';return true;}
 if(action==='pause'&&s.phase==='playing'){if(s.held!==null)release(s,0,0);s.phase='paused';return true;}
 if(action==='resume'&&s.phase==='paused'){s.phase='playing';return true;}
 if(s.phase!=='playing')return false;
 if(action==='build'){const [kind,idx]=String(arg).split(':'),slot=Number(idx),f=FACILITIES[kind];if(!f||!Number.isInteger(slot)||!PADS[slot]||s.facilities.some(v=>v.slot===slot)||s.energy<f.cost)return false;s.energy-=f.cost;s.facilities.push({kind,slot,cooldown:0});return true;}
 return false;
}
export function spawn(s){const u={id:s.nextId++,x:650,y:100,vx:0,vy:0,r:30,grounded:false,held:false,thrown:false,age:0,flash:0};s.units.push(u);s.spawned++;return u;}
export function grab(s,x,y){if(s.phase!=='playing'||s.held!==null||!Number.isFinite(x)||!Number.isFinite(y))return null;const choices=s.units.filter(u=>Math.abs(u.x-x)<52&&Math.abs(u.y-y)<57).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));const u=choices[0];if(!u)return null;u.held=true;u.grounded=false;u.vx=0;u.vy=0;s.held=u.id;return u.id;}
export function drag(s,x,y){const u=s.units.find(u=>u.id===s.held);if(s.phase!=='playing'||!u||!Number.isFinite(x)||!Number.isFinite(y))return false;u.x=Math.max(-40,Math.min(WIDTH+40,x));u.y=Math.max(30,Math.min(HEIGHT-30,y));return true;}
export function release(s,vx,vy){const u=s.units.find(u=>u.id===s.held);if(!u)return false;u.held=false;u.thrown=true;u.vx=Math.max(-900,Math.min(900,Number.isFinite(vx)?vx:0));u.vy=Math.max(-750,Math.min(750,Number.isFinite(vy)?vy:0));s.held=null;return true;}
export function scoreGame(s){return s.saved*100+(s.phase==='won'?1000+s.hp*100:0);}
export function step(s,dt=STEP){if(s.phase!=='playing')return;dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));s.time+=dt;s.energy=Math.min(150,s.energy+dt*.7);s.events=s.events.filter(e=>s.time-e.at<.7);
 if(s.time<DURATION&&s.time>=s.nextSpawn&&s.units.length<10){spawn(s);s.nextSpawn=s.time+Math.max(3.4,6.4-s.time/70);}
 for(const f of s.facilities)f.cooldown=Math.max(0,f.cooldown-dt);
 for(const u of s.units){u.age+=dt;u.flash=Math.max(0,u.flash-dt);if(u.held)continue;
 const oldFeet=u.y+u.r;let slowed=false;
 for(const f of s.facilities){const pad=PADS[f.slot];if(Math.abs(u.x-pad.x)<95&&Math.abs(u.y+u.r-pad.y)<50){if(f.kind==='signal')slowed=true;else if(f.cooldown<=0){u.vx=360;u.vy=-360;u.grounded=false;u.thrown=true;u.flash=.25;f.cooldown=2.2;}}}
 u.slowed=slowed;
 if(u.grounded&&!u.thrown)u.vx=-(24+Math.min(14,s.time/13))*(slowed?.4:1);
 u.vy+=900*dt;u.x+=u.vx*dt;u.y+=u.vy*dt;u.grounded=false;
 for(const p of PLATFORMS){if(u.vy>=0&&oldFeet<=p.y+2&&u.y+u.r>=p.y&&u.x>p.x&&u.x<p.x+p.w){u.y=p.y-u.r;u.vy=0;u.grounded=true;if(u.thrown){u.vx*=Math.pow(.08,dt);if(Math.abs(u.vx)<35)u.thrown=false;}break;}}
 if(!u.grounded)u.vx*=Math.pow(.85,dt);
 if(u.x>WIDTH+35||u.x< -35||u.y>HEIGHT+65){u.done=true;s.saved++;s.energy=Math.min(150,s.energy+5);s.events.push({at:s.time,x:Math.max(40,Math.min(WIDTH-40,u.x)),y:Math.min(HEIGHT-30,u.y),text:'+100 잘 가!'});}
 else if(u.grounded&&u.y>400&&u.x<105){u.done=true;s.hp--;s.leaked++;s.events.push({at:s.time,x:100,y:440,text:'작업실 -1'});}
 }
 s.units=s.units.filter(u=>!u.done);if(s.held!==null&&!s.units.some(u=>u.id===s.held))s.held=null;
 if(s.hp<=0){s.phase='lost';s.held=null;for(const u of s.units)u.held=false;}
 else if(s.time>=DURATION&&!s.units.length)s.phase='won';s.score=scoreGame(s);
}
