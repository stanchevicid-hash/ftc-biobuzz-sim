// Start screen: a game-style main menu over the live field, with mouse, arrows + Enter, or a gamepad (d-pad + A).
// The logo in the top bar or Esc brings it back.
import { readGamepads } from './input.js';
import { cue } from './sounds.js';

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
  let team = ''; try { team = localStorage.getItem('ftcsim.team') || ''; } catch { }
  el.innerHTML = `
    <div class="menu-side">
      <h1 class="menu-title">BIOBUZZ<small>FTC 2026-27 simulator</small></h1>
      <form id="menuTeam" class="menu-team" autocomplete="off">
        <label for="teamNo">Team number</label>
        <div><input id="teamNo" inputmode="numeric" pattern="[0-9]{1,5}" maxlength="5" placeholder="28284" required><button class="primary">Play</button></div>
      </form>
      <nav class="menu-list" aria-label="Main menu">${ITEMS.map((it, i) => `<button data-i="${i}" title="${it.hint}">${it.label}</button>`).join('')}</nav>
      <p class="menu-keys"><kbd>↑</kbd><kbd>↓</kbd> <kbd>Enter</kbd> or a gamepad</p>
    </div>
    <div class="menu-foot">
      <a class="menu-asa" href="https://www.instagram.com/asa.ftc_md/" target="_blank" rel="noopener" title="Made by ASA, FTC team 28284">
        <img src="assets/asa-logo.webp" alt="ASA" width="44" height="44"><span>Made by <b>ASA</b><small>FTC 28284</small></span></a>
      <nav class="menu-social" aria-label="ASA on social media">
        <a href="https://www.instagram.com/asa.ftc_md/" target="_blank" rel="noopener" aria-label="Instagram" title="@asa.ftc_md">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" class="fill"/></svg></a>
        <a href="https://www.tiktok.com/@ftc.team.asa" target="_blank" rel="noopener" aria-label="TikTok" title="@ftc.team.asa">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.6"/></svg></a>
      </nav>
      <button id="menuTeamBtn" title="Change team number"></button>
      <button id="menuHelp">Help</button>
    </div>`;
  const form = el.querySelector('#menuTeam'), teamIn = el.querySelector('#teamNo');
  const showTeam = () => {
    const asking = !team;
    form.classList.toggle('hidden', !asking);
    el.querySelector('.menu-list').classList.toggle('hidden', asking); el.querySelector('.menu-keys').classList.toggle('hidden', asking);
    el.querySelector('#menuTeamBtn').textContent = team ? 'Team ' + team : '';
    app.team = team;
    const name = document.getElementById('dhRobot'); if (name) name.textContent = (team || '28284') + '-RC';
    if (asking) requestAnimationFrame(() => teamIn.focus()); else requestAnimationFrame(() => focus(idx));
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = teamIn.value.trim();
    if (!/^\d{1,5}$/.test(v)) { teamIn.setCustomValidity('Up to 5 digits, like 28284'); teamIn.reportValidity(); return; }
    teamIn.setCustomValidity(''); team = String(+v);
    try { localStorage.setItem('ftcsim.team', team); } catch { }
    cue('chime'); showTeam();
  };
  teamIn.oninput = () => teamIn.setCustomValidity('');
  el.querySelector('#menuTeamBtn').onclick = () => { teamIn.value = team; team = ''; showTeam(); };
  const buttons = [...el.querySelectorAll('.menu-list button')];
  const focus = (i) => { idx = (i + buttons.length) % buttons.length; buttons.forEach((b, k) => b.classList.toggle('on', k === idx)); buttons[idx].focus({ preventScroll: true }); };
  buttons.forEach((b, i) => { b.onmouseenter = () => focus(i); b.onclick = () => choose(i); });
  el.querySelector('#menuHelp').onclick = () => close('help');

  function open() {
    document.body.classList.add('menu-open'); app.menuOpen = true;
    if (app.renderer.showCam) { app.renderer.showCam = false; app.menuHidCam = true; }   // no webcam inset over the menu
    app.renderer.setMode('free'); app.renderer.controls.autoRotate = true; app.renderer.controls.autoRotateSpeed = 0.5; app.renderer.dof = true;
    requestAnimationFrame(() => { app.renderer.resize(); showTeam(); });
  }
  function close(tab) {
    document.body.classList.remove('menu-open'); app.menuOpen = false;
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
    if (!team) return;
    if (['ArrowDown', 'KeyS'].includes(e.code)) { e.preventDefault(); focus(idx + 1); }
    else if (['ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); focus(idx - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(idx); }
  });
  // gamepad: d-pad or left stick to move, A to choose
  (function poll() {
    const g = readGamepads()[0];
    if (app.menuOpen && team && !g.keyboard) {
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
