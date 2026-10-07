(() => {
  const diagnostics = new URLSearchParams(location.search).has('debug');
  const trace = (event, details = {}) => { if (diagnostics) console.debug('[portfolio-public]', JSON.stringify({ event, ...details })); };
  const $ = s => document.querySelector(s);
  window.addEventListener('storage', event => { if (event.key === 'portfolio-updated') window.location.reload(); });
  const search = document.querySelector('[data-project-search]'), category = document.querySelector('[data-project-category]');
  const filter = () => {
    let count = 0;
    document.querySelectorAll('[data-project-card]').forEach(card => {
      card.hidden = !(card.dataset.search.includes(search?.value.trim().toLowerCase() || '') && (!category?.value || card.dataset.category === category.value));
      if (!card.hidden) count++;
    });
    const empty = document.querySelector('[data-project-empty]'); if (empty) empty.hidden = count > 0;
  };
  search?.addEventListener('input', filter); category?.addEventListener('change', filter);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('no-motion');
  const intro = $('#intro');
  if (intro) setTimeout(() => { intro.classList.add('intro--done'); setTimeout(() => intro.remove(), 600); }, reduced ? 0 : 550);
  document.documentElement.classList.add('js-ready');
  if (!reduced && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.08 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  } else document.querySelectorAll('.reveal').forEach(el => el.classList.add('is-visible'));
  let previousFocus;
  const drawer = $('#drawer'), modal = $('#videoModal');
  const setDrawer = open => {
    trace('drawer.toggle', { open, introVisible: Boolean(intro?.isConnected), controlsReady: true });
    drawer.inert = !open; drawer.classList.toggle('is-open', open); drawer.setAttribute('aria-hidden', String(!open));
    $('#menuBtn').setAttribute('aria-expanded', String(open)); document.body.style.overflow = open ? 'hidden' : '';
    if (open) { previousFocus = document.activeElement; $('#drawerClose').focus(); } else previousFocus?.focus();
  };
  $('#menuBtn')?.addEventListener('click', () => setDrawer(true));
  $('#drawerClose')?.addEventListener('click', () => setDrawer(false));
  $('#drawerBackdrop')?.addEventListener('click', () => setDrawer(false));
  drawer?.querySelectorAll('[data-drawer-link]').forEach(el => el.addEventListener('click', () => setDrawer(false)));
  const closeVideo = () => {
    if (!modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); modal.inert = true;
    $('#videoFrame').removeAttribute('src'); document.body.style.overflow = ''; previousFocus?.focus();
  };
  document.querySelectorAll('[data-video-id]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.videoId;
    if (!/^[\w-]{11}$/.test(id)) return;
    previousFocus = button; modal.inert = false;
    trace('video.open', { validId: true });
    $('#videoFrame').src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; $('#modalClose').focus();
  }));
  $('#modalClose')?.addEventListener('click', closeVideo); $('#modalBackdrop')?.addEventListener('click', closeVideo);
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') { if (drawer.classList.contains('is-open')) setDrawer(false); closeVideo(); }
    const dialog = drawer.classList.contains('is-open') ? drawer : modal.classList.contains('is-open') ? modal : null;
    if (event.key === 'Tab' && dialog) {
      const all = [...dialog.querySelectorAll('a,button,iframe')].filter(el => el.tabIndex >= 0 && el.getClientRects().length);
      const first = all[0], last = all.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  const type = $('#typeTarget'), phrases = type?.dataset.roles.split('\n').map(s => s.trim()).filter(Boolean) || [];
  if (!reduced && phrases.length > 1) {
    let index = 0, letter = phrases[0].length, deleting = true;
    const tick = () => {
      const phrase = phrases[index]; letter += deleting ? -1 : 1; type.textContent = phrase.slice(0, Math.max(letter, 0));
      let delay = deleting ? 35 : 60;
      if (letter <= 0) { index = (index + 1) % phrases.length; deleting = false; delay = 250; }
      else if (letter >= phrase.length) { deleting = true; delay = 1400; }
      setTimeout(tick, delay);
    }; setTimeout(tick, 1400);
  }
  trace('public.ready', { menu: Boolean($('#menuBtn')), videos: document.querySelectorAll('[data-video-id]').length, projects: document.querySelectorAll('[data-project-card]').length });
  const cursor = $('#cursor'), glow = $('#cursorGlow');
  if (cursor && glow && !reduced && matchMedia('(pointer: fine)').matches) document.addEventListener('mousemove', event => {
    cursor.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
    glow.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  });
})();
