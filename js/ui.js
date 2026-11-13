// Apex interface layer: preloader, navigation and mega menu, service explorer, demos, forms.
import { APPLY_ENDPOINT, JOBS } from './careers.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const root = document.documentElement;
const EMAIL = 'info@apexss.com';
const ARROW = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const TONES = {
  blue: { a: '#3fc0ff', b: '#b8ecff', la: '#0b84c6', lb: '#27aae1' },
  green: { a: '#9be03a', b: '#d6ff8a', la: '#4a850a', lb: '#74ad1f' },
  orange: { a: '#ffa23a', b: '#ffd08a', la: '#c96a00', lb: '#f08a12' },
};

let experience = null;
const onReady = [];

// ---------------------------------------------------------------- preloader
function boot() {
  const pre = $('#preloader');
  const done = () => { root.classList.add('ready'); pre?.setAttribute('aria-hidden', 'true'); };
  if (!pre || reducedMotion || sessionStorage.getItem('apex-booted')) { pre?.classList.add('skip'); done(); return; }
  sessionStorage.setItem('apex-booted', '1');
  const count = $('.pre-count', pre), log = $('.pre-log', pre), bar = $('.pre-bar i', pre);
  const lines = ['powering the board', 'routing traces', 'seating components', 'linking scroll timeline', 'ready'];
  const start = performance.now(), dur = 1700;
  (function tick(now) {
    const t = clamp((now - start) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
    count.textContent = String(Math.round(e * 100)).padStart(3, '0');
    bar.style.transform = `scaleX(${e})`;
    log.textContent = '> ' + lines[Math.min(lines.length - 1, Math.floor(e * lines.length))];
    if (t < 1) requestAnimationFrame(tick); else setTimeout(done, 180);
  })(start);
  pre.addEventListener('click', done);
}

// ------------------------------------------------------------ bright / dark
let chapterTone = null, overrideTone = null;
const isLight = () => root.dataset.theme !== 'dark';
function applyAccent() {
  const t = overrideTone || chapterTone;
  if (!t) return;
  root.style.setProperty('--accent', isLight() ? t.la : t.a);
  root.style.setProperty('--accent-2', isLight() ? t.lb : t.b);
}
function initTheme() {
  const btn = $('#themeBtn');
  const label = () => btn?.setAttribute('aria-label', isLight() ? 'Switch to dark mode' : 'Switch to bright mode');
  label();
  btn?.addEventListener('click', () => {
    root.dataset.theme = isLight() ? 'dark' : 'light';
    try { localStorage.setItem('apex-theme', root.dataset.theme); } catch (e) { /* private mode */ }
    $('meta[name="theme-color"]')?.setAttribute('content', isLight() ? '#f3f5fa' : '#03050b');
    applyAccent(); label();
    experience?.setTheme(isLight());
  });
}

// ------------------------------------------------------------------ 3D scene
function initScene() {
  const canvas = $('#scene'), sections = $$('[data-shape]');
  if (!canvas || !sections.length) return;
  // the board's silkscreen and the logo are drawn with web fonts, so give them a moment to arrive
  const fonts = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 2200))]);
  Promise.all([import('./scene.js'), fonts])
    .then(([{ createExperience }]) => {
      experience = createExperience({
        canvas, sections, reducedMotion, light: isLight(),
        onChapter: (i, tone) => { chapterTone = tone; applyAccent(); setChapter(i); },
      });
      experience.setTheme(isLight());
      root.classList.add('webgl');
      onReady.forEach((fn) => fn());
    })
    .catch((err) => {
      console.warn('3D scene unavailable, using static backdrop.', err);
      root.classList.add('no-webgl');
    });
}

// ----------------------------------------------------------------------- HUD
const hudSections = $$('[data-chapter]');
let railDots = [];
function initHud() {
  const rail = $('#rail');
  if (rail && hudSections.length > 1) {
    hudSections.forEach((sec, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span>${String(i + 1).padStart(2, '0')} ${esc(sec.dataset.chapter)}</span><i></i>`;
      b.setAttribute('aria-label', `Go to ${sec.dataset.chapter}`);
      b.addEventListener('click', () => sec.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
      rail.appendChild(b);
    });
    railDots = $$('button', rail);
  }
  setChapter(0);
}
function setChapter(i) {
  const sec = $$('[data-shape]')[i], idx = hudSections.indexOf(sec);
  if (idx < 0) return;
  railDots.forEach((d, j) => d.classList.toggle('on', j === idx));
  const label = $('#hudChapter');
  if (label) label.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(hudSections.length).padStart(2, '0')} — ${sec.dataset.chapter}`;
}

// ---------------------------------------------------------------------- nav
function initNav() {
  const nav = $('#nav'), links = $('#navLinks'), btn = $('#menuBtn'), glider = $('.nav-glider');
  if (!nav) return;

  // sliding highlight behind the hovered link
  if (glider && finePointer) {
    const move = (el) => {
      if (!el) { glider.style.opacity = '0'; return; }
      const r = el.getBoundingClientRect(), p = $('.nav-bar', nav).getBoundingClientRect();
      glider.style.left = `${r.left - p.left}px`; glider.style.width = `${r.width}px`; glider.style.opacity = '1';
    };
    $$('.nav-link', links).forEach((a) => a.addEventListener('pointerenter', () => move(a)));
    links.addEventListener('pointerleave', () => move(null));
  }

  // live clock for the studio's home city
  const clock = $('#clock');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false });
    const tick = () => { clock.textContent = `CHI ${fmt.format(new Date())}`; };
    tick(); setInterval(tick, 20000);
  }

  // mobile sheet
  if (btn && links) {
    const set = (open) => { links.classList.toggle('open', open); btn.classList.toggle('open', open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => set(!links.classList.contains('open')));
    $$('a', links).forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }

  // mega menu: opens on hover or focus, toggles on click/tap, and steers the 3D camera per column
  const megaBtn = $('#megaBtn'), mega = $('#mega'), item = $('.has-mega');
  if (megaBtn && mega) {
    const desktop = matchMedia('(min-width: 900px)');
    let timer = 0;
    const setOpen = (open) => {
      clearTimeout(timer);
      if (!desktop.matches) open = false;
      root.classList.toggle('mega-open', open);
      megaBtn.setAttribute('aria-expanded', String(open));
      if (!open) { overrideTone = null; applyAccent(); experience?.focus(null); }
    };
    const later = (open, ms) => { clearTimeout(timer); timer = setTimeout(() => setOpen(open), ms); };
    item.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') later(true, 70); });
    item.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') later(false, 220); });
    megaBtn.addEventListener('click', (e) => {
      if (!desktop.matches) return;                         // on small screens it is a plain link
      if (!root.classList.contains('mega-open')) { e.preventDefault(); setOpen(true); }
    });
    megaBtn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); setOpen(true); $('.mega-head', mega)?.focus(); }
    });
    item.addEventListener('focusout', (e) => { if (!item.contains(e.relatedTarget)) later(false, 120); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('mega-open')) { setOpen(false); megaBtn.focus(); } });
    $('.mega-veil')?.addEventListener('click', () => setOpen(false));
    $$('.mega-col', mega).forEach((col) => {
      const on = () => { overrideTone = TONES[col.dataset.tone]; applyAccent(); experience?.focus(col.dataset.focus); };
      col.addEventListener('pointerenter', on);
      col.addEventListener('focusin', on);
    });
    $$('a', mega).forEach((a) => a.addEventListener('click', () => setOpen(false)));
  }

  $$('.year').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

// ------------------------------------------------------- scroll choreography
function initScroll() {
  const nav = $('#nav'), progress = $('#progress'), pct = $('#hudPct');
  let ticking = false;
  function update() {
    ticking = false;
    const y = window.scrollY, max = Math.max(1, root.scrollHeight - window.innerHeight), f = clamp(y / max, 0, 1);
    nav?.classList.toggle('scrolled', y > 24);
    if (progress) progress.style.transform = `scaleX(${f})`;
    if (pct) pct.textContent = String(Math.round(f * 100)).padStart(3, '0') + '%';
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// --------------------------------------------------------- service explorer
// A pinned section. Scrolling steps through the services; each one starts as an exploded view
// on the fabrication pad and comes together as you move through its part of the scroll.
function initExplorer() {
  const sec = $('.explorer');
  if (!sec) return;
  const items = $$('.svc', sec), N = items.length, seg = Number(sec.dataset.seg) || 36;
  const spec = { title: $('#specTitle'), body: $('#specBody'), pcts: $$('.asm-pct', sec), bars: $$('.asm-bar i', sec), names: $$('.asm-name', sec) };
  sec.style.height = `calc(100vh + ${N * seg}vh)`;
  let active = -1, lastAsm = -1;

  function setActive(i) {
    if (i === active) return;
    active = i;
    items.forEach((el, j) => el.classList.toggle('on', j === i));
    const el = items[i];
    spec.title.innerHTML = $('.svc-t', el).innerHTML;
    spec.names.forEach((n) => { n.innerHTML = $('.svc-t', el).innerHTML; });
    spec.body.innerHTML = $('.svc-body', el).innerHTML;
    $('.spec', sec)?.setAttribute('data-tone', el.dataset.tone);
    // on phones the list is a horizontal strip: centre the active chip without scrolling anything else
    const list = el.parentElement;
    if (list.scrollWidth > list.clientWidth + 4) list.scrollTo({ left: el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2, behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  function update() {
    const r = sec.getBoundingClientRect(), vh = window.innerHeight;
    if (r.top > vh * 0.75 || r.bottom < vh * 0.25) return;      // not on stage
    const f = clamp(-r.top / Math.max(1, r.height - vh), 0, 0.9999) * N, i = Math.floor(f);
    const asm = reducedMotion ? 1 : smooth(0.05, 0.68, f - i);
    setActive(i);
    if (Math.abs(asm - lastAsm) > 0.002 || !update.sent) {
      lastAsm = asm; update.sent = !!experience;
      experience?.build(items[i].dataset.build, items[i].dataset.tone, asm);
      spec.pcts.forEach((n) => { n.textContent = `${Math.round(asm * 100)}%`; });
      spec.bars.forEach((n) => { n.style.transform = `scaleX(${asm})`; });
    }
  }
  const goTo = (i, behavior = 'smooth') => {
    const top = sec.getBoundingClientRect().top + window.scrollY + ((i + 0.8) / N) * (sec.offsetHeight - window.innerHeight);
    window.scrollTo({ top, behavior: reducedMotion ? 'auto' : behavior });
  };
  items.forEach((el, i) => $('.svc-head', el).addEventListener('click', () => goTo(i)));
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  onReady.push(() => { update.sent = false; active = -1; update(); });

  // deep links from the mega menu: software.html#mobile
  const fromHash = () => { const i = items.findIndex((el) => el.id && '#' + el.id === location.hash); if (i >= 0) goTo(i, 'auto'); };
  window.addEventListener('hashchange', fromHash);
  if (location.hash) requestAnimationFrame(() => setTimeout(fromHash, 60));
  update();
}

// ------------------------------------------------------------------- reveals
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/[]{}=+*#_';
function scramble(el) {
  const text = el.dataset.text || (el.dataset.text = el.textContent);
  if (reducedMotion) { el.textContent = text; return; }
  const start = performance.now(), dur = 500 + text.length * 22;
  (function tick(now) {
    const t = clamp((now - start) / dur, 0, 1), shown = Math.floor(t * text.length);
    let out = text.slice(0, shown);
    for (let i = shown; i < text.length; i++) out += text[i] === ' ' ? ' ' : i < shown + 6 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : ' ';
    el.textContent = out;
    if (t < 1) requestAnimationFrame(tick); else el.textContent = text;
  })(start);
}
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      $$('[data-scramble]', e.target).forEach(scramble);
      if (e.target.matches('[data-scramble]')) scramble(e.target);
      io.unobserve(e.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.rv').forEach((el) => io.observe(el));
  $$('.explorer [data-scramble]').forEach((el) => io.observe(el));
  $$('[data-stagger]').forEach((g) => [...g.children].forEach((c, i) => c.style.setProperty('--d', `${i * 70}ms`)));
}

// --------------------------------------------------------- cursor, magnetism
function initPointerFx() {
  if (!finePointer) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('.glass');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
  if (reducedMotion) return;

  const dot = $('.cursor-dot'), ring = $('.cursor-ring');
  if (dot && ring) {
    root.classList.add('has-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    window.addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      dot.style.transform = `translate3d(${x}px,${y}px,0)`;
      const t = e.target;
      ring.classList.toggle('hover', !!t.closest?.('a,button,.sw,[data-magnetic]'));
      ring.classList.toggle('text', !!t.closest?.('input,textarea,select'));
    }, { passive: true });
    window.addEventListener('pointerdown', () => ring.classList.add('down'));
    window.addEventListener('pointerup', () => ring.classList.remove('down'));
    root.addEventListener('mouseleave', () => root.classList.add('cursor-out'));
    root.addEventListener('mouseenter', () => root.classList.remove('cursor-out'));
    (function follow() {
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
      requestAnimationFrame(follow);
    })();
  }
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.2}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}

// --------------------------------------------------------------------- tabs
function initLab() {
  const tabs = $$('.lab-tab'), note = $('#labNote');
  if (!tabs.length) return;
  const notes = { tabGame: 'Name the hidden logic gate. Five chips, about a minute.', tabTerm: 'Everything about Apex is one command away.' };
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('on', on); t.setAttribute('aria-selected', String(on));
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (note) note.textContent = notes[tab.id] || '';
    if (tab.id === 'tabTerm') $('#termInput')?.focus({ preventScroll: true });
  }));
}

// ------------------------------------------------------------------ terminal
function initTerminal() {
  const term = $('#term');
  if (!term) return;
  const out = $('.term-out', term), form = $('.term-form', term), input = $('input', form);
  const history = []; let hIndex = 0;
  const line = (html, cls = '') => {
    const d = document.createElement('div');
    d.className = 'tl ' + cls; d.innerHTML = html;
    out.appendChild(d); out.scrollTop = out.scrollHeight;
    return d;
  };
  const echo = (cmd) => { const d = line('<span class="tp">❯</span> '); d.appendChild(document.createTextNode(cmd)); };
  const rows = (pairs) => pairs.forEach(([k, v]) => line(`<span class="tk">${k}</span><span>${v}</span>`, 'row'));
  const go = (id) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }); return !!el; };

  const commands = {
    help() {
      rows([
        ['services', 'the three studios'], ['software', 'web, mobile, desktop and cloud'], ['ai', 'private AI and hardware'],
        ['studio', 'websites, films and games'], ['about', 'who we are'], ['careers', 'open positions'], ['contact', 'start a conversation'],
        ['surge', 'send a power surge across the board'], ['clear', 'wipe the screen'],
      ]);
    },
    services() {
      rows([['software', 'Software &amp; Cloud'], ['ai', 'AI &amp; Hardware'], ['studio', 'Apex Studio']]);
      line('<a href="services.html">Open all services →</a>');
    },
    software() {
      line('SaaS · custom software · mobile &amp; tablet apps · desktop apps · cloud &amp; APIs · UI/UX · modernization · consulting');
      line('<a href="software.html">Open Software &amp; Cloud →</a>');
    },
    ai() {
      rows([['servers', 'local AI servers, built and configured'], ['workstations', 'custom builds for design, AI and gaming'],
        ['agents', 'running inside your network'], ['models', 'trained on your own data'], ['people', 'AI training for your team']]);
      line('<a href="ai.html">Open AI &amp; Hardware →</a>');
    },
    studio() {
      rows([['websites', 'immersive, interactive, fast'], ['commercials', '3D-animated product films'], ['games', 'educational games that teach']]);
      line('<a href="studio.html">Open Apex Studio →</a>');
    },
    about() {
      line('Apex Software Services — Chicago, Illinois.');
      line('More than 20 years building applications, products and consulting. We deliver reliably and fast.');
    },
    careers() { line('No open positions right now. <a href="careers.html">See the careers page →</a>'); },
    contact() {
      line(`All inquiries: <a href="mailto:${EMAIL}">${EMAIL}</a>`);
      line('<a href="contact.html">Open the project form →</a>');
    },
    surge() { if (experience) { experience.pulse(); line('<span class="ta">◉ surge dispatched</span>'); } else line('3D scene is offline on this device.'); },
    whoami() { line('guest — and possibly our next favourite client.'); },
    sudo() { line('<span class="te">permission denied:</span> nice try.'); },
    clear() { out.innerHTML = ''; },
    goto(arg) {
      if (!arg || !go(arg)) line('<span class="te">unknown section.</span> try: services, lab, process, contact');
      else line(`<span class="td">navigating to</span> #${esc(arg)}`);
    },
  };
  Object.assign(commands, { ls: commands.help, '?': commands.help, email: commands.contact, pulse: commands.surge, launch: commands.surge, games: commands.studio, hardware: commands.ai, jobs: commands.careers });

  function run(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    echo(cmd);
    const [name, ...args] = cmd.toLowerCase().split(/\s+/);
    const fn = Object.hasOwn(commands, name) ? commands[name] : null;
    if (fn) fn(args[0]); else line(`<span class="te">command not found:</span> ${name.replace(/[^\w-]/g, '')} <span class="td">— type</span> help`);
    out.scrollTop = out.scrollHeight;
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value; input.value = '';
    if (v.trim()) { history.push(v); hIndex = history.length; }
    run(v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); hIndex = Math.max(0, hIndex - 1); input.value = history[hIndex]; }
    if (e.key === 'ArrowDown' && history.length) { e.preventDefault(); hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ''; }
  });
  term.addEventListener('click', (e) => { if (!e.target.closest('a,button') && !String(getSelection())) input.focus({ preventScroll: true }); });
  $$('[data-cmd]', term).forEach((b) => b.addEventListener('click', () => run(b.dataset.cmd)));
  line('<span class="td">Apex shell — type a command or tap a shortcut below.</span>');
  run('help');
}

// ------------------------------------------------------- educational game
// "Mystery Chip": probe a hidden logic gate with two switches, then name it.
function initGame() {
  if (!$('#gSwA')) return;
  const GATES = {
    AND: { f: (a, b) => a & b, tip: 'AND is on only when both inputs are on.' },
    OR: { f: (a, b) => a | b, tip: 'OR is on when at least one input is on.' },
    XOR: { f: (a, b) => a ^ b, tip: 'XOR is on when the two inputs differ.' },
    NAND: { f: (a, b) => 1 - (a & b), tip: 'NAND is off only when both inputs are on.' },
    NOR: { f: (a, b) => 1 - (a | b), tip: 'NOR is on only when both inputs are off.' },
  };
  const names = Object.keys(GATES), KEYS = ['00', '01', '10', '11'];
  const el = {
    a: $('#gSwA'), b: $('#gSwB'), wa: $('#gWireA'), wb: $('#gWireB'), wo: $('#gWireO'), lamp: $('#gLamp'), gate: $('#gGate'),
    truth: $('#gTruth'), msg: $('#gMsg'), choices: $('#gChoices'), next: $('#gNext'), round: $('#gRound'), score: $('#gScore'),
  };
  let order = [], round = 0, score = 0, a = 0, b = 0, seen = {}, solved = false, misses = 0, finished = false;

  function render() {
    const out = GATES[order[round]].f(a, b);
    seen[`${a}${b}`] = out;
    for (const [sw, v] of [[el.a, a], [el.b, b]]) { sw.classList.toggle('on', !!v); sw.setAttribute('aria-checked', String(!!v)); }
    el.wa.classList.toggle('on', !!a); el.wb.classList.toggle('on', !!b);
    el.wo.classList.toggle('on', !!out); el.lamp.classList.toggle('on', !!out);
    el.truth.innerHTML = KEYS.map((k) => {
      const known = k in seen, v = seen[k];
      return `<tr class="${k === `${a}${b}` ? 'cur' : ''}"><td>${k[0]}</td><td>${k[1]}</td><td class="${known ? (v ? 'one' : '') : 'q'}">${known ? v : '?'}</td></tr>`;
    }).join('');
  }
  function load() {
    a = 0; b = 0; seen = {}; solved = false; misses = 0; finished = false;
    el.gate.textContent = '?'; el.next.hidden = true;
    el.round.textContent = round + 1; el.score.textContent = score;
    el.msg.textContent = 'Flip the switches and watch the lamp.';
    el.choices.innerHTML = '';
    for (const name of names) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = name;
      btn.addEventListener('click', () => guess(name, btn));
      el.choices.appendChild(btn);
    }
    render();
  }
  function guess(name, btn) {
    if (solved) return;
    if (name !== order[round]) {
      misses++; btn.disabled = true; btn.classList.add('miss');
      el.msg.textContent = `Not ${name}. Try the input combinations you have not tested yet.`;
      return;
    }
    solved = true;
    if (!misses) score++;
    el.score.textContent = score;
    $$('button', el.choices).forEach((x) => { x.disabled = true; });
    btn.classList.add('ok');
    el.gate.textContent = name;
    el.msg.textContent = `Correct. ${GATES[name].tip}`;
    for (const k of KEYS) seen[k] = GATES[name].f(+k[0], +k[1]);
    render();
    el.next.innerHTML = `${round < 4 ? 'Next chip' : 'See your result'} ${ARROW}`;
    el.next.hidden = false;
    experience?.pulse();
  }
  function start() {
    order = names.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    round = 0; score = 0;
    load();
  }
  el.next.addEventListener('click', () => {
    if (finished) return start();
    if (round < 4) { round++; return load(); }
    finished = true;
    el.choices.innerHTML = '';
    el.msg.textContent = `You solved ${score} of 5 on the first try. A clear goal, instant feedback and a concept that sticks: that is an educational game. We build them for classrooms, onboarding and training.`;
    el.next.innerHTML = `Play again ${ARROW}`;
  });
  for (const [sw, which] of [[el.a, 'a'], [el.b, 'b']]) {
    const flip = () => { if (which === 'a') a ^= 1; else b ^= 1; render(); };
    sw.addEventListener('click', flip);
    sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  }
  start();
}

// -------------------------------------------------------------------- forms
function initContact() {
  const form = $('#contactForm');
  if (!form) return;
  const note = $('.form-note', form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form), get = (k) => String(data.get(k) || '').trim();
    const subject = `New project inquiry — ${get('company') || get('name')}`;
    const body = [`Name: ${get('name')}`, `Email: ${get('email')}`, `Company: ${get('company') || '—'}`, `Interested in: ${get('topic') || '—'}`, '', get('message')].join('\n');
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (note) note.textContent = `Your email app should open with the message ready to send. If it doesn't, write to ${EMAIL}.`;
    experience?.pulse();
  });
}

// Careers: positions come from js/careers.js. Open roles get an Apply button and the application form.
function initCareers() {
  const openBox = $('#jobsOpen'), filledBox = $('#jobsFilled');
  if (!openBox || !filledBox) return;
  const open = JOBS.filter((j) => j.status === 'open'), filled = JOBS.filter((j) => j.status !== 'open');
  $('#jobsCount').textContent = `${open.length} open`;
  filledBox.innerHTML = filled.map((j) => `<li class="job filled"><div><strong>${esc(j.title)}</strong><span>${esc(j.team || '')}</span></div><em>Filled</em></li>`).join('');
  if (open.length) {
    openBox.innerHTML = '<ul class="jobs-list">' + open.map((j, i) => {
      const meta = [j.team, j.type, j.location].filter(Boolean).map(esc).join(' · ');
      return `<li class="job open"><div><strong>${esc(j.title)}</strong><span>${meta}</span>${j.summary ? `<span>${esc(j.summary)}</span>` : ''}</div><button class="btn btn-primary btn-sm" type="button" data-apply="${i}">Apply ${ARROW}</button></li>`;
    }).join('') + '</ul>';
  }

  const dialog = $('#applyDialog'), form = $('#applyForm'), note = $('#applyNote');
  if (!dialog || !form) return;
  const close = () => dialog.close();
  $('#applyClose')?.addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  openBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-apply]');
    if (!b) return;
    const job = open[Number(b.dataset.apply)];
    $('#applyTitle').textContent = job.title; $('#applyRole').value = job.title;
    note.textContent = ''; form.reset(); $('#applyRole').value = job.title;
    dialog.showModal();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form), get = (k) => String(data.get(k) || '').trim();
    const file = data.get('resume');
    if (file && file.size > 10 * 1024 * 1024) { note.textContent = 'That file is larger than 10 MB. Please upload a smaller résumé.'; return; }
    const submit = $('button[type="submit"]', form);
    if (APPLY_ENDPOINT) {
      submit.disabled = true; note.textContent = 'Sending your application…';
      try {
        const res = await fetch(APPLY_ENDPOINT, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        note.textContent = 'Thank you. Your application has been received, and a person will read it.';
      } catch (err) {
        note.textContent = `Something went wrong sending the form. Please email your application to ${EMAIL}.`;
      } finally { submit.disabled = false; }
      return;
    }
    // no endpoint configured: hand the text over to the applicant's email app
    const body = [`Role: ${get('role')}`, `Name: ${get('name')}`, `Email: ${get('email')}`, `LinkedIn: ${get('linkedin')}`, '',
      'A project I am proud of:', get('project_1'), '', 'A hard problem I solved:', get('project_2'), '', 'Other relevant work:', get('project_3') || '—', '',
      '(Please attach your résumé to this email before sending.)'].join('\n');
    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent('Application — ' + get('role'))}&body=${encodeURIComponent(body)}`;
    note.textContent = 'Your email app should open with your answers filled in. Attach your résumé there, then send.';
  });
}

boot();
initTheme();
initNav();
initHud();
initReveals();
initPointerFx();
initLab();
initGame();
initTerminal();
initContact();
initCareers();
initExplorer();
initScroll();
initScene();
