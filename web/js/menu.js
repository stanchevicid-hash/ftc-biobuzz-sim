// Start screen: a game-style main menu over the live field, with mouse, arrows + Enter, or a gamepad (d-pad + A).
// The logo in the top bar or Esc brings it back.
import { readGamepads } from './input.js';
import { cue } from './sounds.js';
import { HELP_HTML } from './help.js';
import { LEGAL_HTML } from './legal.js';

const SOCIAL = `
  <a href="https://www.instagram.com/asa.ftc_md/" target="_blank" rel="noopener" aria-label="ASA on Instagram" title="@asa.ftc_md">
    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" class="fill"/></svg></a>
  <a href="https://www.tiktok.com/@ftc.team.asa" target="_blank" rel="noopener" aria-label="ASA on TikTok" title="@ftc.team.asa">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/></svg></a>`;

const ITEMS = [
  { id: 'missions', label: 'Missions', tab: 'ds', hint: 'Timed challenges, stars, records' },
  { id: 'bots', label: 'Match vs bots', tab: 'ds', hint: '2 v 2, full scoring' },
  { id: 'robot', label: 'Robot', tab: 'robot', hint: 'Load, wire and inspect your robot' },
  { id: 'dh', label: 'Driver Hub', tab: 'dh', hint: 'Run your OpModes' },
  { id: 'bench', label: 'Tests', tab: 'bench', hint: 'Shooter, intake, drivetrain, lift' },
  { id: 'code', label: 'Code', tab: 'code', hint: 'Your Java OpModes' },
  { id: 'settings', label: 'Settings', tab: 'settings', hint: 'Graphics, sound, gamepads' },
];

export function initMenu(app, { switchTab, game }) {
  const el = document.getElementById('menu');
  let idx = 0, prevPad = {};
  // asked on every launch; the last number is pre-filled so Enter is enough
  let team = '', saved = ''; try { saved = localStorage.getItem('ftcsim.team') || ''; } catch { }
  el.innerHTML = `
    <div class="menu-side">
      <h1 class="menu-title">BIOBUZZ<small>FTC 2026-27 simulator</small></h1>
      <form id="menuTeam" class="menu-team" autocomplete="off">
        <label for="teamNo">Team number</label>
        <div><input id="teamNo" inputmode="numeric" pattern="[0-9]{1,5}" maxlength="5" placeholder="28284" required></div>
        <label for="teamName">Your name</label>
        <div><input id="teamName" maxlength="24" placeholder="First name" required><button class="primary">Play</button></div>
        <small class="menu-note">Shown in the public Teams list. <button type="button" class="link" data-dlg="legal">Legal</button></small>
      </form>
      <nav class="menu-list" aria-label="Main menu">${ITEMS.map((it, i) => `<button data-i="${i}" title="${it.hint}">${it.label}</button>`).join('')}</nav>
      <p class="menu-keys"><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> or a gamepad</p>
    </div>
    <div class="menu-foot">
      <a class="menu-asa" href="https://www.instagram.com/asa.ftc_md/" target="_blank" rel="noopener" title="Made by ASA, FTC team 28284">
        <img src="assets/asa-logo.webp" alt="ASA" width="44" height="44"><span>Made by <b>ASA</b><small>FTC 28284</small></span></a>
      <nav class="menu-social follow" aria-label="Follow ASA"><span>Follow us</span>${SOCIAL}</nav>
      <button id="menuTeamBtn" title="Change team or name"></button>
      <button data-dlg="teams">Teams</button>
      <button data-dlg="help">Help</button>
      <button data-dlg="legal">Legal</button>
    </div>
    <dialog id="menuDlg" class="menu-dlg"><form method="dialog"><h2></h2><div class="dlg-body"></div><button class="primary">Close</button></form></dialog>`;
  // every section: follow links in the top bar
  document.getElementById('server').insertAdjacentHTML('beforebegin', `<nav class="follow top-follow" aria-label="Follow ASA"><span>Follow us</span>${SOCIAL}</nav>`);
  const form = el.querySelector('#menuTeam'), teamIn = el.querySelector('#teamNo'), nameIn = el.querySelector('#teamName');
  let player = '';
  // /api/teams: local Java server (data/teams.json) or the Netlify function (Blobs); null when neither answers
  const teamsApi = (body) => fetch('api/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  // Teams, Help and Legal open over the menu; the game stays behind it
  const dlg = el.querySelector('#menuDlg'), box = dlg.querySelector('.dlg-body');
  const DLG = { help: ['Help', HELP_HTML], legal: ['Legal', LEGAL_HTML] };
  el.querySelectorAll('[data-dlg]').forEach(b => { b.onclick = () => openDlg(b.dataset.dlg); });
  async function openDlg(id) {
    dlg.querySelector('h2').textContent = DLG[id]?.[0] || 'Teams';
    if (DLG[id]) { box.innerHTML = DLG[id][1]; dlg.showModal(); box.scrollTop = 0; return; }
    box.textContent = 'Loading'; dlg.showModal();
    const r = await teamsApi();
    if (!r) { box.textContent = 'The list is not reachable right now.'; return; }
    const rows = [...r.teams].sort((a, b) => b.visits - a.visits);
    box.innerHTML = rows.length ? `<table><thead><tr><th>Team</th><th>Name</th><th>Visits</th></tr></thead><tbody>${rows.map(m =>
      `<tr><td>${esc(m.team)}</td><td>${esc(m.name)}</td><td>${+m.visits || 0}</td></tr>`).join('')}</tbody></table>` : 'No one yet.';
  }
  const showTeam = () => {
    const asking = !team;
    form.classList.toggle('hidden', !asking);
    el.querySelector('.menu-list').classList.toggle('hidden', asking); el.querySelector('.menu-keys').classList.toggle('hidden', asking);
    el.querySelector('#menuTeamBtn').textContent = team ? team + ' ' + player : '';
    app.team = team;
    const name = document.getElementById('dhRobot'); if (name) name.textContent = (team || '28284') + '-RC';
    if (asking) requestAnimationFrame(() => teamIn.focus()); else requestAnimationFrame(() => focus(idx));
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = teamIn.value.trim();
    if (!/^\d{1,5}$/.test(v)) { teamIn.setCustomValidity('Up to 5 digits, like 28284'); teamIn.reportValidity(); return; }
    const n = nameIn.value.replace(/[<>]/g, '').trim();
    if (!n) { nameIn.reportValidity(); return; }
    teamIn.setCustomValidity(''); team = String(+v); player = n;
    try { localStorage.setItem('ftcsim.team', team); } catch { }
    teamsApi({ team, name: player });
    cue('chime'); showTeam();
  };
  teamIn.oninput = () => teamIn.setCustomValidity('');
  el.querySelector('#menuTeamBtn').onclick = () => { teamIn.value = team; nameIn.value = player; team = ''; showTeam(); };
  const buttons = [...el.querySelectorAll('.menu-list button')];
  const focus = (i) => { idx = (i + buttons.length) % buttons.length; buttons.forEach((b, k) => b.classList.toggle('on', k === idx)); buttons[idx].focus({ preventScroll: true }); };
  buttons.forEach((b, i) => { b.onmouseenter = () => focus(i); b.onclick = () => choose(i); });

  function open() {
    document.body.classList.add('menu-open'); app.menuOpen = true;
    if (app.renderer.showCam) { app.renderer.showCam = false; app.menuHidCam = true; }   // no webcam inset over the menu
    app.renderer.setMode('free'); app.renderer.controls.autoRotate = true; app.renderer.controls.autoRotateSpeed = 0.5; app.renderer.dof = true;
    requestAnimationFrame(() => { app.renderer.resize(); showTeam(); });
  }
  function close(tab) {
    document.body.classList.remove('menu-open'); app.menuOpen = false;
    dlg.close();   // a hidden modal would still block every click on the page
    if (app.menuHidCam) { app.renderer.showCam = true; app.menuHidCam = false; }
    app.renderer.controls.autoRotate = false; app.renderer.dof = false; app.renderer.setMode('free');
    switchTab(tab);
  }
  function choose(i) {
    const it = ITEMS[i]; cue('chime');
    close(it.tab);
    if (it.id === 'bots') game.startBots();
  }

  window.addEventListener('keydown', (e) => {
    if (!app.menuOpen) { if (e.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) open(); return; }
    if (!team || dlg.open) return;
    if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); focus(idx + 1); }
    else if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); focus(idx - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(idx); }
  });
  // gamepad: d-pad or left stick to move, A to choose
  (function poll() {
    const g = readGamepads()[0];
    if (app.menuOpen && team && !dlg.open && !g.keyboard) {
      const down = g.dpad_down || g.left_stick_y > 0.6, up = g.dpad_up || g.left_stick_y < -0.6;
      if (down && !prevPad.down) focus(idx + 1);
      if (up && !prevPad.up) focus(idx - 1);
      if (g.a && !prevPad.a) choose(idx);
      prevPad = { down, up, a: g.a };
    }
    requestAnimationFrame(poll);
  })();
  document.querySelector('.brand').onclick = open;
  document.querySelector('.brand').title = 'Main menu (Esc)';
  open();
  return { open };
}
