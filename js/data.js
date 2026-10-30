/* ==========================================================================
   data.js — the characters, places and systems shown on the connections map.
   To add something to the map, add a node below, then link it in `links`.
   type: 'character' | 'npc' | 'location' | 'scenario'
   (on the map: characters and npcs are "People", location is "Places", scenario is "Systems")
   shortName is the label drawn on the map, so keep it readable and under ~16 characters.
   link type: 'trust' | 'conflict' | 'influence' | 'location'
   ========================================================================== */

window.GDD = window.GDD || {};

GDD.network = {
    nodes: [
        { id: 'karunasena', shortName: 'Karunasena',    label: 'Karunasena',          type: 'character', role: 'First-time voter' },
        { id: 'kamala',     shortName: 'Kamala',    label: 'Kamala',              type: 'character', role: 'School teacher (locked)' },
        { id: 'kumaran',    shortName: 'Kumaran',   label: 'Kumaran',             type: 'character', role: 'Migrant worker (locked)' },

        { id: 'mahinda',    shortName: 'Mahinda',   label: 'Mahinda Bandara',     type: 'npc', role: 'Incumbent politician' },
        { id: 'elderly',    shortName: 'Aunty Soma',      label: 'Aunty Soma',          type: 'npc', role: 'Voter since 1983' },
        { id: 'nandadasa',  shortName: 'Nandadasa',     label: 'Nandadasa',           type: 'npc', role: 'Grama Sevaka' },
        { id: 'shopkeeper', shortName: 'Mudalali',  label: 'Mudalali Perera',     type: 'npc', role: 'Junction shop owner' },
        { id: 'sirisena',   shortName: 'Sirisena',  label: 'Uncle Sirisena',      type: 'npc', role: 'Spreads misinformation' },
        { id: 'police',     shortName: 'Sergeant',  label: 'Sgt. Wickramasinghe', type: 'npc', role: 'Election law authority' },
        { id: 'queue',      shortName: 'Queue',     label: 'Queue People',        type: 'npc', role: 'Election day voter gains' },

        { id: 'grama_office',    shortName: 'Grama Office',   label: 'Grama Sevaka Office', type: 'location', role: 'Voter registration hub' },
        { id: 'uncle_house',     shortName: "Uncle's House",    label: "Uncle's House",       type: 'location', role: 'Misinformation source' },
        { id: 'ec_board',        shortName: 'EC Board',    label: 'EC Notice Board',     type: 'location', role: 'Official verification' },
        { id: 'shop',            shortName: 'Boutique',     label: "Mudalali's Boutique", type: 'location', role: 'Rumour exchange' },
        { id: 'community_hall',  shortName: 'Hall',     label: 'Community Hall',      type: 'location', role: 'Atmosphere' },
        { id: 'police_station',  shortName: 'Police',   label: 'Police Station',      type: 'location', role: 'Law enforcement' },
        { id: 'skeptics_cafe',   shortName: 'Skeptics Cafe',     label: 'Skeptics Cafe',       type: 'location', role: 'Hidden verification space' },
        { id: 'campaign_tent',   shortName: 'Tent',     label: 'Campaign Tent',       type: 'location', role: 'Manifesto and candidate' },
        { id: 'polling_station', shortName: 'Polling Station',  label: 'Polling Station',     type: 'location', role: 'Week 0 climax' },
        { id: 'kovil',           shortName: 'Kovil',    label: 'Kovil',               type: 'location', role: 'Atmosphere' },
        { id: 'temple',          shortName: 'Temple',   label: 'Temple',              type: 'location', role: 'Atmosphere' },
        { id: 'bar',             shortName: 'Bar',      label: 'The Bar',             type: 'location', role: 'Atmosphere' },
        { id: 'boarding',        shortName: 'Boarding', label: "Kumaran's Boarding",  type: 'location', role: "Kumaran's home" },

        { id: 'registration',   shortName: 'Registration',      label: 'Voter Registration',   type: 'scenario', role: 'Weeks 6 to 4 deadline system' },
        { id: 'misinformation', shortName: 'Misinformation',   label: 'Misinfo Evaluation',   type: 'scenario', role: 'Core loop: Uncle\u2019s messages' },
        { id: 'manifesto',      shortName: 'Manifesto', label: 'Manifesto Comparison', type: 'scenario', role: 'The road-promise evidence' }
    ],

    links: [
        { source: 'karunasena', target: 'uncle_house',     type: 'conflict' },
        { source: 'karunasena', target: 'grama_office',    type: 'location' },
        { source: 'karunasena', target: 'ec_board',        type: 'location' },
        { source: 'karunasena', target: 'polling_station', type: 'location' },
        { source: 'kamala',     target: 'shop',            type: 'location' },
        { source: 'kamala',     target: 'grama_office',    type: 'location' },
        { source: 'kumaran',    target: 'boarding',        type: 'location' },
        { source: 'kumaran',    target: 'grama_office',    type: 'location' },
        { source: 'mahinda',    target: 'campaign_tent',   type: 'location' },
        { source: 'nandadasa',  target: 'grama_office',    type: 'location' },
        { source: 'shopkeeper', target: 'shop',            type: 'location' },
        { source: 'sirisena',   target: 'uncle_house',     type: 'location' },
        { source: 'police',     target: 'police_station',  type: 'location' },
        { source: 'elderly',    target: 'polling_station', type: 'location' },
        { source: 'queue',      target: 'polling_station', type: 'location' },
        { source: 'sirisena',   target: 'misinformation',  type: 'influence' },
        { source: 'ec_board',   target: 'misinformation',  type: 'trust' },
        { source: 'ec_board',   target: 'skeptics_cafe',   type: 'trust' },
        { source: 'nandadasa',  target: 'registration',    type: 'trust' },
        { source: 'mahinda',    target: 'manifesto',       type: 'influence' },
        { source: 'campaign_tent',  target: 'manifesto',      type: 'location' },
        { source: 'misinformation', target: 'grama_office',   type: 'conflict' },
        { source: 'misinformation', target: 'police_station', type: 'conflict' },
        { source: 'registration',   target: 'polling_station', type: 'trust' },
        { source: 'manifesto',      target: 'campaign_tent',  type: 'conflict' },
        { source: 'sirisena',       target: 'registration',   type: 'conflict' }
    ]
};