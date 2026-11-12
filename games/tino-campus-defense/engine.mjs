/** Campus Window: deterministic grab-and-throw platform defense, no DOM or clocks. */
export const WIDTH=720, HEIGHT=540, STEP=1/120, DURATION=180;
export const GROUND={x:60,y:490,w:660};
// Raised ledges carry installations only. Actors always return to the ground lane.
export const PLATFORMS=[{x:360,y:220,w:220},{x:170,y:320,w:220},GROUND];
export const PADS=[{x:470,y:220},{x:280,y:320},{x:160,y:490}];
export const FACILITIES={signal:{name:'공학 방어탑',cost:40,description:'아래 통로에 감속장을 펼쳐요'},bumper:{name:'전자 공격탑',cost:55,description:'아래 통로를 겨냥해 티노를 밀쳐요'}};
export function createGame(){return {phase:'ready',time:0,hp:10,energy:60,units:[],facilities:[],events:[],nextId:1,nextSpawn:2,spawned:0,saved:0,leaked:0,held:null,score:0};}
export function command(s,action,arg){
 if(action==='start'&&s.phase==='ready'){s.phase='playing';return true;}
 if(action==='pause'&&s.phase==='playing'){if(s.held!==null)release(s,0,0);s.phase='paused';return true;}
 if(action==='resume'&&s.phase==='paused'){s.phase='playing';return true;}
 if(s.phase!=='playing')return false;
 if(action==='build'){const [kind,idx]=String(arg).split(':'),slot=Number(idx),f=FACILITIES[kind];if(!f||!Number.isInteger(slot)||!PADS[slot]||s.facilities.some(v=>v.slot===slot)||s.energy<f.cost)return false;s.energy-=f.cost;s.facilities.push({kind,slot,cooldown:0});return true;}
 return false;
}
export function spawn(s){const u={id:s.nextId++,x:680,y:460,vx:0,vy:0,r:30,grounded:true,facing:-1,held:false,thrown:false,age:0,flash:0};s.units.push(u);s.spawned++;return u;}
export function grab(s,x,y){if(s.phase!=='playing'||s.held!==null||!Number.isFinite(x)||!Number.isFinite(y))return null;const choices=s.units.filter(u=>Math.abs(u.x-x)<52&&Math.abs(u.y-y)<57).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));const u=choices[0];if(!u)return null;u.held=true;u.grounded=false;u.vx=0;u.vy=0;s.held=u.id;return u.id;}
export function drag(s,x,y){const u=s.units.find(u=>u.id===s.held);if(s.phase!=='playing'||!u||!Number.isFinite(x)||!Number.isFinite(y))return false;const delta=x-u.x;if(Math.abs(delta)>.1)u.facing=Math.sign(delta);u.x=Math.max(-40,Math.min(WIDTH+40,x));u.y=Math.max(30,Math.min(HEIGHT-30,y));return true;}
export function release(s,vx,vy){const u=s.units.find(u=>u.id===s.held);if(!u)return false;u.held=false;u.thrown=true;u.vx=Math.max(-900,Math.min(900,Number.isFinite(vx)?vx:0));u.vy=Math.max(-750,Math.min(750,Number.isFinite(vy)?vy:0));if(Math.abs(u.vx)>.1)u.facing=Math.sign(u.vx);s.held=null;return true;}
const progress=time=>Math.max(0,Math.min(1,Number.isFinite(time)?time/DURATION:0));
export function spawnInterval(time){return 3.6-2.8*progress(time);}
export function walkSpeed(time){return 28+38*progress(time);}
export function scoreGame(s){return s.saved*100+(s.phase==='won'?1000+s.hp*100:0);}
export function step(s,dt=STEP){if(s.phase!=='playing')return;dt=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));s.time+=dt;s.energy=Math.min(150,s.energy+dt*.7);s.events=s.events.filter(e=>s.time-e.at<.7);
 if(s.time<DURATION&&s.time>=s.nextSpawn&&s.units.length<20){spawn(s);s.nextSpawn=s.time+spawnInterval(s.time);}
 for(const f of s.facilities)f.cooldown=Math.max(0,f.cooldown-dt);
 for(const u of s.units){u.age+=dt;u.flash=Math.max(0,u.flash-dt);if(u.held)continue;
 const oldFeet=u.y+u.r;let slowed=false;
 for(const f of s.facilities){const pad=PADS[f.slot];if(Math.abs(u.x-pad.x)<115&&u.y+u.r>=pad.y-8&&u.y+u.r<=GROUND.y+2){if(f.kind==='signal')slowed=true;else if(f.cooldown<=0){u.vx=360;u.vy=-360;u.grounded=false;u.thrown=true;u.flash=.25;f.cooldown=2.4;s.events.push({at:s.time,kind:'pulse',x:pad.x,y:pad.y-40,toX:u.x,toY:u.y});}}}
 u.slowed=slowed;
 if(u.grounded&&!u.thrown)u.vx=-walkSpeed(s.time)*(slowed?.4:1);
 if(Math.abs(u.vx)>.1)u.facing=Math.sign(u.vx);
 u.vy+=900*dt;u.x+=u.vx*dt;u.y+=u.vy*dt;u.grounded=false;
 for(const p of [GROUND]){if(u.vy>=0&&oldFeet<=p.y+2&&u.y+u.r>=p.y&&u.x>p.x&&u.x<p.x+p.w){u.y=p.y-u.r;u.vy=0;u.grounded=true;if(u.thrown){u.vx*=Math.pow(.08,dt);if(Math.abs(u.vx)<35)u.thrown=false;}break;}}
 if(!u.grounded)u.vx*=Math.pow(.85,dt);
 if(u.x>WIDTH+35||u.x< -35||u.y>HEIGHT+65){u.done=true;s.saved++;s.energy=Math.min(150,s.energy+5);s.events.push({at:s.time,x:Math.max(40,Math.min(WIDTH-40,u.x)),y:Math.min(HEIGHT-30,u.y),text:'+100 잘 가!'});}
 else if(u.grounded&&u.y>400&&u.x<105){u.done=true;s.hp--;s.leaked++;s.events.push({at:s.time,x:100,y:440,text:'F 시험지 -1'});}
 }
 s.units=s.units.filter(u=>!u.done);if(s.held!==null&&!s.units.some(u=>u.id===s.held))s.held=null;
 if(s.hp<=0){s.phase='lost';s.held=null;for(const u of s.units)u.held=false;}
 else if(s.time>=DURATION&&!s.units.length)s.phase='won';s.score=scoreGame(s);
}
