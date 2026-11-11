import { WORLD, AMMO } from './engine.mjs';
// Artist-verified compact-body circle within fly crop; tail/speed lines are decorative.
export const FLIGHT_BODY = { x:246, y:128, radius:128 };
export async function loadArt(){
  const response=await fetch(new URL('./art/atlas.json',import.meta.url));
  if(!response.ok)throw new Error('Atlas unavailable');
  const atlas=await response.json(),images={};
  const files=[atlas.background.file,...Object.values(atlas.sprites).map(s=>s.file)];
  await Promise.all([...new Set(files)].map(async file=>{const image=new Image();image.src=new URL(`./art/${file}`,import.meta.url);await image.decode();images[file]=image;}));
  return {atlas,images};
}
export function createRenderer(canvas,art,reducedMotion=false){
  const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
  function sprite(key,x,y,w,h,rotation=0,alpha=1){
    const def=art.atlas.sprites[key];const [sx,sy,sw,sh]=def.rect;
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x+w/2,y+h/2);ctx.rotate(rotation);
    ctx.drawImage(art.images[def.file],sx,sy,sw,sh,-w/2,-h/2,w,h);ctx.restore();
  }
  function shadow(x,y,w){ctx.fillStyle='#26394242';ctx.beginPath();ctx.ellipse(x,y,w/2,5,0,0,Math.PI*2);ctx.fill();}
  function render(s,preview,dragging=false){
    const bg=art.images[art.atlas.background.file];
    ctx.fillStyle='#dbe0d2';ctx.fillRect(0,0,WORLD.width,WORLD.height);
    ctx.save();ctx.globalAlpha=.68;ctx.drawImage(bg,0,0,WORLD.width,WORLD.height);ctx.restore();
    // Separate the interactive model from the distant illustrated campus.
    for(const b of s.blocks.filter(b=>b.hp>0)){
      if(!b.supports.length)shadow(b.x+b.w/2,WORLD.ground+3,b.w+12);
      sprite(`${b.kind}-${b.hp<b.maxHp?'cracked':'intact'}`,b.x,b.y,b.w,b.h,b.falling&&!reducedMotion?Math.min(.15,b.fallAge*.12):0);
      if(b.hp<b.maxHp){ctx.fillStyle='#163242';ctx.fillRect(b.x,b.y-10,b.w,6);ctx.fillStyle='#f7c66f';ctx.fillRect(b.x+1,b.y-9,(b.w-2)*Math.max(0,b.hp/b.maxHp),4);}
    }
    for(const b of s.barriers){
      // The visual barrier occupies the same bounds as its collision plane.
      sprite('barrier',b.x,b.y,b.w,b.h,b.falling&&!reducedMotion?Math.min(.15,b.fallAge*.12):0);
    }
    shadow(WORLD.origin.x,WORLD.ground+4,105);
    sprite('launcher',WORLD.origin.x-43,WORLD.ground-110,86,110);
    if(s.phase==='aim'||s.phase==='paused'){
      sprite(AMMO[s.ammoType].sprite,WORLD.origin.x-42,WORLD.origin.y-25,76,55);
    }
    if(s.phase==='won')sprite('celebrate',WORLD.origin.x-34,WORLD.ground-87,83,78);
    if(preview&&s.phase==='aim'){
      ctx.save();ctx.lineWidth=5;ctx.strokeStyle='#173749bb';ctx.beginPath();
      preview.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
      ctx.strokeStyle='#fff1b9';ctx.lineWidth=2;ctx.setLineDash([7,9]);ctx.stroke();ctx.setLineDash([]);
      const hit=preview.impact;
      if(hit&&hit.x<=WORLD.width){
        ctx.strokeStyle=hit.type==='block'?'#183a40':'#654832';ctx.lineWidth=6;
        ctx.beginPath();ctx.arc(hit.x,hit.y,WORLD.radius,0,Math.PI*2);ctx.stroke();
        ctx.strokeStyle=hit.type==='block'?'#a4f1c7':'#ffda8a';ctx.lineWidth=3;ctx.stroke();
        ctx.beginPath();ctx.moveTo(hit.x-30,hit.y);ctx.lineTo(hit.x+30,hit.y);ctx.moveTo(hit.x,hit.y-30);ctx.lineTo(hit.x,hit.y+30);ctx.stroke();
        const block=s.blocks.find(b=>b.id===hit.id);
        if(block){ctx.strokeStyle='#fff2b0';ctx.lineWidth=2;ctx.strokeRect(block.x-3,block.y-3,block.w+6,block.h+6);}
      }
      if(dragging){
        // The angle guide points forward, matching the launched velocity exactly.
        const a=-s.angle*Math.PI/180;
        ctx.strokeStyle='#e8b65e';ctx.lineWidth=3;ctx.beginPath();
        ctx.moveTo(WORLD.origin.x,WORLD.origin.y);ctx.lineTo(WORLD.origin.x+Math.cos(a)*75,WORLD.origin.y+Math.sin(a)*75);ctx.stroke();
        ctx.beginPath();ctx.arc(WORLD.origin.x,WORLD.origin.y,42,a,0);ctx.stroke();
      }
      ctx.restore();
    }
    for(const r of s.rubble){
      const alpha=Math.max(0,1-r.age/1.4);
      sprite(`${r.kind}-rubble`,r.x,r.y,r.w,Math.min(r.h,48),reducedMotion?0:r.angle,alpha);
    }
    if(s.projectile){
      const p=s.projectile;
      const rotation=reducedMotion?0:Math.max(-.4,Math.min(.5,Math.atan2(p.vy,p.vx)));
      if(s.phase==='settling') sprite('impact',p.x-34,p.y-26,68,52,rotation);
      else {
        const spriteKey=AMMO[p.ammoType||'impact'].sprite;
        const frame=art.atlas.sprites[spriteKey];
        const [sx,sy,sw,sh]=frame.rect;
        const body=spriteKey==='fly'?FLIGHT_BODY:{x:sw/2,y:sh/2,radius:Math.min(sw,sh)/2};
        const scale=WORLD.radius/body.radius;
        const visualY=p.y<0?WORLD.radius+4:p.y;
        ctx.save();ctx.translate(p.x,visualY);ctx.rotate(rotation);
        ctx.drawImage(art.images[frame.file],sx,sy,sw,sh,-body.x*scale,-body.y*scale,sw*scale,sh*scale);
        ctx.restore();
      }
      if(p.y<0){ctx.font='bold 20px system-ui';ctx.textAlign='center';ctx.fillStyle='#153745';ctx.fillText('↑ 티노',p.x,85);}

    }
    for(const e of s.events.filter(e=>e.type==='impact'&&s.time-e.time<.65)){
      const age=s.time-e.time;
      sprite('dust',e.x-72,e.y-30,144,87,0,reducedMotion?.6:1-age/.65);
    }
  }
  function badgeUrl(){
    const frame=art.atlas.sprites.badge;const c=document.createElement('canvas');c.width=120;c.height=132;
    c.getContext('2d').drawImage(art.images[frame.file],...frame.rect,0,0,c.width,c.height);return c.toDataURL();
  }
  function spriteUrl(key){const frame=art.atlas.sprites[key],c=document.createElement('canvas');c.width=96;c.height=72;c.getContext('2d').drawImage(art.images[frame.file],...frame.rect,0,0,96,72);return c.toDataURL();}
  return {render,badgeUrl,spriteUrl};
}
