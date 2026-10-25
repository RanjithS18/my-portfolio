'use strict';
(() => {
    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
    const root = document.documentElement;
    const body = document.body;
    const projects = window.PORTFOLIO_PROJECTS || [];
    const profile = window.PORTFOLIO_PROFILE || {};
    const work = $('#work');
    const stage = $('.work-stage');
    const gallery = $('.gallery-window');
    const track = $('#project-track');
    const select = $('#project-select');
    const dialog = $('#project-dialog');
    const hero = $('.hero');
    const header = $('.site-header');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    // `paused` is the single switch for decorative motion: set by the OS
    // reduced-motion preference or the header toggle. It mirrors html.static.
    let paused = reduced.matches;
    const isStatic = () => paused || root.classList.contains('failsafe');
    let pinned = false;
    let currentIndex = -1;
    let viewport = innerWidth;
    let headerHeight = 78;
    let start = 0;
    let range = 0;
    let distance = 0;
    let metrics = [];
    let needsLayout = true;
    let raf = 0;
    let previousY = scrollY;
    let lastPaintY = -1;
    let previousFocus;

    /* ---------------------------------------------------------------
       1. Content: profile, contact and project cards (all from data files)
       --------------------------------------------------------------- */
    const MASKS = ['rise', 'circle', 'curtain', 'split']; // selective variety, shared easing
    track.replaceChildren();
    projects.forEach((project, index) => {
        const card = document.createElement('article');
        card.className = 'project-card'; card.dataset.project = String(index);
        const media = document.createElement('button'); media.className = 'project-media'; media.dataset.project = String(index);
        media.dataset.mask = MASKS[index % MASKS.length]; media.dataset.cursor = 'project';
        media.setAttribute('aria-label', `Explore ${project.title}`);
        media.style.setProperty('--project-bg', project.background || '#c5d4c5');
        const image = document.createElement('img'); image.src = project.image; image.alt = `Editable project image placeholder for ${project.title}`;
        image.width = 1400; image.height = 880; image.draggable = false; image.decoding = 'async'; image.loading = index < 2 ? 'eager' : 'lazy';
        const number = document.createElement('span'); number.className = 'media-index'; number.textContent = String(index + 1).padStart(2, '0');
        const arrow = document.createElement('span'); arrow.className = 'view-project'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
        media.append(image, number, arrow);
        const meta = document.createElement('div'); meta.className = 'project-meta';
        const detail = document.createElement('div'); const title = document.createElement('h3'); title.textContent = project.title;
        // The category string is split into labels; no technologies are invented.
        const tags = document.createElement('div'); tags.className = 'project-tags';
        String(project.category || '').split('/').map(text => text.trim()).filter(Boolean).forEach((text, k) => {
            const tag = document.createElement('span'); tag.textContent = text; tag.style.setProperty('--k', String(k)); tags.append(tag);
        });
        const description = document.createElement('p'); description.className = 'project-description'; description.textContent = project.description; detail.append(title, tags, description);
        const status = document.createElement('span'); status.textContent = project.status; meta.append(detail, status); card.append(media, meta); track.append(card);
        const option = document.createElement('option'); option.value = String(index); option.textContent = `${String(index + 1).padStart(2, '0')} / ${project.title}`; select.append(option);
        media.addEventListener('click', () => openProject(index));
        media.addEventListener('focus', () => {
            const rect = card.getBoundingClientRect();
            if (rect.left < 0 || rect.right > viewport + 100) seek(index);
        });
    });
    const cards = $$('.project-card');
    $('#project-total').textContent = String(projects.length).padStart(2, '0');
    $('.navigation sup').textContent = String(projects.length);
    $$('[data-profile-name]').forEach(element => { if (profile.name) element.textContent = `${profile.name}.`; });
    if (profile.fullName) document.title = `${profile.fullName} — Ideas into digital.`;
    if (profile.portrait) $$('.hero-portrait,.about-photo img').forEach(image => { image.src = profile.portrait; });
    function validUrl(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
    if (profile.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
        const contact = $('#contact-link'); contact.href = `mailto:${profile.email}`; contact.textContent = 'LET’S TALK ↗'; contact.removeAttribute('target');
        $('.contact-arrow').href = contact.href; $('.contact-arrow').removeAttribute('target'); $('.contact-arrow').setAttribute('aria-label', 'Email Ranjith');
    }
    for (const [key, text] of [['linkedin', 'LinkedIn ↗'], ['github', 'GitHub ↗']]) {
        const url = validUrl(profile[key]); if (!url) continue;
        const link = document.createElement('a'); Object.assign(link, { href: url, textContent: text, target: '_blank', rel: 'noopener noreferrer' }); $('#social-links').append(link);
    }

    /* ---------------------------------------------------------------
       2. Text splitting: lines, words and (for short headings) characters
       --------------------------------------------------------------- */
    // Lines: split on <br>, each line clipped and revealed from below.
    $$('.line-reveal').forEach(heading => {
        const anchors = [...heading.children].filter(element => element.tagName === 'A'); anchors.forEach(anchor => anchor.remove());
        const nodes = [...heading.childNodes]; heading.replaceChildren(); let line = [];
        const appendLine = () => {
            if (!line.length) return;
            const wrap = document.createElement('span'); wrap.className = 'reveal-line';
            wrap.style.setProperty('--line-index', String(heading.children.length));
            const inner = document.createElement('span'); inner.className = 'line-inner'; inner.append(...line); wrap.append(inner); heading.append(wrap); line = [];
        };
        nodes.forEach(node => { if (node.nodeName === 'BR') appendLine(); else line.push(node); }); appendLine(); heading.append(...anchors);
    });
    // Words / characters: walks text nodes so existing accent spans survive.
    function splitText(element, mode) {
        let n = 0;
        const make = (tag, className) => { const node = document.createElement(tag); node.className = className; return node; };
        const walk = parent => [...parent.childNodes].forEach(child => {
            if (child.nodeType === 3) {
                const fragment = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach(token => {
                    if (!token) return;
                    if (/^\s+$/.test(token)) { fragment.append(document.createTextNode(' ')); return; }
                    if (mode === 'words') {
                        const mask = make('span', 'w'); const inner = make('span', 'wi'); inner.textContent = token; inner.style.setProperty('--i', String(n++)); mask.append(inner); fragment.append(mask);
                    } else {
                        const word = make('span', 'wd'); word.setAttribute('aria-hidden', 'true');
                        [...token].forEach(character => { const c = make('span', 'c'); c.textContent = character; c.style.setProperty('--i', String(n++)); word.append(c); });
                        fragment.append(word);
                    }
                });
                child.replaceWith(fragment);
            } else if (child.nodeType === 1 && child.tagName !== 'BR') walk(child);
        });
        const label = element.textContent.replace(/\s+/g, ' ').trim();
        walk(element);
        if (mode === 'chars') element.setAttribute('aria-label', label);
    }
    $$('[data-split-words]').forEach(element => splitText(element, 'words'));
    $$('[data-chars]').forEach(element => { splitText(element, 'chars'); $$('.coral-point', element).forEach(point => point.setAttribute('aria-hidden', 'true')); });
    // Scroll-linked statement: words brighten as the paragraph crosses the viewport.
    const statement = $('[data-word-reveal]');
    const keywords = (statement.dataset.highlight || '').split(',').map(word => word.trim().toLowerCase()).filter(Boolean);
    const statementText = statement.textContent.trim(); statement.replaceChildren();
    statementText.split(/\s+/).forEach((word, index) => {
        if (index) statement.append(document.createTextNode(' '));
        const span = document.createElement('span'); span.className = 'word'; span.textContent = word;
        if (keywords.includes(word.toLowerCase())) span.classList.add('is-key');
        statement.append(span);
    });
    const words = $$('.word', statement);

    /* ---------------------------------------------------------------
       3. Reveal engine: one observer, once-only, with sensible fallbacks
       --------------------------------------------------------------- */
    $$('[data-stagger]').forEach(group => [...group.children].forEach((child, index) => child.style.setProperty('--i', String(index))));
    $$('.cap-skills').forEach(group => [...group.children].forEach((child, index) => child.style.setProperty('--k', String(index))));
    $$('.intro-item').forEach((element, index) => element.style.setProperty('--n', String(index)));
    $$('.site-header .navigation>a').forEach((element, index) => element.style.setProperty('--n', String(index)));
    const show = element => {
        element.classList.add('is-visible');
        if (element.classList.contains('reveal')) setTimeout(() => element.classList.add('done'), 1600 + Number(element.style.getPropertyValue('--i') || 0) * 90);
    };
    // A clip-path'd element reports zero intersection to IntersectionObserver, so masked
    // images are observed through their (unclipped) parent and revealed from there.
    const hosts = new Map();
    const revealHost = host => { const element = hosts.get(host); if (!element) return; hosts.delete(host); revealObserver.unobserve(host); show(element); };
    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            // Elements already scrolled past (anchor jumps) are shown without ceremony.
            if (entry.isIntersecting || entry.boundingClientRect.top < 0) revealHost(entry.target);
        });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    $$('.reveal,.line-reveal,[data-reveal],[data-chars]').forEach(element => {
        const host = element.hasAttribute('data-reveal') && element.parentElement ? element.parentElement : element;
        hosts.set(host, element); revealObserver.observe(host);
    });
    const countObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            countObserver.unobserve(entry.target);
            if (isStatic()) return;
            const element = entry.target; const value = Number(element.dataset.count); const began = performance.now();
            const tick = now => {
                const progress = clamp((now - began) / 1400);
                element.textContent = isStatic() ? String(value) : String(Math.round(value * (1 - Math.pow(1 - progress, 4))));
                if (progress < 1 && !isStatic()) requestAnimationFrame(tick); else element.textContent = String(value);
            }; requestAnimationFrame(tick);
        });
    }, { threshold: .6 });
    $$('[data-count]').forEach(element => countObserver.observe(element));

    /* ---------------------------------------------------------------
       4. Hero entrance: waits for the portrait (max 1.2 s), never longer
       --------------------------------------------------------------- */
    const heroImage = $('.hero-portrait');
    let heroStarted = false;
    const startHero = () => { if (heroStarted) return; heroStarted = true; requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('hero-ready'))); };
    if (heroImage.complete) startHero(); else { heroImage.addEventListener('load', startHero, { once: true }); heroImage.addEventListener('error', startHero, { once: true }); }
    setTimeout(startHero, 1200);
    const portraitScroll = $('.portrait-scroll');
    const heroContent = $('.hero-content');
    const aboutWrap = $('.about-photo-wrap');
    const aboutPhoto = $('.about-photo');
    const parallaxEls = $$('[data-parallax]');
    const ribbon = $('.type-ribbon');
    const approach = $('#approach');
    const sectionIds = ['work', 'about', 'capabilities', 'evidence', 'approach', 'contact'];
    const navMap = { work: 'work', about: 'about', capabilities: 'about', evidence: 'about', approach: 'approach', contact: 'contact' };
    const sections = sectionIds.map(id => document.getElementById(id));
    const navLinks = $$('.navigation a');
    let activeSection = '';

    /* ---------------------------------------------------------------
       5. Gallery pin: layout and paint loop (shared by every scroll effect)
       --------------------------------------------------------------- */
    function setIndex(index, progress) {
        index = clamp(index, 0, projects.length - 1);
        if (index !== currentIndex) {
            currentIndex = index; $('#project-current').textContent = String(index + 1).padStart(2, '0'); select.value = String(index);
            $('.prev-project').disabled = index === 0; $('.next-project').disabled = index === projects.length - 1;
        }
        $('.gallery-progress>span').style.transform = `scaleX(${Math.max(.015, progress)})`;
        work.classList.toggle('gallery-complete', progress >= .995);
    }
    function layout(preserve = true) {
        const oldStart = start; const oldRange = range; const oldPinned = pinned;
        const oldFraction = oldRange ? clamp((scrollY - oldStart) / oldRange) : 0;
        const wasInside = oldPinned && scrollY >= oldStart && scrollY <= oldStart + oldRange;
        viewport = root.clientWidth;
        headerHeight = header.offsetHeight;
        body.classList.remove('manual-gallery');
        body.style.setProperty('--header', `${headerHeight}px`);
        // Frame size follows the available stage height; images are never cropped.
        work.style.setProperty('--meta-height', 'auto');
        const padding = parseFloat(getComputedStyle(track).paddingLeft);
        const maxWidth = Math.max(200, viewport - padding * 2);
        let cardWidth = Math.min(maxWidth, 820);
        work.style.setProperty('--card-width', `${cardWidth}px`);
        const gap = viewport <= 800 ? 14 : 16;
        let metaHeight = 0;
        for (let pass = 0; pass < 3; pass++) {
            metaHeight = Math.max(...$$('.project-meta').map(element => element.scrollHeight));
            const imageHeight = Math.max(110, gallery.clientHeight - metaHeight - gap);
            cardWidth = Math.min(maxWidth, imageHeight * 1400 / 880);
            work.style.setProperty('--card-width', `${cardWidth}px`);
        }
        metaHeight = Math.max(...$$('.project-meta').map(element => element.scrollHeight));
        work.style.setProperty('--meta-height', `${metaHeight}px`);
        const mediaHeight = cardWidth * 880 / 1400;
        pinned = !paused && innerHeight >= 550 && viewport > 800 && mediaHeight + metaHeight + gap <= gallery.clientHeight + 3;
        body.classList.toggle('work-pinned', pinned);
        body.classList.toggle('manual-gallery', !pinned);
        if (!pinned) {
            work.style.setProperty('--card-width', `${Math.min(maxWidth, 720)}px`);
            work.style.setProperty('--meta-height', 'auto');
        }
        metrics = cards.map(card => ({ left: card.offsetLeft, width: card.offsetWidth }));
        distance = Math.max(0, track.scrollWidth - gallery.clientWidth);
        range = distance * .9;
        const linger = Math.min(viewport * .12, 180);
        work.style.height = pinned ? `${stage.offsetHeight + range + linger}px` : '';
        start = work.getBoundingClientRect().top + scrollY - headerHeight;
        if (pinned) {
            gallery.scrollLeft = 0;
            if (preserve && wasInside) scrollTo({ top: start + oldFraction * range, behavior: 'instant' });
        } else track.style.transform = '';
        needsLayout = false;
    }
    function queue() { if (!raf && !document.hidden) raf = requestAnimationFrame(paint); }
    let heroProgress = -1;
    function paint() {
        raf = 0;
        if (needsLayout) layout();
        const y = scrollY;
        const scrolled = y !== lastPaintY; lastPaintY = y;
        // Reads first (cursor target + rects), writes after, to avoid layout thrash.
        if (scrolled && cursorOn && mouse.seen) setTarget(document.elementFromPoint(mouse.x, mouse.y));
        const heroBottom = hero.getBoundingClientRect().bottom;
        // Safety net: anything on screen or already passed is revealed, whatever the observer did.
        if (scrolled && hosts.size) hosts.forEach((element, host) => { if (host.getBoundingClientRect().top < innerHeight * .9) revealHost(host); });
        const motion = !isStatic();
        const wide = viewport > 800;
        header.classList.toggle('scrolled', y > 12);
        // The header yields to the portrait while the hero leaves, then returns at Work.
        if (y < 30 || heroBottom <= headerHeight * 2 || $('.navigation').classList.contains('open')) header.classList.remove('header-away');
        else if (y - previousY > 2) header.classList.add('header-away');
        else if (y - previousY < -2) header.classList.remove('header-away');
        previousY = y;
        $('.page-progress>span').style.transform = `scaleX(${clamp(y / Math.max(1, root.scrollHeight - innerHeight))})`;
        // Hero → Work transition: portrait recedes in depth, copy drifts slower.
        const exit = clamp(y / Math.max(1, hero.offsetHeight));
        if (motion && exit !== heroProgress) {
            heroProgress = exit; const f = wide ? 1 : .45;
            portraitScroll.style.transform = `translate3d(0,${(exit * 80 * f).toFixed(1)}px,0) scale(${(1 - exit * .08 * f).toFixed(4)})`;
            heroContent.style.transform = `translate3d(0,${(-exit * 56 * f).toFixed(1)}px,0)`;
            heroContent.style.opacity = String((1 - exit * .9).toFixed(3));
        } else if (!motion && heroProgress !== -2) {
            heroProgress = -2; portraitScroll.style.transform = ''; heroContent.style.transform = ''; heroContent.style.opacity = '';
        }
        // Gallery
        let x = 0;
        if (pinned) {
            const progress = clamp((y - start) / Math.max(1, range));
            x = progress * distance;
            track.style.transform = `translate3d(${-x}px,0,0)`;
            let nearest = 0; let minimum = Infinity;
            metrics.forEach(({ left, width }, index) => {
                const difference = Math.abs(left + width / 2 - x - viewport / 2);
                if (difference < minimum) { minimum = difference; nearest = index; }
            });
            setIndex(progress < .005 ? 0 : progress > .995 ? projects.length - 1 : nearest, progress);
        } else {
            x = gallery.scrollLeft;
            const step = (metrics[1]?.left || 1) - (metrics[0]?.left || 0);
            setIndex(Math.round(x / Math.max(1, step)), x / Math.max(1, distance));
        }
        // Project images reveal as each card enters the visible gallery area (once).
        if (work.getBoundingClientRect().top < innerHeight * .72) {
            cards.forEach((card, index) => {
                if (!card.classList.contains('in') && metrics[index] && metrics[index].left - x < viewport * .9) card.classList.add('in');
            });
        }
        if (motion) {
            // Word-by-word statement + keyword highlight
            const rect = statement.getBoundingClientRect();
            const wordProgress = clamp((innerHeight * .87 - rect.top) / (innerHeight * .62));
            words.forEach((word, index) => {
                const value = clamp(wordProgress * (words.length + 2) - index);
                word.style.opacity = String((.2 + .8 * value).toFixed(3));
                if (word.classList.contains('is-key')) word.style.setProperty('--k', value.toFixed(3));
            });
            const ribbonRect = ribbon.getBoundingClientRect();
            ribbon.style.setProperty('--ribbon-x', `${-clamp((innerHeight - ribbonRect.top) / (innerHeight + ribbonRect.height)) * 240}px`);
            approach.querySelector('.approach-asterisk').style.setProperty('--asterisk-rotate', `${(innerHeight - approach.getBoundingClientRect().top) * .075}deg`);
            // About portrait settles from a slight zoom while the mask opens.
            const photoRect = aboutWrap.getBoundingClientRect();
            const settle = clamp((innerHeight - photoRect.top) / (innerHeight * .85 + photoRect.height * .25));
            aboutPhoto.style.setProperty('--ps', (1 + (wide ? .16 : .08) * (1 - settle)).toFixed(4));
            // Gentle depth parallax (desktop only)
            parallaxEls.forEach(element => {
                if (!wide) { if (element._off) { element.style.transform = ''; element._off = 0; } return; }
                const r = element.getBoundingClientRect();
                if (r.bottom < -300 || r.top > innerHeight + 300) return;
                const base = r.top - (element._off || 0);
                const center = base + r.height / 2 - innerHeight / 2;
                element._off = center * Number(element.dataset.parallax);
                element.style.transform = `translate3d(0,${element._off.toFixed(1)}px,0)`;
            });
        }
        $$('.process-card').forEach(card => {
            const rect = card.getBoundingClientRect(); card.classList.toggle('is-active', rect.top < innerHeight * .7 && rect.bottom > innerHeight * .3);
        });
        // Current-section indicator in the navigation
        let current = '';
        sections.forEach((section, index) => { if (section.getBoundingClientRect().top <= innerHeight * .4) current = navMap[sectionIds[index]]; });
        if (current !== activeSection) {
            activeSection = current;
            navLinks.forEach(link => { const on = link.getAttribute('href') === `#${current}`; link.classList.toggle('is-current', on); if (on) link.setAttribute('aria-current', 'true'); else link.removeAttribute('aria-current'); });
        }
    }
    function seek(index) {
        index = clamp(index, 0, projects.length - 1); if (needsLayout) layout();
        // Center selected cards, while respecting the first and last bounds.
        const target = clamp(metrics[index].left + metrics[index].width / 2 - viewport / 2, 0, distance);
        if (pinned) scrollTo({ top: Math.ceil(start + target / Math.max(1, distance) * range), behavior: paused ? 'instant' : 'smooth' });
        else gallery.scrollTo({ left: target, behavior: paused ? 'instant' : 'smooth' });
        queue();
    }
    $('.prev-project').addEventListener('click', () => seek(currentIndex - 1));
    $('.next-project').addEventListener('click', () => seek(currentIndex + 1));
    select.addEventListener('change', () => seek(Number(select.value)));
    stage.addEventListener('keydown', event => {
        if (event.target.tagName === 'SELECT' || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); seek(currentIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    gallery.addEventListener('scroll', () => { if (!pinned) queue(); }, { passive: true });
    $$('a[href="#work"]').forEach(link => link.addEventListener('click', event => {
        if (!pinned) return;
        event.preventDefault(); history.pushState(null, '', '#work'); scrollTo({ top: Math.ceil(start), behavior: 'smooth' });
    }));
    let touch;
    gallery.addEventListener('touchstart', event => { if (event.touches.length === 1) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
    gallery.addEventListener('touchend', event => {
        if (!touch || !pinned) return;
        const end = event.changedTouches[0]; const dx = end.clientX - touch.x; const dy = end.clientY - touch.y;
        if (Math.abs(dx) > 65 && Math.abs(dy) < 40) seek(currentIndex + (dx < 0 ? 1 : -1));
        touch = null;
    }, { passive: true });
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', () => { needsLayout = true; queue(); }, { passive: true });
    addEventListener('load', () => { needsLayout = true; queue(); });
    document.fonts.ready.then(() => { needsLayout = true; queue(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else queue(); });

    /* ---------------------------------------------------------------
       6. Mouse drag for the manual gallery (mouse only; clicks still work)
       --------------------------------------------------------------- */
    let drag = null;
    gallery.addEventListener('pointerdown', event => {
        if (pinned || event.pointerType !== 'mouse' || event.button !== 0) return;
        drag = { x: event.clientX, left: gallery.scrollLeft, moved: false, id: event.pointerId };
    });
    addEventListener('pointermove', event => {
        if (!drag) return; const dx = event.clientX - drag.x;
        if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; gallery.classList.add('is-dragging'); try { gallery.setPointerCapture(drag.id); } catch { /* ignore */ } }
        if (drag.moved) gallery.scrollLeft = drag.left - dx;
    });
    const endDrag = () => {
        if (!drag) return;
        if (drag.moved) { const block = event => { event.stopPropagation(); event.preventDefault(); }; gallery.addEventListener('click', block, { capture: true, once: true }); setTimeout(() => gallery.removeEventListener('click', block, true), 50); }
        gallery.classList.remove('is-dragging'); drag = null;
    };
    addEventListener('pointerup', endDrag); addEventListener('pointercancel', endDrag);

    /* ---------------------------------------------------------------
       7. Custom cursor: dot + interpolated ring, state-aware, fine pointers only
       --------------------------------------------------------------- */
    const cursorEl = $('.cursor');
    const ring = $('.cursor-ring');
    const dot = $('.cursor-dot');
    const cursorText = $('.cursor-text');
    const mouse = { x: -100, y: -100, seen: false };
    let cursorOn = false; let cState = 'default'; let cLight = false;
    let cx = -100; let cy = -100; let rx = -100; let ry = -100; let cRaf = 0;
    let tgx = 0; let tgy = 0; let gx = 0; let gy = 0;
    function resolveState(target) {
        if (!target || !target.closest) return 'default';
        if (target.closest('select,input,textarea,[contenteditable="true"]')) return 'hidden'; // keep native behaviour
        if (target.closest('.project-media')) return 'project';
        if (body.classList.contains('manual-gallery') && target.closest('.gallery-window') && !target.closest('a,select')) return 'drag';
        if (target.closest('a,button,summary,label,[role="button"]')) return 'link';
        if (target.closest('[data-cursor="image"]')) return 'image';
        return 'default';
    }
    function setTarget(target) {
        if (!cursorOn) return;
        const next = resolveState(target);
        const light = Boolean(target && target.closest && target.closest('.light-section,.contact'));
        if (light !== cLight) { cLight = light; cursorEl.classList.toggle('on-light', light); }
        if (next === cState) return;
        cState = next;
        if (next === 'default') root.removeAttribute('data-cursor'); else root.setAttribute('data-cursor', next);
        cursorText.textContent = next === 'project' ? 'View\nproject' : next === 'drag' ? '← Drag →' : '';
    }
    function cursorTick() {
        cRaf = 0;
        const k = isStatic() ? 1 : .17;
        rx += (cx - rx) * k; ry += (cy - ry) * k;
        dot.style.transform = `translate3d(${cx}px,${cy}px,0)`;
        ring.style.transform = `translate3d(${rx.toFixed(2)}px,${ry.toFixed(2)}px,0)`;
        let settling = Math.abs(cx - rx) > .15 || Math.abs(cy - ry) > .15;
        if (!isStatic() && scrollY < hero.offsetHeight) {
            gx += (tgx - gx) * .06; gy += (tgy - gy) * .06;
            hero.style.setProperty('--gx', gx.toFixed(3)); hero.style.setProperty('--gy', gy.toFixed(3));
            if (Math.abs(tgx - gx) > .002 || Math.abs(tgy - gy) > .002) settling = true;
        }
        if (settling) cRaf = requestAnimationFrame(cursorTick);
    }
    const kick = () => { if (!cRaf) cRaf = requestAnimationFrame(cursorTick); };
    function hideCursor() { mouse.seen = false; cursorEl.classList.remove('is-active'); root.classList.remove('is-pressed'); }
    function syncCursor() {
        cursorOn = finePointer.matches;
        root.classList.toggle('has-cursor', cursorOn);
        if (!cursorOn) { hideCursor(); root.removeAttribute('data-cursor'); cState = 'default'; }
    }
    syncCursor();
    finePointer.addEventListener('change', syncCursor);
    document.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        mouse.x = event.clientX; mouse.y = event.clientY;
        if (!cursorOn) return;
        if (!mouse.seen) { mouse.seen = true; cx = rx = event.clientX; cy = ry = event.clientY; cursorEl.classList.add('is-active'); }
        cx = event.clientX; cy = event.clientY;
        tgx = (cx / innerWidth - .5) * 2; tgy = (cy / innerHeight - .5) * 2;
        setTarget(event.target);
        kick();
    }, { passive: true });
    document.addEventListener('pointerdown', event => { if (cursorOn && event.pointerType !== 'touch') root.classList.add('is-pressed'); });
    const release = () => root.classList.remove('is-pressed');
    document.addEventListener('pointerup', release); document.addEventListener('pointercancel', release);
    document.addEventListener('mouseout', event => { if (!event.relatedTarget) hideCursor(); });
    document.documentElement.addEventListener('mouseleave', hideCursor);
    addEventListener('blur', hideCursor);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideCursor(); });

    /* ---------------------------------------------------------------
       8. Magnetic buttons: restrained, mouse only, never changes hit layout
       --------------------------------------------------------------- */
    $$('[data-magnetic]').forEach(element => {
        const strength = Number(element.dataset.magnetic) || 8;
        const offset = () => [parseFloat(element.style.getPropertyValue('--mx')) || 0, parseFloat(element.style.getPropertyValue('--my')) || 0];
        const reset = () => { element.classList.remove('is-magnetic'); element.style.setProperty('--mx', '0px'); element.style.setProperty('--my', '0px'); };
        element.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && cursorOn && !isStatic()) element.classList.add('is-magnetic'); });
        element.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse' || !cursorOn || isStatic()) return;
            const rect = element.getBoundingClientRect(); const [ox, oy] = offset();
            const dx = clamp((event.clientX - (rect.left - ox + rect.width / 2)) / (rect.width / 2), -1, 1);
            const dy = clamp((event.clientY - (rect.top - oy + rect.height / 2)) / (rect.height / 2), -1, 1);
            element.style.setProperty('--mx', `${(dx * strength).toFixed(1)}px`); element.style.setProperty('--my', `${(dy * strength).toFixed(1)}px`);
        });
        element.addEventListener('pointerleave', reset); element.addEventListener('blur', reset);
    });

    /* ---------------------------------------------------------------
       9. Navigation, motion toggle, dialog
       --------------------------------------------------------------- */
    const menu = $('.menu-button');
    function closeMenu() { $('.navigation').classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Open navigation'); }
    menu.addEventListener('click', () => {
        const open = $('.navigation').classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
        header.classList.remove('header-away');
    });
    $$('.navigation a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    function updateMotion() {
        const inside = pinned && scrollY >= start && scrollY <= start + range;
        const selected = Math.max(0, currentIndex);
        if (reduced.matches) paused = true;
        root.classList.toggle('static', paused || root.classList.contains('failsafe'));
        body.classList.toggle('motion-paused', paused);
        $('.motion-button').disabled = reduced.matches;
        $('.motion-button').textContent = paused ? '▷' : 'Ⅱ';
        $('.motion-button').setAttribute('aria-label', paused ? 'Play motion' : 'Pause motion');
        $('.motion-button').title = paused ? 'Play motion' : 'Pause motion';
        if (paused) cards.forEach(card => card.classList.add('in'));
        heroProgress = -1; needsLayout = true; layout(false);
        if (inside) {
            if (pinned) seek(selected);
            else { work.scrollIntoView({ block: 'start', behavior: 'instant' }); seek(selected); }
        }
        queue();
    }
    $('.motion-button').addEventListener('click', () => { paused = !paused; updateMotion(); });
    reduced.addEventListener('change', event => { paused = event.matches; updateMotion(); });
    function openProject(index) {
        const project = projects[index]; previousFocus = document.activeElement;
        $('#dialog-image').src = project.image; $('#dialog-image').alt = `Full project preview for ${project.title}`;
        dialog.style.setProperty('--dialog-bg', project.background || '#c5d4c5');
        $('#dialog-title').textContent = project.title; $('#dialog-category').textContent = project.category;
        $('#dialog-status').textContent = project.status; $('#dialog-description').textContent = project.description; $('#dialog-contribution').textContent = project.contribution;
        root.classList.add('cursor-off'); // the modal sits in the top layer; use the native pointer inside it
        dialog.showModal(); body.style.overflow = 'hidden';
    }
    $('.dialog-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { body.style.overflow = ''; root.classList.remove('cursor-off'); previousFocus?.focus({ preventScroll: true }); });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return; const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    updateMotion();
    // Script reached the end without errors: the failsafe stands down.
    root.classList.add('ready');
    if (root.classList.contains('failsafe')) { root.classList.remove('failsafe'); root.classList.toggle('static', paused); }
})();




