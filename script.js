document.addEventListener('DOMContentLoaded', () => {

    // ─── DOM refs ────────────────────────────────────────────────────────────
    const DOM = {
        mainContent:     document.getElementById('main-content'),
        navSection:      document.getElementById('navSection'),
        sidebarOverlay:  document.getElementById('sidebarOverlay'),
        mobileMenuBtn:   document.getElementById('mobileMenuBtn'),
        backToTop:       document.getElementById('backToTop'),
        networkContainer: document.getElementById('network'),
    };

    // ─── localStorage wrapper ────────────────────────────────────────────────
    const Store = {
        get(key) {
            try { return localStorage.getItem(key); }
            catch { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(key, value); }
            catch { /* private/quota - silently ignore */ }
        },
    };

    // ─── Motion preference ───────────────────────────────────────────────────
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ─── State ───────────────────────────────────────────────────────────────
    let initNetwork  = null;    // set once D3 block runs
    let overlayTimer = null;

    // ─── Restore last active view ────────────────────────────────────────────
    const savedView = Store.get('gdd_active_view');
    if (savedView) {
        const targetBtn = document.querySelector(`.nav-btn[data-view-target="${savedView}"]`);
        if (targetBtn) activateView(targetBtn, savedView, false);
    }

    // ─── Single delegated click handler ─────────────────────────────────────
    document.body.addEventListener('click', (e) => {

        const navBtn = e.target.closest('.nav-btn');
        if (navBtn) {
            activateView(navBtn, navBtn.getAttribute('data-view-target'), true);
            return;
        }

        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn && !tabBtn.closest('.sidebar-nav')) {
            activateTab(tabBtn);
            return;
        }

        const interactBtn = e.target.closest('.btn-interact');
        if (interactBtn) {
            handleLogicTree(interactBtn);
            return;
        }

        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            handleNetworkFilter(filterBtn);
            return;
        }

        const beginBtn = e.target.closest('.begin-btn');
        if (beginBtn) {
            Store.set('premiseCardShown', 'true');
            const statusNavButton = document.querySelector('.nav-btn[data-view-target="status-view"]');
            if (statusNavButton) {
                activateView(statusNavButton, 'status-view', true);
            }
            return;
        }
    });

    // ─── View switching ──────────────────────────────────────────────────────
    function activateView(btn, targetViewId, shouldScroll) {
        const targetView = document.getElementById(targetViewId);
        if (!targetView) return;                                 // single guard, no duplicate below

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        // Swap visible section
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        targetView.classList.add('active');

        // Focus the heading for screen readers, then clean up the tabindex so it
        // does not linger in the natural tab order after the focus moves away.
        const heading = targetView.querySelector('h2');
        if (heading) {
            heading.setAttribute('tabindex', '-1');
            heading.focus({ preventScroll: true });
            heading.addEventListener('blur', () => heading.removeAttribute('tabindex'), { once: true });
        }

        Store.set('gdd_active_view', targetViewId);

        // Initialise (or re-centre) the network map if its view just became active
        if (targetViewId === 'network-view' && typeof initNetwork === 'function') {
            requestAnimationFrame(() => initNetwork());
        }

        // Jump straight to a specific sub-tab if the button carries a hint
        if (btn.dataset.specificTab) {
            requestAnimationFrame(() => {
                const subTabBtn = document.querySelector(`[data-tab-target="${btn.dataset.specificTab}"]`);
                if (subTabBtn) activateTab(subTabBtn);
            });
        }

        if (shouldScroll && DOM.mainContent) {
            DOM.mainContent.scrollTop = 0;
        }

        closeMobileMenu();
    }

    // ─── Tab panel switching ─────────────────────────────────────────────────
    function activateTab(btn) {
        const targetId       = btn.getAttribute('data-tab-target');
        const tabsContainer  = btn.closest('[role="tablist"]');
        if (!tabsContainer) return;

        // The content wrapper is usually the immediate next sibling; fall back to
        // a parent-scoped search for nested tab systems.
        const nextSib = tabsContainer.nextElementSibling;
        const contentContainer =
            (nextSib && nextSib.classList.contains('tab-content-container'))
                ? nextSib
                : (tabsContainer.parentElement
                    ? tabsContainer.parentElement.querySelector('.tab-content-container')
                    : null);

        tabsContainer.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });

        if (contentContainer) {
            contentContainer.querySelectorAll('.sub-tab-content').forEach(panel => {
                panel.classList.remove('active');
            });
        }

        btn.classList.add('active', 'visited');
        btn.setAttribute('aria-selected', 'true');

        const targetContent = document.getElementById(targetId);
        if (targetContent) targetContent.classList.add('active');
    }

    // ─── Expandable consequence panels ──────────────────────────────────────
    function handleLogicTree(btn) {
        const consequenceId = btn.getAttribute('aria-controls');
        const consequence   = document.getElementById(consequenceId);
        const isExpanded    = btn.getAttribute('aria-expanded') === 'true';

        // Collapse any open sibling
        btn.closest('.choices').querySelectorAll('.btn-interact').forEach(sib => {
            if (sib === btn) return;
            sib.setAttribute('aria-expanded', 'false');
            const sibCons = document.getElementById(sib.getAttribute('aria-controls'));
            if (sibCons) { sibCons.classList.remove('show'); sibCons.hidden = true; }
        });

        if (consequence) {
            btn.setAttribute('aria-expanded', String(!isExpanded));
            consequence.classList.toggle('show', !isExpanded);
            consequence.hidden = isExpanded;
        }
    }

    // ─── Keyboard navigation for tab / nav button groups ────────────────────
    document.body.addEventListener('keydown', (e) => {
        const isTabBtn = e.target.classList.contains('tab-btn');
        const isNavBtn = e.target.classList.contains('nav-btn');
        if (!isTabBtn && !isNavBtn) return;

        const btn       = e.target;
        // BUG FIX: previously the ternary produced the same string in both branches.
        const container = btn.closest('[role="tablist"]');
        if (!container) return;

        const btnSelector = isTabBtn ? '.tab-btn' : '.nav-btn';
        const btns        = Array.from(container.querySelectorAll(btnSelector));
        const idx         = btns.indexOf(btn);
        let nextBtn;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                nextBtn = btns[(idx + 1) % btns.length]; break;
            case 'ArrowLeft':
            case 'ArrowUp':
                nextBtn = btns[(idx - 1 + btns.length) % btns.length]; break;
            case 'Home':
                nextBtn = btns[0]; break;
            case 'End':
                nextBtn = btns[btns.length - 1]; break;
        }

        if (nextBtn) {
            e.preventDefault();
            nextBtn.focus();
            if (isTabBtn) activateTab(nextBtn);
            else activateView(nextBtn, nextBtn.getAttribute('data-view-target'), true);
        }
    });

    // ─── Escape closes the mobile menu ──────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && DOM.navSection?.classList.contains('open')) {
            closeMobileMenu();
            DOM.mobileMenuBtn?.focus();
        }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // NETWORK MAP  (D3 force graph)
    // ═══════════════════════════════════════════════════════════════════════

    networkNodes.append('circle')
            .attr('r',    d => d.type === 'character' ? 22 : 16)
            .attr('fill', d => d.color)
            .style('stroke',       '#1a1a1a')
            .style('stroke-width', '2.5px');

        networkNodes.append('text')
            .attr('dy',           d => (d.type === 'character' ? 36 : 28))
            .attr('text-anchor',  'middle')
            .text(d => d.shortName)
            .style('font-family', "'DM Sans', system-ui, sans-serif")
            .style('font-size',   '11px')
            .style('font-weight', '700')
            .style('fill',        '#f0ebe3')
            .style('pointer-events', 'none');

        // ── Tooltip on hover ────────────────────────────────────────────────
        const tooltip = d3.select('body').append('div')
            .attr('role', 'tooltip')
            .style('position',       'fixed')
            .style('background',     '#1a1a1a')
            .style('color',          '#f0ebe3')
            .style('border',         '1px solid #3a3a3a')
            .style('border-radius',  '3px')
            .style('padding',        '6px 10px')
            .style('font-family',    "'DM Sans', system-ui, sans-serif")
            .style('font-size',      '12px')
            .style('pointer-events', 'none')
            .style('opacity',        0)
            .style('z-index',        9999)
            .style('max-width',      '220px')
            .style('line-height',    '1.5');

    const gameData = {
        nodes: [
            // Playable characters
            { id: 'karunasena', shortName: 'Karuna',   label: 'Karunasena',          type: 'character', role: 'First-time voter' },
            { id: 'kamala',     shortName: 'Kamala',   label: 'Kamala',               type: 'character', role: 'School teacher (Locked)' },
            { id: 'kumaran',    shortName: 'Kumaran',  label: 'Kumaran',              type: 'character', role: 'Migrant worker (Locked)' },
            // NPCs
            { id: 'mahinda',    shortName: 'Mahinda',  label: 'Mahinda Bandara',      type: 'npc',       role: 'Incumbent politician' },
            { id: 'elderly',    shortName: 'Soma',     label: 'Aunty Soma',           type: 'npc',       role: 'Voter since 1983' },
            { id: 'nandadasa',  shortName: 'Nanda',    label: 'Nandadasa',            type: 'npc',       role: 'Grama Sevaka' },
            { id: 'shopkeeper', shortName: 'Mudalali', label: 'Mudalali Perera',      type: 'npc',       role: 'Junction shop owner' },
            { id: 'sirisena',   shortName: 'Sirisena', label: 'Uncle Sirisena',       type: 'npc',       role: 'Misinformation vector' },
            { id: 'police',     shortName: 'Sergeant', label: 'Sgt. Wickramasinghe',  type: 'npc',       role: 'Election law authority' },
            { id: 'queue',      shortName: 'Queue',    label: 'Queue People',         type: 'npc',       role: 'Election day VP gains' },
            // Locations — BUG FIX: removed internal "(loc1)" IDs from user-visible labels
            { id: 'grama_office',     shortName: 'Office',   label: 'Grama Sevaka Office',  type: 'location', role: 'Voter registration hub' },
            { id: 'uncle_house',      shortName: 'Uncle',    label: "Uncle's House",         type: 'location', role: 'Misinformation source' },
            { id: 'ec_board',         shortName: 'Board',    label: 'EC Notice Board',       type: 'location', role: 'Official verification' },
            { id: 'shop',             shortName: 'Shop',     label: "Mudalali's Boutique",   type: 'location', role: 'Rumour exchange' },
            { id: 'community_hall',   shortName: 'Hall',     label: 'Community Hall',        type: 'location', role: 'Atmospheric space' },
            { id: 'police_station',   shortName: 'Police',   label: 'Police Station',        type: 'location', role: 'Law enforcement' },
            { id: 'skeptics_cafe',    shortName: 'Cafe',     label: 'Skeptics Cafe',         type: 'location', role: 'Hidden verification node' },
            { id: 'campaign_tent',    shortName: 'Tent',     label: 'Campaign Tent',         type: 'location', role: 'Manifesto & candidate' },
            { id: 'polling_station',  shortName: 'Polling',  label: 'Polling Station',       type: 'location', role: 'Week 0 climax' },
            { id: 'kovil',            shortName: 'Kovil',    label: 'Kovil',                 type: 'location', role: 'Atmospheric node' },
            { id: 'temple',           shortName: 'Temple',   label: 'Temple',                type: 'location', role: 'Atmospheric node' },
            { id: 'bar',              shortName: 'Bar',      label: 'The Bar',               type: 'location', role: 'Atmospheric node' },
            { id: 'boarding',         shortName: 'Boarding', label: "Kumaran's Boarding",    type: 'location', role: "Kumaran's residence" },
            // Scenarios / abstract systems
            { id: 'registration',   shortName: 'Reg.',     label: 'Voter Registration',   type: 'scenario', role: 'Weeks 6–4 deadline system' },
            { id: 'misinformation', shortName: 'Misinfo',  label: 'Misinfo Evaluation',   type: 'scenario', role: 'Core loop — Uncle messages' },
            { id: 'manifesto',      shortName: 'Manifesto',label: 'Manifesto Comparison', type: 'scenario', role: 'Road-promise evidence chain' },
        ],

        links: [
            // Characters ↔ primary locations
            { source: 'karunasena', target: 'uncle_house',     type: 'conflict'  },
            { source: 'karunasena', target: 'grama_office',    type: 'location'  },
            { source: 'karunasena', target: 'ec_board',        type: 'location'  },
            { source: 'karunasena', target: 'polling_station', type: 'location'  },
            { source: 'kamala',     target: 'shop',            type: 'location'  },
            { source: 'kamala',     target: 'grama_office',    type: 'location'  },
            { source: 'kumaran',    target: 'boarding',        type: 'location'  },
            { source: 'kumaran',    target: 'grama_office',    type: 'location'  },
            // NPCs ↔ their home locations
            { source: 'mahinda',    target: 'campaign_tent',   type: 'location'  },
            { source: 'nandadasa',  target: 'grama_office',    type: 'location'  },
            { source: 'shopkeeper', target: 'shop',            type: 'location'  },
            { source: 'sirisena',   target: 'uncle_house',     type: 'location'  },
            { source: 'police',     target: 'police_station',  type: 'location'  },
            { source: 'elderly',    target: 'polling_station', type: 'location'  },
            { source: 'queue',      target: 'polling_station', type: 'location'  },
            // Key NPC ↔ scenario influence links
            { source: 'sirisena',   target: 'misinformation',  type: 'influence' },
            { source: 'ec_board',   target: 'misinformation',  type: 'trust'     },
            { source: 'ec_board',   target: 'skeptics_cafe',   type: 'trust'     },
            { source: 'nandadasa',  target: 'registration',    type: 'trust'     },
            { source: 'mahinda',    target: 'manifesto',       type: 'influence' },
            { source: 'campaign_tent', target: 'manifesto',    type: 'location'  },
            // Cross-location consequence chains (the "town remembers" system)
            { source: 'misinformation', target: 'grama_office',   type: 'conflict'  },
            { source: 'misinformation', target: 'police_station',  type: 'conflict'  },
            { source: 'registration',   target: 'polling_station', type: 'trust'     },
            { source: 'manifesto',      target: 'campaign_tent',   type: 'conflict'  },
            { source: 'sirisena',       target: 'registration',    type: 'conflict'  },
        ],
    };

    if (DOM.networkContainer && typeof d3 !== 'undefined') {

        gameData.nodes.forEach(n => { n.color = themeColors[n.type] || '#555'; });

        let width  = DOM.networkContainer.clientWidth  || 800;
        let height = DOM.networkContainer.clientHeight || 500;
        let networkInitialized = false;

        // All D3 selections scoped here — no outer-scope `let` pollution
        const svg = d3.select('#network').append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .attr('role', 'img')
            .attr('aria-label', 'Force-directed network of Road Remains characters, locations, and systems');

        // Reduced-motion: settle instantly rather than animating
        const alphaDecay = prefersReducedMotion ? 0.3 : 0.04;

        const simulation = d3.forceSimulation(gameData.nodes)
            .force('link',      d3.forceLink(gameData.links).id(d => d.id).distance(120))
            .force('charge',    d3.forceManyBody().strength(-480))
            .force('collision', d3.forceCollide().radius(42))
            .force('center',    d3.forceCenter(width / 2, height / 2))
            .alphaDecay(alphaDecay);

        const g            = svg.append('g');
        const zoomBehavior = d3.zoom().scaleExtent([0.4, 3.5]).on('zoom', e => g.attr('transform', e.transform));
        svg.call(zoomBehavior);

        const linkColorMap = {
            trust:     '#2F5D46',
            conflict:  '#8B1A2B',
            influence: '#6B7280',
            location:  '#B8860B',
        };

        const networkLinks = g.selectAll('line').data(gameData.links).enter().append('line')
            .attr('class',          d => `link line-${d.type}`)
            .attr('stroke-width',   d => d.type === 'trust' ? 3 : 1.5)
            .attr('stroke',         d => linkColorMap[d.type] || '#555')
            .attr('stroke-dasharray', d => d.type === 'conflict' ? '6,4' : null)
            .attr('stroke-opacity', 0.7);

        // Node groups
        const networkNodes = g.selectAll('g.node').data(gameData.nodes).enter().append('g')
            .attr('class', 'node')
            .attr('tabindex', '0')                  // keyboard reachable
            .attr('role', 'button')
            .attr('aria-label', d => `${d.label} — ${d.role}`)
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0);  d.fx = null; d.fy = null; })
            );

        networkNodes.append('circle')
            .attr('r',    d => d.type === 'character' ? 22 : 16)
            .attr('fill', d => d.color)
            .style('stroke',       '#1a1a1a')
            .style('stroke-width', '2.5px');

        networkNodes.append('text')
            .attr('dy',           d => (d.type === 'character' ? 36 : 28))
            .attr('text-anchor',  'middle')
            .text(d => d.shortName)
            .style('font-family', "'DM Sans', system-ui, sans-serif")
            .style('font-size',   '11px')
            .style('font-weight', '700')
            .style('fill',        '#f0ebe3')
            .style('pointer-events', 'none');

        // ── Tooltip on hover ────────────────────────────────────────────────
        const tooltip = d3.select('body').append('div')
            .attr('role', 'tooltip')
            .style('position',       'fixed')
            .style('background',     '#1a1a1a')
            .style('color',          '#f0ebe3')
            .style('border',         '1px solid #3a3a3a')
            .style('border-radius',  '3px')
            .style('padding',        '6px 10px')
            .style('font-family',    "'DM Sans', system-ui, sans-serif")
            .style('font-size',      '12px')
            .style('pointer-events', 'none')
            .style('opacity',        0)
            .style('z-index',        9999)
            .style('max-width',      '220px')
            .style('line-height',    '1.5');

        networkNodes
            .on('mouseenter', (event, d) => {
                tooltip
                    .html(`<strong>${d.label}</strong><br><span style="opacity:0.7;font-size:11px">${d.role}</span>`)
                    .style('left',  `${event.clientX + 12}px`)
                    .style('top',   `${event.clientY - 10}px`)
                    .transition().duration(120).style('opacity', 1);
            })
            .on('mousemove', (event) => {
                tooltip
                    .style('left', `${event.clientX + 12}px`)
                    .style('top',  `${event.clientY - 10}px`);
            })
            .on('mouseleave', () => {
                tooltip.transition().duration(150).style('opacity', 0);
            });

        // ── Simulation tick ─────────────────────────────────────────────────
        simulation.on('tick', () => {
            const pad = 28;
            gameData.nodes.forEach(d => {
                d.x = Math.max(pad, Math.min(width - pad, d.x));
                d.y = Math.max(pad, Math.min(height - pad, d.y));
            });

            networkLinks
                .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);

            networkNodes.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // ── Node click: highlight connected subgraph ─────────────────────────
        networkNodes.on('click', (event, d) => {
            event.stopPropagation();

            const connectedIds = new Set([d.id]);
            gameData.links.forEach(l => {
                const srcId = l.source.id ?? l.source;
                const tgtId = l.target.id ?? l.target;
                if (srcId === d.id || tgtId === d.id) {
                    connectedIds.add(srcId);
                    connectedIds.add(tgtId);
                }
            });

            networkNodes.style('opacity', n => connectedIds.has(n.id) ? 1 : 0.1);
            networkLinks.style('stroke-opacity', l =>
                (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.05
            );

            // Populate the sidebar info panel
            const panel = document.getElementById('selectedInfo');
            if (panel) {
                const connectionCount = [...connectedIds].length - 1;   // exclude self
                const wrapper = document.createElement('div');
                wrapper.className = 'node-info-panel';
                wrapper.innerHTML = `
                    <h4 class="node-info-title">${d.label}</h4>
                    <p class="node-info-role">${d.role}</p>
                    <span class="node-type-badge">${d.type}</span>
                    <p style="margin-top:0.75rem; font-size:12px; opacity:0.6;">
                        ${connectionCount} direct connection${connectionCount !== 1 ? 's' : ''}
                    </p>`;
                panel.replaceChildren(wrapper);
            }

            // Switch sidebar to the Info tab
            const infoTabBtn = document.querySelector('[data-tab-target="info-tab"]');
            if (infoTabBtn) activateTab(infoTabBtn);
        });

        // Clicking the SVG background clears the selection
        svg.on('click', () => {
            networkNodes.style('opacity', 1);
            networkLinks.style('stroke-opacity', 0.7);
            const panel = document.getElementById('selectedInfo');
            if (panel) {
                const p = document.createElement('p');
                p.className = 'empty-state';
                p.textContent = 'Click on any node to view details.';
                panel.replaceChildren(p);
            }
        });

        // Keyboard activation for focused nodes
        networkNodes.on('keydown', (event, d) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                networkNodes.dispatch('click', { detail: event });
            }
        });

        // ── Reset button ────────────────────────────────────────────────────
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-pressed', 'false');
                });
                const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
                if (allBtn) {
                    allBtn.classList.add('active');
                    allBtn.setAttribute('aria-pressed', 'true');
                }
                networkNodes.style('opacity', 1);
                networkLinks.style('stroke-opacity', 0.7);

                const transitionDuration = prefersReducedMotion ? 0 : 750;
                svg.transition().duration(transitionDuration)
                   .call(zoomBehavior.transform, d3.zoomIdentity);

                simulation.alpha(0.6).restart();
            });
        }

        // ── initNetwork: called when the view first becomes visible ──────────
        initNetwork = function () {
            if (!DOM.networkContainer || DOM.networkContainer.clientWidth < 10) return;

            width  = DOM.networkContainer.clientWidth;
            height = DOM.networkContainer.clientHeight;

            svg.attr('viewBox', `0 0 ${width} ${height}`);
            simulation.force('center', d3.forceCenter(width / 2, height / 2));

            if (!networkInitialized) {
                // Seed positions near the centre so the simulation settles faster
                gameData.nodes.forEach(n => {
                    n.x = width  / 2 + (Math.random() - 0.5) * 120;
                    n.y = height / 2 + (Math.random() - 0.5) * 120;
                });
                setTimeout(() => {
                    simulation.alpha(1).restart();
                    networkInitialized = true;
                }, 50);
            } else {
                simulation.alpha(0.25).restart();
            }
        };

        // ── ResizeObserver keeps the graph centred when the container resizes ─
        // (more accurate than window 'resize', fires on panel layout changes too)
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => {
                const nwView = document.getElementById('network-view');
                if (nwView?.classList.contains('active')) initNetwork();
            }).observe(DOM.networkContainer);
        }
    }

    // ─── Network filter ──────────────────────────────────────────────────────
    function handleNetworkFilter(btn) {
        const networkNodes = document.querySelectorAll('#network g.node');
        const networkLinks = document.querySelectorAll('#network line');
        if (!networkNodes.length) return;

        document.querySelectorAll('.filter-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');

        const filter  = btn.dataset.filter;
        const typeMap = {
            characters: ['character', 'npc'],
            locations:  ['location'],
            scenarios:  ['scenario'],
        };

        // Re-select via D3 so we can read the bound data
        d3.select('#network').selectAll('g.node')
            .style('opacity', d =>
                filter === 'all' || (typeMap[filter]?.includes(d.type)) ? 1 : 0.05
            );

        d3.select('#network').selectAll('line')
            .style('stroke-opacity', filter === 'all' ? 0.7 : 0.08);
    }

    // ─── Dynamic layout metrics ──────────────────────────────────────────────
    function updateDynamicHeights() {
        const header = document.querySelector('.sidebar-header');
        if (header) {
            document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
        }
    }
    updateDynamicHeights();

    // ResizeObserver on the sidebar header is more accurate than window.resize
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader && typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(updateDynamicHeights).observe(sidebarHeader);
    }

    // ─── Mobile menu ─────────────────────────────────────────────────────────
    function closeMobileMenu() {
        DOM.navSection?.classList.remove('open');
        DOM.mobileMenuBtn?.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('menu-open');

        if (DOM.sidebarOverlay) {
            DOM.sidebarOverlay.classList.remove('visible');
            clearTimeout(overlayTimer);
            overlayTimer = setTimeout(() => {
                DOM.sidebarOverlay.style.display = 'none';
            }, 200);
        }
    }

    if (DOM.mobileMenuBtn) {
        DOM.mobileMenuBtn.addEventListener('click', () => {
            const isOpen = DOM.navSection?.classList.contains('open');
            if (isOpen) {
                closeMobileMenu();
            } else {
                DOM.navSection?.classList.add('open');
                DOM.mobileMenuBtn.setAttribute('aria-expanded', 'true');
                document.body.classList.add('menu-open');

                if (DOM.sidebarOverlay) {
                    clearTimeout(overlayTimer);
                    DOM.sidebarOverlay.style.display = 'block';
                    requestAnimationFrame(() => DOM.sidebarOverlay.classList.add('visible'));
                }
            }
        });
    }

    DOM.sidebarOverlay?.addEventListener('click', closeMobileMenu);

    // ─── Scroll progress bar ─────────────────────────────────────────────────
    // Appended to document.body (position: fixed) so it stays at the top of the
    // viewport and does NOT scroll away with the content.
    if (DOM.mainContent) {
        const scrollProgressBar = document.createElement('div');
        scrollProgressBar.className = 'scroll-progress';
        scrollProgressBar.setAttribute('role', 'progressbar');
        scrollProgressBar.setAttribute('aria-label', 'Document read progress');
        scrollProgressBar.setAttribute('aria-valuemin', '0');
        scrollProgressBar.setAttribute('aria-valuemax', '100');
        scrollProgressBar.setAttribute('aria-valuenow', '0');
        document.body.appendChild(scrollProgressBar);   // fixed — outside scroll container

        DOM.mainContent.addEventListener('scroll', () => {
            // Show / hide back-to-top
            DOM.backToTop?.classList.toggle('visible', DOM.mainContent.scrollTop > 300);

            // Update progress bar
            const scrollHeight = DOM.mainContent.scrollHeight - DOM.mainContent.clientHeight;
            const progress = scrollHeight > 0
                ? Math.round((DOM.mainContent.scrollTop / scrollHeight) * 100)
                : 0;
            scrollProgressBar.style.width = `${progress}%`;
            scrollProgressBar.setAttribute('aria-valuenow', progress);
        }, { passive: true });

        DOM.backToTop?.addEventListener('click', () => {
            DOM.mainContent.scrollTo({
                top:      0,
                behavior: prefersReducedMotion ? 'auto' : 'smooth',
            });
        });
    }

    // ─── Delta gauge table: collapsible groups ───────────────────────────────
    const deltaTable = document.querySelector('.delta-table');
    if (deltaTable) {
        deltaTable.querySelectorAll('tr.table-group').forEach(tr => {
            tr.style.cursor = 'pointer';
            tr.setAttribute('tabindex', '0');           // keyboard focusable
            tr.setAttribute('role', 'button');
            tr.setAttribute('aria-expanded', 'true');

            const toggle = () => {
                const isExpanded = tr.getAttribute('aria-expanded') === 'true';
                tr.setAttribute('aria-expanded', String(!isExpanded));

                let next = tr.nextElementSibling;
                while (next && !next.classList.contains('table-group')) {
                    next.style.display = isExpanded ? 'none' : '';
                    next = next.nextElementSibling;
                }
            };

            tr.addEventListener('click',   toggle);
            tr.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
        });
    }

    // ─── PDF export ──────────────────────────────────────────────────────────
    const pdfBtn = document.getElementById('pdfExportBtn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => window.print());
    }

    // ─── Horizontal tab overflow shadow indicator ────────────────────────────
    function checkTabScroll(tabs) {
        const isAtEnd = Math.ceil(tabs.scrollLeft + tabs.clientWidth) >= tabs.scrollWidth;
        tabs.classList.toggle('is-at-end', isAtEnd);
    }

    document.querySelectorAll('.doc-tabs').forEach(tabs => {
        tabs.addEventListener('scroll', () => checkTabScroll(tabs), { passive: true });
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => checkTabScroll(tabs)).observe(tabs);
        }
        checkTabScroll(tabs);
    });

    // Automated Fallback for Missing Images (Moved from HTML)
    document.querySelectorAll('img').forEach(img => {
        img.addEventListener('error', function() {
            this.onerror = null;
            this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect width='100%25' height='100%25' fill='transparent'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='14' font-weight='bold' fill='%239A8060' text-anchor='middle' dominant-baseline='middle'%3EVisuals in progress...%3C/text%3E%3C/svg%3E";
            this.style.border = "1px dashed var(--c-border)";
            this.style.background = "transparent";
        });
    });

});