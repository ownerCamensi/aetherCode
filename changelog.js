/**
 * changelog.js — In-app changelog system
 * Versions show "new" badge until user clicks refresh.
 * AI can generate a changelog entry via API.
 */
var Changelog = (function() {

  var STORAGE_KEY = 'codex:changelog-seen';
  var _entries    = [];
  var _seenKeys   = [];
  var _panelEl    = null;

  // Built-in changelog entries
  var BUILTIN_ENTRIES = [
    {
      version: 'v12.4',
      date:    '2025-04-07',
      type:    'major',
      title:   'AI Project Builder + ZIP Import/Export',
      changes: [
        { type:'new',  text:'AI can now build complete projects — creates actual files' },
        { type:'new',  text:'ZIP import — drag in any .zip project and it extracts to file tree' },
        { type:'new',  text:'ZIP export — Ctrl+Shift+E downloads your project' },
        { type:'new',  text:'AI modes: Thinking, Pro, Advanced, Imagine (image generation)' },
        { type:'new',  text:'12 AI providers: Groq, Gemini, Claude, ChatGPT, Mistral, DeepSeek, Together, Cohere, xAI, Perplexity, HuggingFace, Ollama' },
        { type:'fix',  text:'Word wrap now actually works — properly uses Ace session.setUseWrapMode()' },
        { type:'fix',  text:'Split screen 3-pane properly shows HTML/CSS/JS' },
        { type:'new',  text:'Emmet expand button in mobile keyboard toolbar' },
        { type:'new',  text:'Command palette uses real SVG icons (no more emoji)' },
        { type:'fix',  text:'Settings (word wrap, minimap, etc.) now persist across reloads' },
      ],
    },
    {
      version: 'v12.3',
      date:    '2025-03-28',
      type:    'minor',
      title:   'AI Provider Pills + Image Generation',
      changes: [
        { type:'new',  text:'Provider pill switcher — switch AI without re-entering keys' },
        { type:'new',  text:'Image generation via Pollinations.ai (free, no key)' },
        { type:'new',  text:'Thinking mode with reasoning model auto-selection' },
      ],
    },
    {
      version: 'v12.2',
      date:    '2025-03-21',
      type:    'minor',
      title:   'Bug Fixes + Output Panel',
      changes: [
        { type:'fix',  text:'Fixed all sidebar togglers not working (duplicate boot function)' },
        { type:'new',  text:'Enhanced output panel with filter buttons and timestamps' },
        { type:'fix',  text:'Folder tree now supports unlimited nested folders' },
      ],
    },
  ];

  function init() {
    _entries = BUILTIN_ENTRIES.slice();
    // Load user-added entries
    try {
      var saved = JSON.parse(localStorage.getItem('codex:changelog-entries') || '[]');
      if (Array.isArray(saved)) _entries = saved.concat(_entries);
    } catch(e) {}

    _loadSeen();
    _checkShowBadge();

    PanelSystem.register({
      id:    'changelog',
      title: 'What\'s New',
      icon:  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 4.42 3.58 8 8 8s8-3.58 8-8c0-4.42-3.58-8-8-8zm.5 12.5h-1v-5h1v5zm0-6h-1v-1h1v1z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; _markAllSeen(); },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'changelog-open', label:"What's New / Changelog", category:'View', action: function(){ PanelSystem.show('changelog'); } });
    }
  }

  function _checkShowBadge() {
    var unseen = _entries.filter(function(e){ return _seenKeys.indexOf(e.version) === -1; });
    if (unseen.length > 0) _showBadgeOnTab();
  }

  function _showBadgeOnTab() {
    // Add unread dot to panel tab
    setTimeout(function() {
      var tab = document.querySelector('.panel-tab[data-id="changelog"]');
      if (tab && !tab.querySelector('.changelog-badge')) {
        var b = document.createElement('span');
        b.className = 'nc-badge changelog-badge';
        b.textContent = '●';
        tab.appendChild(b);
      }
    }, 500);
  }

  function _markAllSeen() {
    _entries.forEach(function(e){ if (_seenKeys.indexOf(e.version) === -1) _seenKeys.push(e.version); });
    _saveSeen();
    // Remove badge
    var tab = document.querySelector('.panel-tab[data-id="changelog"]');
    if (tab) { var b = tab.querySelector('.changelog-badge'); if (b) b.remove(); }
  }

  function _render(container) {
    _panelEl = container;
    var typeColors = { major:'#007acc', minor:'#3fb950', patch:'#cca700', fix:'#f48771' };
    var changeIcons = {
      new:    '<svg viewBox="0 0 12 12" fill="none" stroke="#3fb950" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="6" r="5"/><line x1="6" y1="3.5" x2="6" y2="8.5"/><line x1="3.5" y1="6" x2="8.5" y2="6"/></svg>',
      fix:    '<svg viewBox="0 0 12 12" fill="none" stroke="#f48771" stroke-width="1.5" stroke-linecap="round"><path d="M6 1v4l2.5 2.5"/><circle cx="6" cy="6" r="5"/></svg>',
      improve:'<svg viewBox="0 0 12 12" fill="none" stroke="#cca700" stroke-width="1.5" stroke-linecap="round"><polyline points="1 8 4 5 6 7 9 3 11 5"/></svg>',
    };

    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0">',
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">What\'s New in CodeX</span>',
          '<button id="changelog-refresh-btn" style="background:var(--accent);border:none;color:#fff;font-size:11px;padding:4px 10px;border-radius:var(--radius);cursor:pointer">Check Updates</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto;padding:8px">',
          _entries.map(function(entry) {
            var isNew = _seenKeys.indexOf(entry.version) === -1;
            var color = typeColors[entry.type] || '#007acc';
            return '<div style="margin-bottom:16px;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden">' +
              '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#252526">' +
                '<span style="background:'+color+';color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">'+entry.version+'</span>' +
                '<span style="font-size:12px;font-weight:600;color:var(--text-bright);flex:1">'+_esc(entry.title)+'</span>' +
                (isNew?'<span style="background:#094771;color:#9cdcfe;font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px">NEW</span>':'') +
                '<span style="font-size:10px;color:var(--text-dim)">'+entry.date+'</span>' +
              '</div>' +
              '<div style="padding:8px 12px">' +
                entry.changes.map(function(c) {
                  var icon = changeIcons[c.type] || changeIcons.new;
                  return '<div style="display:flex;align-items:flex-start;gap:7px;padding:3px 0">' +
                    '<span style="flex-shrink:0;margin-top:2px">'+icon+'</span>' +
                    '<span style="font-size:12px;color:var(--text);line-height:1.5">'+_esc(c.text)+'</span>' +
                    '</div>';
                }).join('') +
              '</div>' +
            '</div>';
          }).join('') ||
          '<div style="color:var(--text-dim);text-align:center;padding:24px;font-size:12px">No changelog entries yet.</div>',
        '</div>',
      '</div>',
    ].join('');

    var refreshBtn = container.querySelector('#changelog-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', function() {
      refreshBtn.textContent = 'Checking…'; refreshBtn.disabled = true;
      // Check localStorage for new entries added by AI
      try {
        var saved = JSON.parse(localStorage.getItem('codex:changelog-entries') || '[]');
        if (Array.isArray(saved)) {
          _entries = saved.concat(BUILTIN_ENTRIES);
          _render(container);
          if (UI) UI.toast('Changelog refreshed!', 'success');
          return;
        }
      } catch(e) {}
      setTimeout(function(){
        refreshBtn.textContent = 'Check Updates'; refreshBtn.disabled = false;
        if (UI) UI.toast('Already up to date.', 'info');
      }, 1000);
    });
  }

  // ─── AI-accessible API ─────────────────────────────────────────────────────

  function addEntry(entry) {
    // entry: { version, date, type, title, changes:[{type,text}] }
    if (!entry || !entry.version || !entry.title) return false;
    var existing = _entries.filter(function(e){ return e.version===entry.version; })[0];
    if (!existing) {
      _entries.unshift(entry);
      // Persist user entries
      var userEntries = _entries.filter(function(e){ return !BUILTIN_ENTRIES.some(function(b){ return b.version===e.version; }); });
      try { localStorage.setItem('codex:changelog-entries', JSON.stringify(userEntries)); } catch(e2) {}
      _showBadgeOnTab();
      if (_panelEl) _render(_panelEl);
      return true;
    }
    return false;
  }

  function _loadSeen()  { try { _seenKeys = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch(e) { _seenKeys=[]; } }
  function _saveSeen()  { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_seenKeys)); } catch(e) {} }
  function _esc(s)      { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, addEntry };
})();
