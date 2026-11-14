// Now Playing's title is sized to its rail: measured typography, the only imperative layout there.
// The inline values it writes deliberately override .np-title's fallback font-size/line-height.
// Shared by the screen itself and the copies of it that page between players (PlayerPage.vue).

/** Width of the title's widest word at the size currently set on it. */
function widestWord(t, words) {
  const probe = document.createElement('span');
  // Absolute and hidden: it measures inside the title's own font without joining its lines.
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
  t.appendChild(probe);
  let widest = 0;
  for (const word of words) {
    probe.textContent = word;
    widest = Math.max(widest, probe.offsetWidth);
  }
  t.removeChild(probe);
  return widest;
}

/**
 * Sizes a LeftRail's title (`rail`: the component, with titleElement and subtitleElement) to fit.
 * `active` false (nothing playing: the date) puts back the title's own size.
 */
export function fitRailTitle(rail, active) {
  const t = rail && rail.titleElement;
  const content = rail && rail.$el && rail.$el.querySelector('.left-rail-content');
  if (!t || !content) return;
  t.style.webkitLineClamp = '';
  t.classList.remove('break-word');
  if (!active) { t.style.fontSize = ''; t.style.lineHeight = ''; return; }
  // The browser can wrap after a hyphen or en dash, so "Three-Legged" is measured as "Three-"
  // and "Legged" rather than as one word.
  const words = (t.textContent || '').match(/[^\s\-‐–]+[\-‐–]*|[\-‐–]+/g) || [];
  const scale = [[48, 64], [40, 56], [28, 36]];
  // A title is sized down until it fits the rail's height *and* its longest word fits the
  // rail's width: splitting a word across lines reads worse than a smaller title.
  for (const [size, line] of scale) {
    t.style.fontSize = size + 'px'; t.style.lineHeight = line + 'px';
    const last = rail.subtitleElement || t;
    if (widestWord(t, words) <= t.clientWidth
      && last.getBoundingClientRect().bottom <= content.getBoundingClientRect().bottom
      && t.offsetHeight <= line * 5.01) return;
  }
  // Nothing fit: keep the smallest size, and only now allow a word to break.
  if (widestWord(t, words) > t.clientWidth) t.classList.add('break-word');
  const last = rail.subtitleElement || t;
  const overflow = Math.max(0, last.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom);
  t.style.webkitLineClamp = String(Math.max(1, Math.min(5, Math.floor((t.offsetHeight - overflow) / 36))));
}
