const KEYS = { sniper: 'pulse', melee: 'guard', ranged: 'pulse', tank: 'mecha', scout: 'runner', brute: 'hauler', shooter: 'drone', boss: 'boss' };
const files = { barricade: 'barricade.svg', turret: 'turret.svg', background: 'campus-battlefield.png', ally: 'tino-units.png', action: 'tino-actions.png', enemy: 'scrap-enemies.png' };
export async function loadArt() {
  const art = {};
  art.atlas = await fetch(new URL('art/atlas.json', import.meta.url)).then(r => { if (!r.ok) throw new Error('Missing atlas'); return r.json(); });
  await Promise.all(Object.entries(files).map(async ([key, file]) => {
    const image = new Image(); image.src = new URL(`art/${file}`, import.meta.url);
    await image.decode(); art[key] = image;
  }));
  return art;
}
export function portrait(art, kind) {
  const c = document.createElement('canvas'); c.width = 192; c.height = 192;
  const ctx = c.getContext('2d');
  const frame = art.atlas.units[KEYS[kind]].frames.idle;
  const [x, y, w, h] = frame.rect;
  ctx.drawImage(art.ally, x, y, w, h, 0, (192 - h * 192 / w) / 2, 192, h * 192 / w);
  return c.toDataURL();
}
export function createRenderer(canvas, art, reducedMotion) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let mobile = false;
  let currentState = null;
  function resize() {
    mobile = canvas.clientWidth < 680;
    canvas.width = 960;
    canvas.height = 480;
    ctx.imageSmoothingEnabled = false;
    if (currentState) render(currentState);
  }
  resize();
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function sprite(unit, time, ground, alpha = 1) {
    if (unit.structure) {
      const size = mobile ? 106 : 85;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.drawImage(art[unit.kind], unit.x - size / 2, ground - size + 8, size, size);
      ctx.fillStyle = '#142d37'; ctx.fillRect(unit.x-26,ground-size-4,52,5);
      ctx.fillStyle = '#a4dfc3'; ctx.fillRect(unit.x-25,ground-size-3,50*Math.max(0,unit.hp/unit.maxHp),3);
      ctx.restore(); return;
    }
    let frame = unit.action === 'walk' ? (unit.team === 'ally' ? 'walkA' : 'walk') : unit.action === 'attack' ? 'attack' : 'idle';
    if (unit.action === 'victory' && unit.team === 'ally') frame = 'victory';
    if (unit.flash > 0) frame = 'hurt';
    else if (unit.team === 'ally') {
      if (unit.action === 'walk' && Math.floor(time * 7) % 2) frame = 'walkB';
      if (unit.action === 'attack') frame = unit.windup > .1 ? 'anticipation' : 'impact';
    }
    const frames = art.atlas.units[KEYS[unit.kind]].frames;
    const definition = frames[frame] || frames.attack || frames.idle;
    const image = Object.entries(files).find(([, file]) => file === definition.file)[0];
    const [sx, sy, sw, sh] = definition.rect;
    const height = unit.size * (mobile ? 2.2 : 1.25);
    const scale = height / sh;
    const width = sw * scale;
    const anchorX = definition.anchor[0] * scale;
    // Keep oversized spawn silhouettes visible without changing combat coordinates.
    const renderX = Math.max(anchorX, Math.min(960 - width + anchorX, unit.x));
    const lane = (unit.id % 3 - 1) * (mobile ? 14 : 6);
    const y = ground + lane;
    const sway = reducedMotion ? 0 : unit.action === 'walk' ? Math.sin(time * 9 + unit.id) * 1.2 : 0;
    ctx.save(); ctx.globalAlpha = alpha;
    if (unit.kind === 'sniper') ctx.filter = 'hue-rotate(28deg)';
    ctx.drawImage(art[image], sx, sy, sw, sh, renderX - anchorX, y - definition.anchor[1] * scale + sway, width, height);
    ctx.filter = 'none';
    if (unit.hp < unit.maxHp) {
      const barWidth = mobile ? 64 : 44;
      const barHeight = mobile ? 8 : 5;
      ctx.fillStyle = '#10222e'; ctx.fillRect(renderX - barWidth / 2, y - height - 9, barWidth, barHeight);
      ctx.fillStyle = unit.team === 'ally' ? '#a4dfc3' : '#f1b58c';
      ctx.fillRect(renderX - barWidth / 2 + 1, y - height - 8, (barWidth - 2) * Math.max(0, unit.hp / unit.maxHp), barHeight - 2);
    }
    if (unit.kind === 'boss' && unit.windup > 0) {
      ctx.strokeStyle = '#ffb46b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(unit.x - 90, y + 3); ctx.lineTo(unit.x + 25, y + 3); ctx.stroke();
    }
    ctx.restore();
  }
  function render(s) {
    currentState = s;
    const h = canvas.height, ground = h - 95;
    // Keep the authored 2:1 battlefield intact on every viewport.
    ctx.drawImage(art.background, 0, 0, 960, 480);
    // Dusk slowly advances with the encounter, never obscuring actors or HUD.
    ctx.fillStyle = `rgba(10,24,51,${Math.min(.12, s.time / 2000)})`; ctx.fillRect(0, 0, 960, h);
    for (const [i,x] of [210,350,490].entries()) {
      ctx.fillStyle = '#a3c4b977'; ctx.fillRect(x-30,ground+9,60,3);
      ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText(`PAD 0${i+1}`,x,ground+25);
    }
    if (s.phase === 'ready') {
      sprite({ team: 'ally', kind: 'melee', action: 'idle', x: 190, id: 0, size: 80, hp: 1, maxHp: 1 }, 0, ground);
      sprite({ team: 'ally', kind: 'ranged', action: 'idle', x: 260, id: 1, size: 74, hp: 1, maxHp: 1 }, 0, ground);
    }
    for (const unit of [...s.units].sort((a,b) => a.id % 3 - b.id % 3)) sprite(s.phase === 'won' && unit.team === 'ally' ? { ...unit, action: 'victory' } : unit, s.time, ground);
    for (const p of s.projectiles) {
      const effect = art.atlas.effects[p.team === 'ally' ? 'allyPulse' : 'enemyPulse'];
      const imageKey = Object.entries(files).find(([, file]) => file === effect.file)[0];
      const [sx, sy, sw, sh] = effect.rect;
      const [width, height] = effect.displaySize;
      ctx.drawImage(art[imageKey], sx, sy, sw, sh, p.x - effect.anchor[0] * width / sw, ground - 50 - effect.anchor[1] * height / sh, width, height);
    }
    for (const event of s.events) {
      const age = s.time - event.time;
      if (event.type === 'defeat' && age < .45) sprite(event.unit, s.time, ground, 1-age/.45);
      if (event.type === 'support' && age < .6) {
        const gradient = ctx.createLinearGradient(0, 0, 530, 0);
        gradient.addColorStop(0, `rgba(123,222,214,${(1-age/.6)*.36})`); gradient.addColorStop(1, 'rgba(123,222,214,0)');
        ctx.fillStyle = gradient; ctx.fillRect(0, ground - 140, 530, 160);
      }
      if (event.type === 'hit' && age < .5 && !reducedMotion) {
        ctx.font = `bold ${mobile ? 28 : 13}px system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = event.team === 'enemy' ? '#fff0bc' : '#ffceb2';
        ctx.globalAlpha = 1-age/.5; ctx.fillText(Math.round(event.amount), event.x, ground - 85 - age * 30); ctx.globalAlpha = 1;
      }
      if (event.type === 'baseHit' && age < .15) {
        ctx.fillStyle = '#ffc07b33'; ctx.fillRect(event.team === 'ally' ? 0 : 830, ground-130, 130, 145);
      }
    }
  }
  return { render, destroy() { observer.disconnect(); } };
}
