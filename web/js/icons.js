// Line icons (24 px grid, stroke = currentColor) for the toolbar and the mission cards.
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="ico">${body}</svg>`;
export const ICON = {
  pause: svg('<path d="M8 5v14M16 5v14"/>'),
  play: svg('<path d="M7 5l12 7-12 7z" class="fill"/>'),
  reset: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  keys: svg('<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10"/>'),
  sound: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  path: svg('<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6"/>'),
  replay: svg('<path d="M11 6L5 12l6 6M19 6l-6 6 6 6"/>'),
  csv: svg('<path d="M12 4v11M7 10l5 5 5-5M5 19h14"/>'),
  // mission cards
  gate: svg('<path d="M5 20V8a7 7 0 0 1 14 0v12"/><path d="M3 20h18"/>'),
  park: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>'),
  ball: svg('<circle cx="12" cy="12" r="7"/><path d="M7 9.5c3 1 7 1 10 0M7 14.5c3-1 7-1 10 0"/>'),
  cell: svg('<path d="M4 12l8-7 8 7v8H4z"/><circle cx="12" cy="15" r="2" class="fill"/>'),
  tip: svg('<path d="M5 15l7-7 7 7"/><path d="M8 19h8"/><path d="M19 4l2 2-2 2"/>'),
  clock: svg('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 3h4"/>'),
  versus: svg('<path d="M4 6l4 12 4-12M20 7.5c-.8-1-2-1.5-3.3-1.5-1.9 0-3.2 1.1-3.2 2.7 0 3.6 6.5 2 6.5 5.8 0 1.6-1.4 2.9-3.4 2.9-1.4 0-2.7-.6-3.6-1.6"/>'),
};
/** put the icons into the toolbar buttons; the text stays as the accessible name */
export function iconizeToolbar() {
  for (const [id, name] of [['resetBtn', 'reset'], ['keysBtn', 'keys'], ['soundBtn', 'sound'], ['trailBtn', 'path'], ['replayBtn', 'replay'], ['csvBtn', 'csv']]) {
    const b = document.getElementById(id); if (!b) continue;
    b.setAttribute('aria-label', b.textContent.trim()); b.innerHTML = ICON[name]; b.classList.add('icon');
  }
}
export function setPauseIcon(running) {
  const b = document.getElementById('pauseBtn'); b.innerHTML = running ? ICON.pause : ICON.play; b.setAttribute('aria-label', running ? 'Pause' : 'Resume');
}
