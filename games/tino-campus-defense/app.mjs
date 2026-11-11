import { createGame, command, step, STEP, UNITS, WAVES, BOSS_AT, STRUCTURES, BUILD_SLOTS, scoreGame } from './engine.mjs';
import { loadArt, createRenderer, portrait } from './renderer.mjs';
const $ = selector => document.querySelector(selector);
const root = $('#game');
const unitButtons = [...document.querySelectorAll('[data-unit]')];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = createGame();
let runId = '';
let resultSent = false;
let renderer;
let frame = 0;
let last = 0;
let remainder = 0;
let lastUi = 0;
let summaryAt = -10;
let warning = '';
let furthestAdvance = 0;
let advanceAt = 0;
const timeLabel = seconds => `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${Math.floor(seconds % 60).toString().padStart(2,'0')}`;
function announce(text) { $('#announcement').textContent = text; }
function availability(kind) {
  const u = UNITS[kind];
  if (state.phase !== 'playing') return '시작 대기';
  if (state.units.filter(u => u.team === 'ally' && !u.structure).length >= 12) return '팀 가득 참';
  if (state.cooldowns[kind] > 0) return `${state.cooldowns[kind].toFixed(1)}초 준비`;
  if (state.energy < u.cost) return `에너지 ${Math.ceil(u.cost - state.energy)} 부족`;
  return '소환 가능';
}
function updateUi() {
  const playing = state.phase === 'playing';
  $('#energy').textContent = Math.floor(state.energy);
  $('#capacity').textContent = ` / ${state.cap}`;
  $('#income').textContent = `+${state.income} / 초`;
  $('#clock').textContent = timeLabel(state.time);
  $('#population').textContent = `팀 ${state.units.filter(u => u.team === 'ally' && !u.structure).length} / 12`;
  for (const team of ['ally', 'enemy']) {
    $(`#${team}-hp`).value = state.bases[team];
    $(`#${team}-value`).textContent = `${Math.ceil(state.bases[team])} / ${state.maxBases[team]}`;
  }
  for (const button of unitButtons) {
    const kind = button.dataset.unit, reason = availability(kind);
    button.disabled = !playing || reason !== '소환 가능';
    const count = state.units.filter(u => u.team === 'ally' && u.kind === kind).length;
    button.querySelector('.role-count').textContent = `전장 ${count}`;
    button.querySelector('.availability').textContent = playing ? reason : state.phase === 'paused' ? '일시정지' : '시작 후 소환';
    button.setAttribute('aria-label', `${UNITS[kind].name}, ${UNITS[kind].cost} 에너지, ${button.querySelector('.availability').textContent}`);
  }
  const slot = Number($('#build-slot').value);
  const occupied = state.units.some(u => u.structure && u.slot === slot);
  const threatened = state.units.some(u => u.team === 'enemy' && u.x < BUILD_SLOTS[slot] + 45);
  for (const b of document.querySelectorAll('[data-build]')) b.disabled = !playing || occupied || threatened || state.energy < STRUCTURES[b.dataset.build].cost;
  $('#build-note').textContent = occupied ? '이 패드는 사용 중입니다. 다른 위치를 골라 주세요.' : threatened ? '적이 넘어온 패드입니다. 후방 위치를 선택하세요.' : '위치 선택 후 설치 · 방벽은 길을 막고 포탑은 뒤에서 지원합니다.';
  $('#upgrade').disabled = !playing || state.level > 0 || state.energy < 160;
  $('#upgrade span').textContent = state.level ? '완료 · 수입 +3 / 초' : '160 · 수입 +3 / 초';
  const inReach = state.units.some(u => u.team === 'enemy' && u.x < 528);
  $('#support').disabled = !playing || state.cooldowns.support > 0 || !inReach;
  $('#support span').textContent = state.cooldowns.support > 0 ? `${Math.ceil(state.cooldowns.support)}초 뒤 준비` : !inReach ? '우리 진영 안에 적이 없습니다' : '우리 쪽 55% 안의 적에게 90 피해';
  $('#pause').disabled = !['playing', 'paused'].includes(state.phase);
  $('#pause').innerHTML = state.phase === 'paused' ? '계속하기 <kbd>P</kbd>' : '일시정지 <kbd>P</kbd>';
  const next = WAVES[state.wave];
  const bossSoon = state.time >= BOSS_AT - 5 && state.time < BOSS_AT;
  $('#phase-label').textContent = state.phase === 'ready' ? '작전 준비' : state.phase === 'paused' ? '일시정지' : state.time < 35 ? '01 / 첫 교대' : state.time < 70 ? '02 / 전선 구축' : state.time < BOSS_AT ? '03 / 과부하' : '04 / 마지막 돌파';
  $('#wave-note').textContent = bossSoon ? `경고 · 과부하 크롤러 ${Math.ceil(BOSS_AT-state.time)}초` : next ? `${next.title} · ${Math.ceil(next.at-state.time)}초` : '마지막 기지를 무너뜨리세요';
  if (bossSoon && warning !== 'boss') { warning = 'boss'; announce('5초 뒤 과부하 크롤러가 나타납니다. 전선을 정비하세요.'); }
  if (state.time - summaryAt > 5) {
    summaryAt = state.time;
    const allies = state.units.filter(u => u.team === 'ally' && !u.structure).length;
    const foes = state.units.filter(u => u.team === 'enemy').length;
    const boss = state.units.find(u => u.kind === 'boss');
    const frontline = state.units.filter(u => u.team === 'enemy').reduce((min,u) => Math.min(min,u.x),960);
    const friendlies = state.units.filter(u => u.team === 'ally');
    const advance = friendlies.reduce((max,u) => Math.max(max,u.x),0);
    if (advance > furthestAdvance + 25) { furthestAdvance = advance; advanceAt = state.time; }
    const guardHeavy = friendlies.length >= 3 && friendlies.filter(u => u.kind === 'melee').length / friendlies.length > .7;
    const stalled = guardHeavy && state.time > 80 && state.time - advanceAt > 25;
    const pressure = stalled ? '가드는 버티는 역할이에요. 펄스와 메카를 더하면 전선을 밀 수 있어요.' : frontline < 240 ? '작업실이 위험해요. 가드와 지원 펄스를 준비하세요.' : '가드 뒤에서 펄스가 안전하게 공격해요.';
    $('#battle-summary').textContent = `아군 ${allies} · 적 ${foes}${boss ? ` · 크롤러 ${Math.ceil(boss.hp)} HP` : ''}. ${pressure} ${state.level ? '공학 개선 완료.' : '공학 개선 160 에너지.'}`;
  }
}
function showCover(title, description, button, kicker) {
  $('#cover').hidden = false;
  $('#cover-title').textContent = title;
  $('#cover-description').textContent = description;
  $('#cover-kicker').textContent = kicker;
  $('#start').textContent = button;
}
function endGame() {
  const won = state.phase === 'won';
  if (!resultSent) {
    resultSent = true;
    const detail = { game: 'campus-line', score: scoreGame(state), runId };
    window.dispatchEvent(new CustomEvent('idiots:game-result', { detail }));
    if (window.parent !== window) window.parent.postMessage({ type: 'idiots:game-result', ...detail }, location.origin);
  }
  showCover(won ? '작업실의 불을 지켰어요.' : '오늘은 잠깐, 쉬어가기.', won ? `${timeLabel(state.time)} · ${state.summoned}명의 티노가 함께했어요. 다른 조합으로 다시 도전해 보세요.` : '가드로 펄스를 보호해 보세요. 위급할 땐 동아리 펄스, 여유가 생기면 공학 업그레이드.', '다시 플레이', won ? 'MISSION COMPLETE' : 'RETRY / 다시 할 수 있어요');
  $('#cover-meta').textContent = `처치 ${state.kills} · 공학 개선 ${state.level ? '완료' : '미사용'}`;
  $('#battle-summary').textContent = won ? `작전 완료 · ${timeLabel(state.time)} · ${state.kills}기 정리. 작업실을 지켰습니다.` : `작전 종료 · ${timeLabel(state.time)}. 가드로 앞을 지키고, 펄스와 메카를 조합해 다시 도전하세요.`;
  announce(won ? '승리! 기계 소굴을 멈췄습니다.' : '작업실을 지키지 못했습니다. 다시 플레이할 수 있습니다.');
  $('#start').focus({ preventScroll: true });
}
function loop(now) {
  frame = 0;
  if (state.phase !== 'playing') return;
  const delta = last ? Math.min((now-last)/1000, .1) : 0;
  last = now; remainder += delta;
  while (remainder >= STEP && state.phase === 'playing') { step(state, STEP); remainder -= STEP; }
  renderer.render(state);
  if (now-lastUi > 100) { updateUi(); lastUi = now; }
  if (state.phase === 'playing') frame = requestAnimationFrame(loop);
  else { updateUi(); endGame(); }
}
function run() {
  cancelAnimationFrame(frame); last = 0; remainder = 0;
  $('#cover').hidden = true; updateUi(); renderer.render(state);
  frame = requestAnimationFrame(loop);
}
function pause() {
  if (!command(state, 'pause')) return;
  cancelAnimationFrame(frame); frame = 0;
  showCover('잠깐 쉬어가요.', '전투와 에너지 시간이 멈췄습니다. 준비되면 계속해 주세요.', '계속하기', 'PAUSED');
  updateUi(); announce('일시정지했습니다.');
}
$('#start').addEventListener('click', () => {
  if (state.phase === 'paused') command(state, 'resume');
  else { runId = globalThis.crypto?.randomUUID?.() || `campus-${Date.now()}-${Math.random().toString(36).slice(2)}`; resultSent = false; state = createGame(); command(state, 'start'); summaryAt = -10; warning = ''; furthestAdvance = 0; advanceAt = 0; }
  $('#cover-meta').textContent = '보통 3~5분 · 직접 시작 · 이 기기 점수 저장 · 과금 없음';
  root.focus({ preventScroll: true }); run();
});
function action(action, kind) {
  if (command(state, action, kind)) {
    if (action === 'summon') announce(`${UNITS[kind].name} 합류.`);
    if (action === 'build') announce(`${STRUCTURES[kind.split(':')[0]].name} 설치 완료.`);
    if (action === 'upgrade') announce('공학 개선 완료. 초당 에너지가 12로 늘었습니다.');
    if (action === 'support') announce('동아리 펄스! 우리 진영 안의 적을 밀어냈습니다.');
    updateUi();
  }
}
for (const button of unitButtons) button.addEventListener('click', () => action('summon', button.dataset.unit));
for (const b of document.querySelectorAll('[data-build]')) b.addEventListener('click', () => action('build', `${b.dataset.build}:${$('#build-slot').value}`));
$('#build-slot').addEventListener('change', updateUi);
$('#upgrade').addEventListener('click', () => action('upgrade'));
$('#support').addEventListener('click', () => action('support'));
$('#pause').addEventListener('click', () => {
  if (state.phase === 'paused') { command(state, 'resume'); run(); }
  else pause();
});
function closeHelp() { $('#guide').hidden = true; $('#help').setAttribute('aria-expanded', 'false'); $('#help').focus(); }
$('#help').addEventListener('click', () => {
  if (!$('#guide').hidden) { closeHelp(); return; }
  if (state.phase === 'playing') pause();
  $('#guide').hidden = false; $('#help').setAttribute('aria-expanded', 'true'); $('#close-help').focus();
});
$('#close-help').addEventListener('click', closeHelp);
root.addEventListener('keydown', event => {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') { if (!$('#guide').hidden) closeHelp(); else pause(); return; }
  if (key === 'p' || (key === ' ' && event.target.tagName !== 'BUTTON' && event.target.tagName !== 'A')) {
    event.preventDefault(); if (state.phase === 'paused') { command(state, 'resume'); run(); } else pause(); return;
  }
  const unit = { '1': 'melee', '2': 'ranged', '3': 'tank', '4': 'sniper' }[key];
  if (unit) { event.preventDefault(); action('summon', unit); }
  if (key === 'b' || key === 't') action('build', `${key === 'b' ? 'barricade' : 'turret'}:${$('#build-slot').value}`);
  if (key === 'u') action('upgrade');
  if (key === 'e') action('support');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', () => { pause(); cancelAnimationFrame(frame); });
try {
  const art = await loadArt();
  renderer = createRenderer($('#stage'), art, reduced);
  for (const img of document.querySelectorAll('[data-portrait]')) img.src = portrait(art, img.dataset.portrait);
  renderer.render(state); $('#start').disabled = false; $('#start').textContent = '작전 시작'; updateUi();
} catch (error) {
  $('#cover-title').textContent = '그림을 불러오지 못했어요.';
  $('#cover-description').textContent = '연결을 확인하고 페이지를 새로고침해 주세요. 게임은 아직 시작하지 않았습니다.';
  $('#start').textContent = '새로고침이 필요합니다';
  console.error('Campus Line asset load failed', error);
}
