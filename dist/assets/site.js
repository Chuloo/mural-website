(() => {
  const headline = document.querySelector('#headline');
  const language = document.querySelector('#headline-language');
  const toggle = document.querySelector('#motion-toggle');
  if (!headline || !language || !toggle) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const versions = [
    {lang:'en', name:'English', lines:['The language app','you eventually delete']},
    {lang:'es', name:'Español', lines:['La app de idiomas','que acabarás borrando']},
    {lang:'fr', name:'Français', lines:['L’appli de langues que','vous finirez par supprimer']},
    {lang:'de', name:'Deutsch', lines:['Die Sprachlern-App, die','du irgendwann löschst']},
    {lang:'pt', name:'Português', lines:['A app de línguas','que um dia vais apagar']},
    {lang:'ja', name:'日本語', lines:['いつか削除する、','語学学習アプリ']}
  ];
  // Use one size for every translation, within a fixed two-line heading.
  // The reserved height does not change as languages rotate or fonts load.
  const title = headline.closest('h1');
  function fitHeadlines() {
    const measure = document.createElement('span');
    measure.className = 'headline-measure';
    measure.setAttribute('aria-hidden', 'true');
    title.append(measure);
    let widest = 0;
    for (const version of versions) {
      measure.lang = version.lang;
      for (const line of version.lines) {
        measure.textContent = line;
        widest = Math.max(widest, measure.getBoundingClientRect().width);
      }
    }
    const base = parseFloat(getComputedStyle(title).fontSize);
    const scale = Math.min(1, (title.clientWidth - 4) / Math.max(1, widest));
    headline.style.setProperty('--headline-size', `${Math.floor(base * scale * 100) / 100}px`);
    measure.remove();
  }
  fitHeadlines();
  new ResizeObserver(fitHeadlines).observe(title);
  document.fonts.ready.then(fitHeadlines);
  let index = 0, paused = reduced.matches, timer, transition;
  const canvas = document.querySelector('#mural-orb');
  const ctx = canvas?.getContext('2d');
  let frame, previous = 0, elapsed = 0;
  function drawOrb(time) {
    if (!ctx) return;
    const s = canvas.width, phase = time * 0.72;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.rotate(Math.sin(phase * 0.5) * Math.PI / 60);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = i / 120 * Math.PI * 2;
      const wave = Math.sin(a * 3 + phase) * 0.021 + Math.cos(a * 2 - phase * 0.7) * 0.012;
      const r = s * (0.465 + wave);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#ffb47d'; ctx.fillRect(-s, -s, s * 2, s * 2);
    const glow = (x, y, radius, color) => {
      const gradient = ctx.createRadialGradient(x*s, y*s, 0, x*s, y*s, radius*s);
      gradient.addColorStop(0, color); gradient.addColorStop(1, color.slice(0,7) + '00');
      ctx.fillStyle = gradient; ctx.fillRect(-s, -s, s*2, s*2);
    };
    glow(-0.28 + Math.sin(phase) * 0.12, -0.36 + Math.cos(phase) * 0.05, 0.68, '#fff1bdff');
    glow(0.36 + Math.cos(phase * 0.8) * 0.11, 0.12 + Math.sin(phase) * 0.15, 0.70, '#cbb8f2ee');
    glow(-0.19 + Math.sin(phase * 0.7) * 0.14, 0.42, 0.58, '#ff865dcc');
    glow(0.08 + Math.cos(phase) * 0.10, -0.12 + Math.sin(phase) * 0.08, 0.35, '#ffd8a080');
    ctx.save(); ctx.translate(-s * 0.18, -s * 0.28); ctx.rotate(-0.48); ctx.scale(1, 0.32);
    glow(0, 0, 0.28, '#fff9eab0'); ctx.restore();
    ctx.restore();
    canvas.classList.add('ready');
  }
  function animateOrb(timestamp) {
    if (paused || document.hidden) { frame = undefined; previous = 0; return; }
    if (!previous || timestamp - previous >= 1000 / 30) {
      if (previous) elapsed += Math.min((timestamp - previous) / 1000, 0.1);
      previous = timestamp; drawOrb(elapsed);
    }
    frame = requestAnimationFrame(animateOrb);
  }
  function syncOrb() {
    cancelAnimationFrame(frame); frame = undefined; previous = 0;
    document.body.classList.toggle('motion-paused', paused || document.hidden);
    if (!paused && !document.hidden && ctx) frame = requestAnimationFrame(animateOrb);
  }
  drawOrb(0);
  function stop() { clearTimeout(timer); clearTimeout(transition); headline.classList.remove('changing'); }
  function schedule() {
    stop();
    if (paused || document.hidden) return;
    timer = setTimeout(() => {
      headline.classList.add('changing');
      transition = setTimeout(() => {
        index = (index + 1) % versions.length;
        const next = versions[index];
        headline.querySelector('span').textContent = next.lines[0];
        headline.querySelector('em').textContent = next.lines[1];
        headline.lang = next.lang; language.textContent = next.name;
        headline.classList.remove('changing');
        schedule();
      }, 450);
    }, index === 0 ? 8500 : 7000);
  }
  function reflect() {
    syncOrb();
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play headline and background animations' : 'Pause headline and background animations');
    toggle.innerHTML = paused ? '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="m4 2 6 4-6 4Z" fill="currentColor"/></svg>' : '<svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M4 2v8M8 2v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    schedule();
  }
  toggle.addEventListener('click', () => { paused = !paused; reflect(); });
  reduced.addEventListener('change', () => { paused = reduced.matches; reflect(); });
  document.addEventListener('visibilitychange', () => { syncOrb(); schedule(); });
  reflect();
})();
