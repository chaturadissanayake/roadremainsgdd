/* ==========================================================================
   main.js — page behaviour: cover, section navigation, tabs, mobile menu,
   scenario buttons, collapsible table rows, previous/next, back-to-top, print.
   ========================================================================== */

(function () {
    'use strict';

    window.GDD = window.GDD || {};

    /* Opening the site, or a link without a #section, always lands on the cover */
    const DEFAULT_VIEW = 'cover-view';

    const sidebar = document.querySelector('.sidebar');
    const menuButton = document.getElementById('menuButton');
    const views = Array.from(document.querySelectorAll('.view-section'));
    const viewIds = views.map(v => v.id);

    /* ---------- Sections ---------- */

    function showView(id, options) {
        const opts = Object.assign({ scroll: true, push: true, tab: null }, options);
        const view = document.getElementById(id);
        if (!view || !viewIds.includes(id)) return;

        views.forEach(v => v.classList.toggle('active', v === view));

        document.querySelectorAll('.nav-link').forEach(link => {
            const isCurrent = link.dataset.viewTarget === id;
            if (isCurrent) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        document.body.classList.toggle('is-cover', id === 'cover-view');
        if (opts.push && window.location.hash !== `#${id}`) {
            window.history.pushState(null, '', `#${id}`);
        }

        if (opts.tab) showTab(opts.tab);

        if (id === 'network-view' && GDD.initNetwork) {
            requestAnimationFrame(() => GDD.initNetwork());
        }

        if (opts.scroll) window.scrollTo(0, 0);

        const heading = view.querySelector('h1, h2');
        if (heading && opts.scroll) {
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
        }

        closeMenu();
    }

    document.addEventListener('click', (event) => {
        const target = event.target.closest('[data-view-target]');
        if (!target) return;
        showView(target.dataset.viewTarget, { tab: target.dataset.specificTab || null });
    });

    window.addEventListener('popstate', () => {
        const id = window.location.hash.slice(1);
        showView(viewIds.includes(id) ? id : DEFAULT_VIEW, { push: false, scroll: true });
    });

    /* ---------- Tabs ---------- */

    function showTab(tabId) {
        const button = document.querySelector(`[data-tab-target="${tabId}"]`);
        if (!button) return;

        const tablist = button.closest('[role="tablist"]');
        const panels = tablist.nextElementSibling && tablist.nextElementSibling.classList.contains('tab-panels')
            ? tablist.nextElementSibling
            : tablist.parentElement.querySelector('.tab-panels');

        tablist.querySelectorAll('.tab').forEach(tab => {
            const selected = tab === button;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        });

        if (panels) {
            panels.querySelectorAll(':scope > .tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === tabId);
            });
        }
    }

    GDD.showTab = showTab;

    document.querySelectorAll('[role="tablist"]').forEach(tablist => {
        const tabs = Array.from(tablist.querySelectorAll('.tab'));
        tabs.forEach(tab => { tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1; });

        tablist.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (!tab) return;
            showTab(tab.dataset.tabTarget);

            /* A shorter panel can leave the page scrolled past its end, which reads as a jump.
               If the tabs have scrolled out of view, bring them back to the top. */
            const top = tablist.getBoundingClientRect().top;
            if (top < 0) window.scrollTo({ top: window.scrollY + top - 16 });
        });

        tablist.addEventListener('keydown', (event) => {
            const current = tabs.indexOf(document.activeElement);
            if (current === -1) return;

            let next = null;
            if (event.key === 'ArrowRight') next = tabs[(current + 1) % tabs.length];
            if (event.key === 'ArrowLeft')  next = tabs[(current - 1 + tabs.length) % tabs.length];
            if (event.key === 'Home')       next = tabs[0];
            if (event.key === 'End')        next = tabs[tabs.length - 1];

            if (next) {
                event.preventDefault();
                next.focus();
                showTab(next.dataset.tabTarget);
            }
        });
    });

    /* ---------- Mobile menu ---------- */

    function closeMenu() {
        if (!sidebar) return;
        sidebar.classList.remove('open');
        document.body.classList.remove('menu-open');
        if (menuButton) {
            menuButton.setAttribute('aria-expanded', 'false');
            menuButton.setAttribute('aria-label', 'Open menu');
        }
    }

    if (menuButton && sidebar) {
        menuButton.addEventListener('click', () => {
            const opening = !sidebar.classList.contains('open');
            sidebar.classList.toggle('open', opening);
            document.body.classList.toggle('menu-open', opening);
            menuButton.setAttribute('aria-expanded', String(opening));
            menuButton.setAttribute('aria-label', opening ? 'Close menu' : 'Open menu');
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
            closeMenu();
            if (menuButton) menuButton.focus();
        }
    });

    window.matchMedia('(min-width: 901px)').addEventListener('change', closeMenu);

    /* ---------- Scenario buttons: show one result at a time ---------- */

    document.addEventListener('click', (event) => {
        const choice = event.target.closest('.btn-interact');
        if (!choice) return;

        const wasOpen = choice.getAttribute('aria-expanded') === 'true';

        choice.closest('.choices').querySelectorAll('.btn-interact').forEach(button => {
            const result = document.getElementById(button.getAttribute('aria-controls'));
            const open = button === choice && !wasOpen;
            button.setAttribute('aria-expanded', String(open));
            if (result) result.hidden = !open;
        });
    });

    /* ---------- Collapsible group rows in long tables (gauges, achievements) ---------- */

    document.querySelectorAll('.data-table tr.table-group').forEach(row => {
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-expanded', 'true');

        const toggle = () => {
            const expanded = row.getAttribute('aria-expanded') === 'true';
            row.setAttribute('aria-expanded', String(!expanded));
            for (let next = row.nextElementSibling; next && !next.classList.contains('table-group'); next = next.nextElementSibling) {
                next.hidden = expanded;
            }
        };

        row.addEventListener('click', toggle);
        row.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle();
            }
        });
    });

    /* ---------- Previous / next at the end of every section ---------- */

    function buildPagers() {
        const navLinks = Array.from(document.querySelectorAll('.nav-link[data-view-target]'));

        navLinks.forEach((link, index) => {
            const view = document.getElementById(link.dataset.viewTarget);
            if (!view) return;

            const nav = document.createElement('nav');
            nav.className = 'pager';
            nav.setAttribute('aria-label', 'Continue reading');

            [[navLinks[index - 1], 'Previous'], [navLinks[index + 1], 'Next']].forEach(([target, label]) => {
                if (!target) { nav.appendChild(document.createElement('span')); return; }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = `pager-link pager-${label.toLowerCase()}`;
                button.dataset.viewTarget = target.dataset.viewTarget;

                const small = document.createElement('span');
                small.className = 'pager-label';
                small.textContent = label;
                const title = document.createElement('span');
                title.className = 'pager-title';
                title.textContent = target.textContent.trim();

                button.append(small, title);
                nav.appendChild(button);
            });

            view.appendChild(nav);
        });
    }

    buildPagers();

    /* ---------- Back to top and print ---------- */

    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
        window.addEventListener('scroll', () => {
            backToTop.classList.toggle('visible', window.scrollY > 400);
        }, { passive: true });
        backToTop.addEventListener('click', () => window.scrollTo({ top: 0 }));
    }

    const pdfButton = document.getElementById('pdfExportBtn');
    if (pdfButton) pdfButton.addEventListener('click', () => window.print());

    /* ---------- Images that fail to load ---------- */

    document.addEventListener('error', (event) => {
        const img = event.target;
        if (!img || img.tagName !== 'IMG') return;
        const note = document.createElement('p');
        note.className = 'img-missing';
        note.textContent = `Image not available: ${img.alt || 'untitled'}`;
        img.replaceWith(note);
    }, true);

    /* ---------- Start on the right section ---------- */

    const hashId = window.location.hash.slice(1);
    const startId = viewIds.includes(hashId) ? hashId : DEFAULT_VIEW;
    showView(startId, { push: false, scroll: false });
})();