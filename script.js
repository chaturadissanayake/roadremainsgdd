/**
 * Road Remains - Vanilla JS Architecture
 * Focus: Mobile Responsiveness, Event Delegation, LocalStorage State, Stable D3 Physics
 */
document.addEventListener('DOMContentLoaded', () => {

    // Cache core DOM elements
    const DOM = {
        mainContent: document.getElementById('main-content'),
        navSection: document.getElementById('navSection'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        mobileMenuBtn: document.getElementById('mobileMenuBtn'),
        backToTop: document.getElementById('backToTop'),
        networkContainer: document.getElementById('network')
    };

    // Safe LocalStorage Utility
    const Store = {
        get(key) {
            try { return localStorage.getItem(key); }
            catch (e) { return null; }
        },
        set(key, value) {
            try { localStorage.setItem(key, value); }
            catch (e) { /* silently fail */ }
        }
    };

    // Declared early so activateView() can safely check it during the
    // state-restore step below, before the D3 network map section
    // (further down this file) actually assigns it a function.
    let initNetwork = null;
    let overlayTimer; // Declared early to prevent Temporal Dead Zone ReferenceError during initial saved-view restoration

    // =========================================================================
    // 1. State Persistence & Initialization
    // =========================================================================
    // Remember the last opened view when the user refreshes
    const savedView = Store.get('gdd_active_view');
    if (savedView) {
        const targetBtn = document.querySelector(`.nav-btn[data-view-target="${savedView}"]`);
        if (targetBtn) {
            activateView(targetBtn, savedView, false);
        }
    }

    // =========================================================================
    // 2. Global Event Delegation
    // =========================================================================
    // Attaching a single listener to the body is significantly more performant
    // than attaching individual listeners to dozens of buttons.
    document.body.addEventListener('click', (e) => {
        
        // Handle Sidebar Navigation Clicks
        const navBtn = e.target.closest('.nav-btn');
        if (navBtn) {
            const targetId = navBtn.getAttribute('data-view-target');
            activateView(navBtn, targetId, true);
            return;
        }
        
        // Handle Inner Document Tab Clicks (excluding sidebar nav if it uses tab role)
        const tabBtn = e.target.closest('.tab-btn');
        if (tabBtn && !tabBtn.closest('.sidebar-nav')) {
            activateTab(tabBtn);
            return;
        }

        // Handle Logic Tree Interactive Buttons
        const interactBtn = e.target.closest('.btn-interact');
        if (interactBtn) {
            handleLogicTree(interactBtn);
            return;
        }

        // Handle Network Map Filters
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            handleNetworkFilter(filterBtn);
            return;
        }
    });

    // =========================================================================
    // 3. Core Functional Logic
    // =========================================================================

    function activateView(btn, targetViewId, shouldScroll) {
        const targetView = document.getElementById(targetViewId);
        if (!targetView) return;

        // Reset all navigation buttons
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        
        // Hide all views
        document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
        
        // Activate selected button and view
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        if (targetView) {
            targetView.classList.add('active');
            
            // A11y: Move focus to the new section's header
            const heading = targetView.querySelector('h2');
            if (heading) {
                heading.setAttribute('tabindex', '-1');
                heading.focus({ preventScroll: true });
            }
        }

        // Persist the choice in local storage safely
        Store.set('gdd_active_view', targetViewId);

        // Force D3.js dimension recalculation if the map becomes visible
        if (targetViewId === 'network-view' && typeof initNetwork === 'function') {
            requestAnimationFrame(() => initNetwork());
        }

        if (btn.dataset.specificTab) {
            requestAnimationFrame(() => {
                const tabBtn = document.querySelector(`[data-tab-target="${btn.dataset.specificTab}"]`);
                if (tabBtn) activateTab(tabBtn);
            });
        }

        // Reset scroll position for the new view
        if (shouldScroll && DOM.mainContent) {
            DOM.mainContent.scrollTop = 0;
        }
        
        closeMobileMenu();
    }

    function activateTab(btn) {
        const targetId = btn.getAttribute('data-tab-target');
        const tabsContainer = btn.closest('[role="tablist"]');
        if (!tabsContainer) return;

        let contentContainer;
        const nextSib = tabsContainer.nextElementSibling;
        
        // Resolve the correct content container relative to the tabs
        if (nextSib && nextSib.classList.contains('tab-content-container')) {
            contentContainer = nextSib;
        } else {
            const parent = tabsContainer.parentElement;
            contentContainer = parent ? parent.querySelector('.tab-content-container') : null;
        }

        // Reset sibling tabs
        tabsContainer.querySelectorAll('.tab-btn').forEach(b => { 
            b.classList.remove('active'); 
            b.setAttribute('aria-selected', 'false'); 
        });
        
        // Hide sibling panels
        if (contentContainer) {
            contentContainer.querySelectorAll('.sub-tab-content').forEach(panel => {
                panel.classList.remove('active');
            });
        }

        // Activate selected
        btn.classList.add('active', 'visited');
        btn.setAttribute('aria-selected', 'true');
        const targetContent = document.getElementById(targetId);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    function handleLogicTree(btn) {
        const consequenceId = btn.getAttribute('aria-controls');
        const consequence = document.getElementById(consequenceId);
        const isExpanded = btn.getAttribute('aria-expanded') === 'true';
        
        // Close siblings cleanly within the same decision node
        btn.closest('.choices').querySelectorAll('.btn-interact').forEach(sib => {
            if (sib !== btn) {
                sib.setAttribute('aria-expanded', 'false');
                const sibConsId = sib.getAttribute('aria-controls');
                const sibCons = document.getElementById(sibConsId);
                if (sibCons) {
                    sibCons.classList.remove('show');
                    sibCons.hidden = true;
                }
            }
        });

        // Toggle current choice
        if (consequence) {
            btn.setAttribute('aria-expanded', !isExpanded);
            consequence.classList.toggle('show', !isExpanded);
            consequence.hidden = isExpanded;
        }
    }

    // --- Keyboard Accessibility for ARIA Tabs ---
    document.body.addEventListener('keydown', (e) => {
        const isTabBtn = e.target.classList.contains('tab-btn');
        const isNavBtn = e.target.classList.contains('nav-btn');
        if (isTabBtn || isNavBtn) {
            const btn = e.target;
            const containerSelector = isTabBtn ? '[role="tablist"]' : '[role="tablist"]';
            const container = btn.closest(containerSelector);
            if (!container) return;
            
            const btnClass = isTabBtn ? '.tab-btn' : '.nav-btn';
            const btns = Array.from(container.querySelectorAll(btnClass));
            const idx = btns.indexOf(btn);
            let nextBtn;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                nextBtn = btns[(idx + 1) % btns.length];
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                nextBtn = btns[(idx - 1 + btns.length) % btns.length];
            } else if (e.key === 'Home') {
                nextBtn = btns[0];
            } else if (e.key === 'End') {
                nextBtn = btns[btns.length - 1];
            }

            if (nextBtn) { 
                e.preventDefault(); 
                nextBtn.focus(); 
                if (isTabBtn) activateTab(nextBtn);
                else activateView(nextBtn, nextBtn.getAttribute('data-view-target'), true);
            }
        }
    });

    // =========================================================================
    // 4. D3.js Systems Network Map - Stabilized & Bounded
    // =========================================================================
    let networkNodes, networkLinks, simulation, svg, zoomBehavior;
    
    // Hard-coded visual theme to match the brutalist CSS updates
    const themeColors = { 
        character: "#8B1A2B", // Garnet
        npc: "#000000",       // Black
        location: "#B8860B",  // Dark Gold
        scenario: "#F5EDD8"   // Pale Ochre (Improves contrast against canvas)
    };
    
    const gameData = {
        nodes: [
            { id: "karunasena", shortName: "Karuna", label: "Karunasena", type: "character", role: "First-time voter" },
            { id: "kamala", shortName: "Kamala", label: "Kamala", type: "character", role: "School teacher (Locked)" },
            { id: "kumaran", shortName: "Kumaran", label: "Kumaran", type: "character", role: "Migrant worker (Locked)" },
            { id: "mahinda", shortName: "Mahinda", label: "Mahinda Bandara", type: "npc", role: "Incumbent politician" },
            { id: "elderly", shortName: "Soma", label: "Aunty Soma", type: "npc", role: "Voter with 1983 card" },
            { id: "nandadasa", shortName: "Nanda", label: "Nandadasa", type: "npc", role: "Grama Sevaka" },
            { id: "shopkeeper", shortName: "Mudalali", label: "Mudalali Perera", type: "npc", role: "Information hub" },
            { id: "sirisena", shortName: "Sirisena", label: "Uncle Sirisena", type: "npc", role: "Misinformation vector" },
            { id: "police", shortName: "Sergeant", label: "Sgt. Wickramasinghe", type: "npc", role: "Election law authority" },
            { id: "queue", shortName: "Queue", label: "Queue People", type: "npc", role: "Election day metrics" },
            { id: "grama_office", shortName: "Office", label: "Grama Office (loc1)", type: "location", role: "Registration" },
            { id: "uncle_house", shortName: "Uncle", label: "Uncle's House (loc2)", type: "location", role: "Misinformation Hub" },
            { id: "ec_board", shortName: "Board", label: "EC Notice Board (loc3)", type: "location", role: "Verification Board" },
            { id: "shop", shortName: "Shop", label: "Boutique (loc4)", type: "location", role: "Junction Shop Rumors" },
            { id: "community_hall", shortName: "Hall", label: "Community Hall (loc5)", type: "location", role: "Atmospheric Space" },
            { id: "police_station", shortName: "Police", label: "Police Station (loc6)", type: "location", role: "Law Enforcement" },
            { id: "skeptics_cafe", shortName: "Cafe", label: "Skeptics Cafe (loc7)", type: "location", role: "Verification Node" },
            { id: "campaign_tent", shortName: "Tent", label: "Campaign Tent (loc8)", type: "location", role: "Candidate Manifestos" },
            { id: "polling_station", shortName: "Polling", label: "Polling Station (loc9)", type: "location", role: "Week 0 Climax" },
            { id: "kovil", shortName: "Kovil", label: "Kovil (loc_kovil)", type: "location", role: "Atmospheric Node" },
            { id: "temple", shortName: "Temple", label: "Temple (loc_temple)", type: "location", role: "Atmospheric Node" },
            { id: "bar", shortName: "Bar", label: "The Bar (loc_bar)", type: "location", role: "Atmospheric Node" },
            { id: "boarding", shortName: "Boarding", label: "Boarding (loc_boarding)", type: "location", role: "Kumaran's Residence" },
            { id: "registration", shortName: "Reg.", label: "Voter Registration", type: "scenario", role: "Week 6-4 Tracking" },
            { id: "misinformation", shortName: "Misinfo", label: "Misinfo Eval", type: "scenario", role: "Core Loop Content" },
            { id: "manifesto", shortName: "Manifesto", label: "Manifesto Check", type: "scenario", role: "Comparison Analytics" }
        ],
        links: [
            { source: "karunasena", target: "uncle_house", type: "conflict" },
            { source: "karunasena", target: "grama_office", type: "location" },
            { source: "kamala", target: "shop", type: "location" },
            { source: "kumaran", target: "boarding", type: "location" },
            { source: "mahinda", target: "campaign_tent", type: "location" },
            { source: "elderly", target: "polling_station", type: "location" },
            { source: "nandadasa", target: "grama_office", type: "location" },
            { source: "shopkeeper", target: "shop", type: "location" },
            { source: "sirisena", target: "uncle_house", type: "location" },
            { source: "sirisena", target: "misinformation", type: "influence" },
            { source: "police", target: "police_station", type: "location" },
            { source: "ec_board", target: "skeptics_cafe", type: "trust" },
            { source: "ec_board", target: "misinformation", type: "trust" }
        ]
    };

    if (DOM.networkContainer && typeof d3 !== 'undefined') {
        
        // Map colors securely to nodes before building SVG
        gameData.nodes.forEach(n => { n.color = themeColors[n.type] || "#000000"; });
        
        let width = DOM.networkContainer.clientWidth || 800;
        let height = DOM.networkContainer.clientHeight || 500;
        let networkInitialized = false;

        svg = d3.select('#network').append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        // Physics Configuration - tweaked to keep nodes from exploding outward
        simulation = d3.forceSimulation(gameData.nodes)
            .force('link', d3.forceLink(gameData.links).id(d => d.id).distance(110))
            .force('charge', d3.forceManyBody().strength(-450))
            .force('collision', d3.forceCollide().radius(40))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .alphaDecay(0.04);

        const g = svg.append('g');
        zoomBehavior = d3.zoom().scaleExtent([0.5, 3]).on('zoom', e => g.attr('transform', e.transform));
        svg.call(zoomBehavior);

        const linkColorMap = { 
            trust: '#2F5D46', 
            conflict: '#8B1A2B', 
            influence: '#000000', 
            location: '#B8860B' 
        };

        networkLinks = g.selectAll('line').data(gameData.links).enter().append('line')
            .attr('class', d => `link line-${d.type}`)
            .attr('stroke-width', d => d.type === 'trust' ? 3 : 2)
            .attr('stroke', d => linkColorMap[d.type] || '#000000')
            .attr('stroke-dasharray', d => d.type === 'conflict' ? '6,4' : null)
            .attr('stroke-opacity', 0.8);

        networkNodes = g.selectAll('g.node').data(gameData.nodes).enter().append('g')
            .attr('class', 'node')
            .style('cursor', 'pointer')
            .call(d3.drag()
                .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
            );

        // Nodes: Brutalist 2px solid borders to match CSS
        networkNodes.append('circle')
            .attr('r', d => d.type === 'character' ? 20 : 15)
            .attr('fill', d => d.color)
            .style('stroke', '#000000')
            .style('stroke-width', '3px');

        // Node labels
        networkNodes.append('text')
            .attr('dy', d => (d.type === 'character' ? 32 : 26))
            .attr('text-anchor', 'middle')
            .text(d => d.shortName)
            .style('font-family', "'DM Sans', system-ui, sans-serif")
            .style('font-size', '12px')
            .style('font-weight', '800')
            .style('fill', '#000000')
            .style('pointer-events', 'none');

        simulation.on('tick', () => {
            // Hard bounds clamping to prevent nodes from drifting entirely off canvas
            const radius = 25;
            gameData.nodes.forEach(d => {
                d.x = Math.max(radius, Math.min(width - radius, d.x));
                d.y = Math.max(radius, Math.min(height - radius, d.y));
            });

            networkLinks
                .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
            
            networkNodes.attr('transform', d => `translate(${d.x},${d.y})`);
        });

        // Click interaction: Isolate and focus on a specific node and its neighbors
        networkNodes.on('click', (event, d) => {
            event.stopPropagation();
            networkNodes.style('opacity', 0.15); 
            networkLinks.style('stroke-opacity', 0.1);
            
            const connectedIds = new Set([d.id]);
            gameData.links.forEach(l => {
                const srcId = l.source.id || l.source;
                const tgtId = l.target.id || l.target;
                if (srcId === d.id || tgtId === d.id) { 
                    connectedIds.add(srcId); 
                    connectedIds.add(tgtId); 
                }
            });

            networkNodes.style('opacity', n => connectedIds.has(n.id) ? 1 : 0.15);
            networkLinks.style('stroke-opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.1);

            const panel = document.getElementById('selectedInfo');
            if (panel) {
                // Construct DOM nodes manually instead of innerHTML strings
                const wrapper = document.createElement('div');
                wrapper.className = 'node-info-panel';

                const heading = document.createElement('h4');
                heading.className = 'node-info-title';
                heading.textContent = d.label;

                const desc = document.createElement('p');
                desc.className = 'node-info-role';
                desc.textContent = d.role;

                const badge = document.createElement('span');
                badge.className = 'node-type-badge';
                badge.textContent = d.type;

                wrapper.append(heading, desc, badge);
                panel.replaceChildren(wrapper);
            }
            
            const infoTabBtn = document.querySelector('[data-tab-target="info-tab"]');
            if (infoTabBtn) activateTab(infoTabBtn);
        });

        // Click on background resets the view
        svg.on('click', () => {
            networkNodes.style('opacity', 1); 
            networkLinks.style('stroke-opacity', 0.8);
            const panel = document.getElementById('selectedInfo');
            if (panel) {
                const p = document.createElement('p');
                p.className = 'empty-state';
                p.textContent = 'Click on any node to view details.';
                panel.replaceChildren(p);
            }
        });

        // Reset button functionality
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
                if (allBtn) {
                    document.querySelectorAll('.filter-btn').forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-pressed', 'false');
                    });
                    allBtn.classList.add('active');
                    allBtn.setAttribute('aria-pressed', 'true');
                }
                networkNodes.style('opacity', 1);
                networkLinks.style('stroke-opacity', 0.8);
                svg.transition().duration(750).call(zoomBehavior.transform, d3.zoomIdentity);
                simulation.alpha(0.8).restart();
            });
        }

        initNetwork = function() {
            if (!DOM.networkContainer || DOM.networkContainer.clientWidth < 10) return;
            
            width = DOM.networkContainer.clientWidth; 
            height = DOM.networkContainer.clientHeight;
            
            svg.attr('viewBox', `0 0 ${width} ${height}`);
            simulation.force('center', d3.forceCenter(width / 2, height / 2));
            
            if (!networkInitialized) {
                // Scatter initially so they don't spawn stacked on exactly 0,0
                gameData.nodes.forEach(n => { 
                    n.x = width/2 + (Math.random()-0.5)*100; 
                    n.y = height/2 + (Math.random()-0.5)*100; 
                });
                // Small delay lets the browser finish rendering the container bounds
                setTimeout(() => { 
                    simulation.alpha(1).restart(); 
                    networkInitialized = true; 
                }, 50);
            } else { 
                simulation.alpha(0.3).restart(); 
            }
        };
    }

    // Global Window resize observer & Dynamic Heights
    let resizeTimer;
    function updateDynamicHeights() {
        const header = document.querySelector('.sidebar-header');
        if (header) {
            document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
        }
    }
    updateDynamicHeights();

    window.addEventListener('resize', () => {
        updateDynamicHeights();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const nwView = document.getElementById('network-view');
            if (nwView && nwView.classList.contains('active') && typeof initNetwork === 'function') {
                initNetwork();
            }
        }, 150);
    });

    function handleNetworkFilter(btn) {
        if (!networkNodes) return;
        
        document.querySelectorAll('.filter-btn').forEach(b => { 
            b.classList.remove('active'); 
            b.setAttribute('aria-pressed', 'false'); 
        });
        
        btn.classList.add('active'); 
        btn.setAttribute('aria-pressed', 'true');
        
        const filter = btn.dataset.filter;
        const typeMap = { 
            characters: ['character', 'npc'], 
            locations: ['location'], 
            scenarios: ['scenario'] 
        };
        
        networkNodes.style('opacity', d => 
            filter === 'all' || (typeMap[filter] && typeMap[filter].includes(d.type)) ? 1 : 0.05
        );
        networkLinks.style('stroke-opacity', filter === 'all' ? 0.8 : 0.1);
    }

    // =========================================================================
    // 5. Mobile & Utility Mechanics
    // =========================================================================

    function closeMobileMenu() {
        if (DOM.navSection) DOM.navSection.classList.remove('open');
        if (DOM.mobileMenuBtn) DOM.mobileMenuBtn.setAttribute('aria-expanded', 'false');
        if (DOM.sidebarOverlay) { 
            DOM.sidebarOverlay.classList.remove('visible'); 
            clearTimeout(overlayTimer);
            overlayTimer = setTimeout(() => { DOM.sidebarOverlay.style.display = 'none'; }, 200); 
        }
        document.body.classList.remove('menu-open');
    }

    if (DOM.mobileMenuBtn) {
        DOM.mobileMenuBtn.addEventListener('click', () => {
            const isOpen = DOM.navSection && DOM.navSection.classList.contains('open');
            if (isOpen) {
                closeMobileMenu();
            } else {
                if (DOM.navSection) DOM.navSection.classList.add('open');
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

    if (DOM.sidebarOverlay) {
        DOM.sidebarOverlay.addEventListener('click', closeMobileMenu);
    }

    // Scroll Observer for Back to Top Button & Progress
    if (DOM.mainContent) {
        const scrollProgressBar = document.createElement('div');
        scrollProgressBar.className = 'scroll-progress';
        DOM.mainContent.appendChild(scrollProgressBar);

        DOM.mainContent.addEventListener('scroll', () => { 
            if (DOM.backToTop) {
                DOM.backToTop.classList.toggle('visible', DOM.mainContent.scrollTop > 300); 
            }
            const scrollHeight = DOM.mainContent.scrollHeight - DOM.mainContent.clientHeight;
            const progress = scrollHeight > 0 ? (DOM.mainContent.scrollTop / scrollHeight) * 100 : 0;
            scrollProgressBar.style.width = progress + '%';
        }, { passive: true });
        
        if (DOM.backToTop) {
            DOM.backToTop.addEventListener('click', () => {
                DOM.mainContent.scrollTo({ top: 0, behavior: 'smooth' });
            });
        }
    }

    // Delta Table Grouping toggle
    const deltaTable = document.querySelector('.delta-table');
    if (deltaTable) {
        deltaTable.querySelectorAll('tr').forEach(tr => {
            if (tr.classList.contains('table-group')) {
                tr.style.cursor = 'pointer';
                tr.setAttribute('aria-expanded', 'true');
                tr.addEventListener('click', () => {
                    const isExpanded = tr.getAttribute('aria-expanded') === 'true';
                    tr.setAttribute('aria-expanded', !isExpanded);
                    let next = tr.nextElementSibling;
                    while(next && !next.classList.contains('table-group')) {
                        next.style.display = isExpanded ? 'none' : '';
                        next = next.nextElementSibling;
                    }
                });
            }
        });
    }

    // PDF Export Bind
    const pdfBtn = document.getElementById('pdfExportBtn');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', () => window.print());
    }

    // Scroll indicators for horizontal tabs
    document.querySelectorAll('.doc-tabs').forEach(tabs => {
        const checkScroll = () => {
            const isAtEnd = Math.ceil(tabs.scrollLeft + tabs.clientWidth) >= tabs.scrollWidth;
            tabs.classList.toggle('is-at-end', isAtEnd);
        };
        tabs.addEventListener('scroll', checkScroll, { passive: true });
        window.addEventListener('resize', checkScroll);
        setTimeout(checkScroll, 100);
    });

});