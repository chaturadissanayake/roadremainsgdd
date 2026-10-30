/* ==========================================================================
   network.js — the interactive connections map (needs D3 and data.js).
   Colours, shapes and line styles live in css/components.css, not here.

   Layout: people on the left, places in the middle, systems on the right.
   Shape:  square = person, diamond = place, hexagon = system.
   Line:   every line looks the same. What a link means (trust, conflict,
           influence, found at) is written in the details panel.
   ========================================================================== */

(function () {
    'use strict';

    const container = document.getElementById('network');
    if (!container || typeof d3 === 'undefined' || !window.GDD || !GDD.network) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = GDD.network.nodes.map(n => Object.assign({}, n));
    const links = GDD.network.links.map(l => Object.assign({}, l));

    const TYPE_LABEL = {
        character: 'Playable character',
        npc:       'Character (NPC)',
        location:  'Place',
        scenario:  'System'
    };

    const RELATION = {
        trust:     'Trust or support',
        conflict:  'Conflict or misinformation',
        influence: 'Influence',
        location:  'Found at'
    };
    const RELATION_ORDER = ['trust', 'conflict', 'influence', 'location'];

    const ZONES = [
        { key: 'people',  title: 'People',  note: 'Who you play and meet',   share: 0.30, types: ['character', 'npc'] },
        { key: 'places',  title: 'Places',  note: 'Where it happens',        share: 0.44, types: ['location'] },
        { key: 'systems', title: 'Systems', note: 'What the game runs on',   share: 0.26, types: ['scenario'] }
    ];

    const FILTERS = {
        characters: ['character', 'npc'],
        locations:  ['location'],
        scenarios:  ['scenario']
    };

    const SIZE = { character: 21, npc: 14, location: 18, scenario: 19 };

    function shapePath(type) {
        const r = SIZE[type];
        if (type === 'character' || type === 'npc') return `M${-r},${-r}H${r}V${r}H${-r}Z`;
        if (type === 'location') {
            const d = r * 1.2;
            return `M0,${-d}L${d},0L0,${d}L${-d},0Z`;
        }
        const pts = d3.range(6).map(i => {
            const a = Math.PI / 3 * i;
            return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10];
        });
        return 'M' + pts.map(p => p.join(',')).join('L') + 'Z';
    }

    const labelOffset = d => (d.type === 'location' ? SIZE[d.type] * 1.2 : SIZE[d.type]) + 16;

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 600;
    let started = false;
    let selectedId = null;
    let activeFilter = 'all';
    let zoneGeo = [];
    let narrow = false;

    const svg = d3.select(container).append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet')
        .attr('role', 'group')
        .attr('aria-label', 'Connections between characters, places and systems');

    const layer = svg.append('g');

    /* Scroll wheel only zooms with Ctrl or Cmd held, so the page can still scroll past the map */
    const zoom = d3.zoom()
        .scaleExtent([0.5, 3])
        .filter(e => e.type === 'wheel' ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.button))
        .on('zoom', e => layer.attr('transform', e.transform));
    svg.call(zoom);

    const zoneLayer = layer.append('g').attr('class', 'zones');

    const linkSel = layer.append('g').selectAll('line').data(links).enter().append('line')
        .attr('class', 'link');

    const nodeSel = layer.append('g').selectAll('g.node').data(nodes).enter().append('g')
        .attr('class', d => `node node-${d.type}`)
        .attr('tabindex', '0')
        .attr('role', 'button')
        .attr('aria-label', d => `${d.label}, ${TYPE_LABEL[d.type]}, ${d.role}`)
        .call(d3.drag()
            .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));

    nodeSel.append('path').attr('class', 'shape').attr('d', d => shapePath(d.type));
    nodeSel.append('text').attr('dy', labelOffset).text(d => d.shortName);

    /* ---------- Zones ---------- */

    function layoutZones() {
        narrow = width < 560;
        let used = 0;
        zoneGeo = ZONES.map(z => {
            const start = used;
            used += z.share;
            return narrow
                ? Object.assign({}, z, { x: 0, y: start * height, w: width, h: z.share * height })
                : Object.assign({}, z, { x: start * width, y: 0, w: z.share * width, h: height });
        });
    }

    function drawZones() {
        const zones = zoneLayer.selectAll('g.zone').data(zoneGeo, d => d.key);
        const entered = zones.enter().append('g').attr('class', d => `zone zone-${d.key}`);
        entered.append('rect');
        entered.append('text').attr('class', 'zone-title');
        entered.append('text').attr('class', 'zone-note');

        const all = entered.merge(zones);
        all.select('rect').attr('x', d => d.x).attr('y', d => d.y).attr('width', d => d.w).attr('height', d => d.h);
        all.select('.zone-title').attr('x', d => d.x + 14).attr('y', d => d.y + 28).text(d => d.title);
        all.select('.zone-note').attr('x', d => d.x + 14).attr('y', d => d.y + 46).text(d => d.note);
    }

    function zoneFor(d) {
        return zoneGeo.find(z => z.types.includes(d.type));
    }
    const targetX = d => { const z = zoneFor(d); return z ? z.x + z.w / 2 : width / 2; };
    const targetY = d => { const z = zoneFor(d); return z ? z.y + z.h / 2 + 18 : height / 2; };

    layoutZones();
    drawZones();

    /* ---------- Simulation ---------- */

    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(110).strength(0.1))
        .force('charge', d3.forceManyBody().strength(-340))
        .force('collision', d3.forceCollide().radius(46))
        .force('x', d3.forceX(targetX).strength(0.22))
        .force('y', d3.forceY(targetY).strength(0.07))
        .alphaDecay(reducedMotion ? 0.3 : 0.04);

    simulation.on('tick', () => {
        const padX = 64, padTop = 66, padBottom = 44;
        nodes.forEach(d => {
            d.x = Math.max(padX, Math.min(width - padX, d.x));
            d.y = Math.max(padTop, Math.min(height - padBottom, d.y));
        });
        linkSel
            .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
        nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    /* ---------- Tooltip ---------- */

    const tooltip = document.createElement('div');
    tooltip.className = 'd3-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);

    function showTip(event, d) {
        tooltip.replaceChildren();
        const name = document.createElement('strong');
        name.textContent = d.label;
        const role = document.createElement('span');
        role.textContent = `${TYPE_LABEL[d.type]}: ${d.role}`;
        tooltip.append(name, document.createElement('br'), role);
        tooltip.hidden = false;
        moveTip(event);
    }
    function moveTip(event) {
        tooltip.style.left = `${event.clientX + 14}px`;
        tooltip.style.top = `${event.clientY - 10}px`;
    }

    /* ---------- Focus: fade everything not connected to one node ---------- */

    const touches = (l, id) => l.source.id === id || l.target.id === id;

    function applyFocus(id) {
        if (!id) {
            nodeSel.classed('is-dim', false);
            linkSel.classed('is-dim', false).classed('is-hot', false);
            return;
        }
        const connected = new Set([id]);
        links.forEach(l => { if (touches(l, id)) { connected.add(l.source.id); connected.add(l.target.id); } });
        nodeSel.classed('is-dim', n => !connected.has(n.id));
        linkSel.classed('is-dim', l => !touches(l, id)).classed('is-hot', l => touches(l, id));
    }

    nodeSel
        .on('mouseenter', (event, d) => { showTip(event, d); if (!selectedId) applyFocus(d.id); })
        .on('mousemove', moveTip)
        .on('mouseleave', () => { tooltip.hidden = true; applyFocus(selectedId); });

    /* ---------- Details panel ---------- */

    const infoPanel = document.getElementById('selectedInfo');

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function showEmptyInfo() {
        if (!infoPanel) return;
        const intro = el('p', 'empty-state', 'Nothing selected yet. Here is how to read the map:');
        const list = el('ul', 'how-list');
        [
            'Click any shape to see what it connects to.',
            'Click a name in the list to follow a link.',
            'Drag a shape to move it. Drag the background to pan.',
            'Use the filters to focus on people, places or systems.'
        ].forEach(t => list.appendChild(el('li', null, t)));
        infoPanel.replaceChildren(intro, list);
    }

    function showInfo(d) {
        if (!infoPanel) return;

        const badge = el('div', 'node-info-badge');
        badge.append(el('span', `shape-key shape-${d.type}`), el('span', null, TYPE_LABEL[d.type]));
        badge.firstChild.setAttribute('aria-hidden', 'true');

        const mine = links.filter(l => touches(l, d.id)).map(l => {
            const other = l.source.id === d.id ? l.target : l.source;
            return { other, type: l.type };
        }).sort((a, b) => RELATION_ORDER.indexOf(a.type) - RELATION_ORDER.indexOf(b.type));

        const count = el('p', 'node-info-count', `${mine.length} direct connection${mine.length === 1 ? '' : 's'}`);
        const list = el('ul', 'conn-list');

        mine.forEach(c => {
            const item = el('li');
            const button = el('button', 'conn-item');
            button.type = 'button';
            const text = el('span');
            text.append(el('span', 'conn-name', c.other.label), el('span', 'conn-rel', RELATION[c.type]));
            button.append(text);
            button.addEventListener('click', () => selectNode(c.other.id));
            item.appendChild(button);
            list.appendChild(item);
        });

        infoPanel.replaceChildren(badge, el('h4', 'node-info-title', d.label), el('p', 'node-info-role', d.role), count, list);
    }

    /* ---------- Selection and filters ---------- */

    function setPressed(activeBtn) {
        document.querySelectorAll('#network-view .filter-btn').forEach(b => {
            b.setAttribute('aria-pressed', String(b === activeBtn));
        });
    }

    function applyFilter(filter) {
        activeFilter = filter;
        const shown = d => filter === 'all' || FILTERS[filter].includes(d.type);
        nodeSel.classed('is-filtered', d => !shown(d));
        linkSel.classed('is-filtered', l => !(shown(l.source) || shown(l.target)));
    }

    function selectNode(id) {
        const d = nodes.find(n => n.id === id);
        if (!d) return;
        if (activeFilter !== 'all') {
            applyFilter('all');
            setPressed(document.querySelector('#network-view .filter-btn[data-filter="all"]'));
        }
        selectedId = id;
        nodeSel.classed('is-selected', n => n.id === id);
        applyFocus(id);
        showInfo(d);
        if (window.matchMedia('(max-width: 1320px)').matches && infoPanel) {
            infoPanel.scrollIntoView({ block: 'nearest' });
        }
    }

    function clearSelection() {
        selectedId = null;
        nodeSel.classed('is-selected', false);
        applyFocus(null);
        showEmptyInfo();
    }

    nodeSel.on('click', (event, d) => { event.stopPropagation(); selectNode(d.id); });
    nodeSel.on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectNode(d.id);
        }
    });

    svg.on('click', clearSelection);
    container.addEventListener('keydown', e => { if (e.key === 'Escape') clearSelection(); });

    document.querySelectorAll('#network-view .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setPressed(btn);
            if (selectedId) clearSelection();
            applyFilter(btn.dataset.filter);
        });
    });

    const duration = reducedMotion ? 0 : 250;
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    if (zoomIn)  zoomIn.addEventListener('click',  () => svg.transition().duration(duration).call(zoom.scaleBy, 1.35));
    if (zoomOut) zoomOut.addEventListener('click', () => svg.transition().duration(duration).call(zoom.scaleBy, 1 / 1.35));

    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            setPressed(document.querySelector('#network-view .filter-btn[data-filter="all"]'));
            applyFilter('all');
            clearSelection();
            svg.transition().duration(reducedMotion ? 0 : 500).call(zoom.transform, d3.zoomIdentity);
            simulation.alpha(0.6).restart();
        });
    }

    showEmptyInfo();

    /* ---------- Called by main.js when the map becomes visible, and on resize ---------- */

    GDD.initNetwork = function () {
        if (container.clientWidth < 10) return;
        width = container.clientWidth;
        height = container.clientHeight;
        svg.attr('viewBox', `0 0 ${width} ${height}`);

        layoutZones();
        drawZones();

        simulation
            .force('x', d3.forceX(targetX).strength(narrow ? 0.05 : 0.22))
            .force('y', d3.forceY(targetY).strength(narrow ? 0.24 : 0.07));

        if (!started) {
            nodes.forEach(n => {
                n.x = targetX(n) + (Math.random() - 0.5) * 80;
                n.y = targetY(n) + (Math.random() - 0.5) * 160;
            });
            started = true;
            simulation.alpha(1).restart();
        } else {
            simulation.alpha(0.3).restart();
        }
    };

    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(() => {
            const view = document.getElementById('network-view');
            if (view && view.classList.contains('active')) GDD.initNetwork();
        }).observe(container);
    }
})();