/** Pure, deterministic fixed-step combat. No DOM, timers, or random sources. */
export const WIDTH = 960;
export const STEP = 1 / 60;
export const UNITS = {
  melee: { name: '가드 티노', cost: 50, cooldown: 3, hp: 260, damage: 7, interval: 1.1, range: 34, speed: 32, size: 66 },
  tank: { name: '메카 티노', cost: 180, cooldown: 9, hp: 430, damage: 48, interval: 2.1, range: 46, splash: 65, speed: 20, size: 80 },
  ranged: { name: '펄스 티노', cost: 100, cooldown: 5, hp: 110, damage: 27, interval: 1.4, range: 155, speed: 28, size: 70 },
};
export const ENEMIES = {
  scout: { hp: 100, damage: 20, interval: 1, range: 30, speed: 42, size: 62, bounty: 8 },
  brute: { hp: 430, damage: 40, interval: 1.7, range: 38, speed: 18, size: 86, bounty: 20 },
  shooter: { hp: 150, damage: 30, interval: 1.6, range: 180, speed: 25, size: 68, bounty: 18 },
  boss: { hp: 1300, damage: 65, interval: 2.8, range: 55, splash: 85, speed: 12, size: 132, bounty: 60 },
};
export const WAVES = [
  ...[5, 13, 21, 29].map(at => ({ at, title: '오류 주자 접근', units: ['scout', 'scout'] })),
  ...[33, 45, 57, 69, 81].map(at => ({ at, title: '철갑 운반체 접근', units: ['brute', 'scout', 'scout'] })),
  ...[45, 63, 81].map(at => ({ at, title: '스파크 드론 접근', units: ['shooter'] })),
  { at: 95, title: '과부하 크롤러', units: ['boss', 'shooter', 'scout'] },
  ...[115, 135, 155].map(at => ({ at, title: '마지막 지원군', units: ['brute', 'shooter', 'scout'] })),
].sort((a, b) => a.at - b.at);
export const BOSS_AT = WAVES.find(w => w.units.includes('boss')).at;
export function createGame() {
  return { phase: 'ready', time: 0, energy: 150, cap: 400, income: 9, level: 0,
    bases: { ally: 1100, enemy: 1500 }, maxBases: { ally: 1100, enemy: 1500 },
    units: [], projectiles: [], events: [], pending: [], cooldowns: { melee: 0, tank: 0, ranged: 0, support: 30 },
    wave: 0, nextId: 1, kills: 0, summoned: 0, bossDefeated: false };
}
export function emit(s, type, data = {}) { s.events.push({ type, time: s.time, ...data }); }
export function spawn(s, kind, team = 'ally') {
  const stats = (team === 'ally' ? UNITS : ENEMIES)[kind];
  if (!stats || s.units.filter(u => u.team === team).length >= (team === 'ally' ? 12 : 14)) return null;
  const u = { ...stats, id: s.nextId++, kind, team, x: team === 'ally' ? 82 : 878,
    maxHp: stats.hp, attack: 0, windup: 0, strike: null, action: 'walk', flash: 0, pose: 0, knock: 0 };
  s.units.push(u);
  emit(s, 'spawn', { x: u.x, team, kind });
  return u;
}
export function command(s, action, kind) {
  if (action === 'start' && s.phase === 'ready') { s.phase = 'playing'; return true; }
  if (action === 'pause' && s.phase === 'playing') { s.phase = 'paused'; return true; }
  if (action === 'resume' && s.phase === 'paused') { s.phase = 'playing'; return true; }
  if (s.phase !== 'playing') return false;
  if (action === 'summon') {
    const u = UNITS[kind];
    if (!u || s.energy < u.cost || s.cooldowns[kind] > 0 || s.units.filter(u => u.team === 'ally').length >= 12) return false;
    s.energy -= u.cost; s.cooldowns[kind] = u.cooldown; s.summoned++; spawn(s, kind); return true;
  }
  if (action === 'upgrade' && !s.level && s.energy >= 160) {
    s.energy -= 160; s.level = 1; s.income = 12; s.cap = 500; emit(s, 'upgrade'); return true;
  }
  if (action === 'support' && s.cooldowns.support <= 0) {
    const targets = s.units.filter(u => u.team === 'enemy' && u.x < WIDTH * .55);
    if (!targets.length) return false;
    s.cooldowns.support = 35;
    for (const u of targets) { u.hp -= 90; u.flash = .25; u.knock = 25; }
    emit(s, 'support'); return true;
  }
  return false;
}
function hit(s, attacker, target, amount) {
  if (target.base) {
    s.bases[target.team] = Math.max(0, s.bases[target.team] - amount);
    emit(s, 'baseHit', { team: target.team, x: target.x, amount });
  } else {
    target.hp -= amount; target.flash = .16;
    target.knock = Math.max(target.knock, attacker.kind === 'boss' ? 18 : 4);
    emit(s, 'hit', { x: target.x, amount, team: target.team });
  }
}
export function step(s, dt = STEP) {
  if (s.phase !== 'playing') return;
  // A caller must subdivide long frames: never skip collisions or cooldowns.
  dt = Math.min(Math.max(dt, 0), .05);
  s.time += dt;
  s.events = s.events.filter(e => s.time - e.time < 1.2);
  s.energy = Math.min(s.cap, s.energy + s.income * dt);
  for (const key of Object.keys(s.cooldowns)) s.cooldowns[key] = Math.max(0, s.cooldowns[key] - dt);
  while (s.wave < WAVES.length && s.time >= WAVES[s.wave].at) {
    const wave = WAVES[s.wave++];
    wave.units.forEach((kind, i) => s.pending.push({ at: wave.at + i * 2.5, kind }));
    emit(s, 'wave', { title: wave.title });
  }
  s.pending = s.pending.filter(p => p.at > s.time || !spawn(s, p.kind, 'enemy'));
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const dir = u.team === 'ally' ? 1 : -1;
    u.attack = Math.max(0, u.attack - dt); u.flash = Math.max(0, u.flash - dt); u.pose = Math.max(0, u.pose - dt);
    if (u.knock > 0) { const d = Math.min(u.knock, dt * 70); u.x -= dir * d; u.knock -= d; }
    const foes = s.units.filter(v => v.team !== u.team && v.hp > 0 && (v.x - u.x) * dir >= -18);
    foes.sort((a, b) => Math.abs(a.x - u.x) - Math.abs(b.x - u.x) || a.id - b.id);
    const enemyTeam = u.team === 'ally' ? 'enemy' : 'ally';
    const target = foes[0] || { base: true, team: enemyTeam, x: u.team === 'ally' ? 890 : 70 };
    const distance = Math.abs(target.x - u.x);
    if (u.strike) {
      u.windup -= dt;
      u.action = 'attack';
      if (u.windup <= 0) {
        const victim = u.strike.base ? u.strike : s.units.find(v => v.id === u.strike.id && v.hp > 0);
        if (victim && Math.abs(victim.x - u.x) <= u.range + 28) {
          if (u.range > 100) s.projectiles.push({ x: u.x, targetId: victim.id, targetTeam: victim.team, base: victim.base, targetX: victim.x, team: u.team, damage: u.damage, speed: 340 });
          else {
            hit(s, u, victim, u.damage);
            if (u.splash && !victim.base) {
              for (const other of foes.filter(v => v.id !== victim.id && Math.abs(v.x - victim.x) < u.splash)) hit(s, u, other, u.damage * .6);
            }
          }
        }
        u.strike = null; u.pose = .18;
      }
    } else if (distance <= u.range) {
      u.action = u.pose > 0 ? 'attack' : 'idle';
      if (u.attack <= 0) {
        u.attack = u.interval;
        u.windup = u.kind === 'boss' ? .85 : u.kind === 'tank' ? .4 : .22;
        u.strike = { id: target.id, base: target.base, team: target.team, x: target.x };
        u.action = 'attack';
      }
    } else {
      const front = s.units.filter(v => v.team === u.team && v.id !== u.id && v.hp > 0 && (v.x - u.x) * dir > 0 && (v.x - u.x) * dir < 20);
      // A shallow staggered formation, without making slow melee obstruct ranged reach.
      const spacing = front.some(v => v.range === u.range) ? .2 : 1;
      u.x += dir * Math.min(u.speed * dt * spacing, Math.max(0, distance - u.range));
      u.action = 'walk';
    }
    u.x = Math.max(70, Math.min(890, u.x));
  }
  for (const p of s.projectiles) {
    const target = p.base ? { base: true, team: p.targetTeam, x: p.targetX } : s.units.find(u => u.id === p.targetId && u.hp > 0);
    if (!target) { p.done = true; continue; }
    const d = target.x - p.x;
    if (Math.abs(d) <= p.speed * dt) { hit(s, p, target, p.damage); p.done = true; }
    else p.x += Math.sign(d) * p.speed * dt;
  }
  s.projectiles = s.projectiles.filter(p => !p.done);
  for (const u of s.units.filter(u => u.hp <= 0)) {
    emit(s, 'defeat', { x: u.x, kind: u.kind, team: u.team, unit: { ...u, action: 'hurt', flash: 1 } });
    if (u.team === 'enemy') { s.energy = Math.min(s.cap, s.energy + u.bounty); s.kills++; if (u.kind === 'boss') s.bossDefeated = true; }
  }
  s.units = s.units.filter(u => u.hp > 0);
  if (s.bases.ally <= 0) s.phase = 'lost';
  else if (s.bases.enemy <= 0) s.phase = 'won';
}
