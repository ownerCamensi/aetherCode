/**
 * theme-marketplace.js — Community themes + install via URL
 */
var ThemeMarketplace = (function() {

  var STORAGE_KEY = 'codex:installed-themes';
  var _installed  = [];
  var _panelEl    = null;

  var FEATURED = [
    { id:'tokyo-night',  name:'Tokyo Night',    author:'enkia',     desc:'Dark blue-purple VSCode theme',        preview:'#1a1b2e', accent:'#7aa2f7', color:'#a9b1d6' },
    { id:'catppuccin',   name:'Catppuccin',     author:'catppuccin',desc:'Soothing pastel dark theme',           preview:'#1e1e2e', accent:'#cba6f7', color:'#cdd6f4' },
    { id:'github-dark',  name:'GitHub Dark',    author:'github',    desc:'GitHub.com dark mode',                 preview:'#0d1117', accent:'#388bfd', color:'#e6edf3' },
    { id:'rose-pine',    name:'Rosé Pine',      author:'rose-pine', desc:'Warm purple tones',                    preview:'#191724', accent:'#c4a7e7', color:'#e0def4' },
    { id:'nord',         name:'Nord',           author:'arcticicestudio',desc:'Arctic, north-bluish color palette',preview:'#2e3440',accent:'#88c0d0',color:'#d8dee9' },
    { id:'one-dark-pro', name:'One Dark Pro',   author:'atom',      desc:'Atom dark theme for editors',          preview:'#282c34', accent:'#61afef', color:'#abb2bf' },
    { id:'material',     name:'Material Dark',  author:'material',  desc:'Material Design inspired',             preview:'#212121', accent:'#64dd17', color:'#eeffff' },
    { id:'synthwave84',  name:'SynthWave \'84', author:'robb0wen',  desc:'Neon retro 80s glow theme',           preview:'#2a2139', accent:'#ff7edb', color:'#ffffff' },
    { id:'dracula',      name:'Dracula',        author:'zenorocha', desc:'Dark theme for code editors',          preview:'#282a36', accent:'#bd93f9', color:'#f8f8f2' },
    { id:'solarized',    name:'Solarized Dark', author:'altercation',desc:'Classic precision solarized palette', preview:'#002b36', accent:'#268bd2', color:'#839496' },
  ];

  function init() {
    _loadInstalled();

    PanelSystem.register({
      id: 'theme-market', title: 'Themes',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 1 0 10 10"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'theme-market-open', label:'Themes: Browse Theme Marketplace', category:'Theme', action: function(){ PanelSystem.show('theme-market'); } });
      CommandPalette.register({ id:'theme-install-url', label:'Themes: Install Theme from URL',   category:'Theme', action: _installFromURL });
    }

    // Apply installed themes on load
    _installed.forEach(function(t) { if (t.active) _applyCustomTheme(t); });
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:8px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0;display:flex;gap:6px">',
          '<input id="tm-search" placeholder="Search themes…" style="flex:1;background:#1a1a1a;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:12px;padding:5px 8px">',
          '<button id="tm-url-btn" class="btn-sm" title="Install from URL">+ URL</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto">',
          '<div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim)">Featured Themes</div>',
          FEATURED.map(function(t) {
            var isActive = _installed.some(function(i){ return i.id===t.id&&i.active; });
            return '<div class="tm-card" data-id="' + t.id + '">' +
              '<div class="tm-preview" style="background:' + t.preview + '">' +
                '<div style="height:6px;background:' + t.accent + ';border-radius:1px;margin:0 0 5px"></div>' +
                '<div style="height:4px;background:' + t.color + ';opacity:.5;border-radius:1px;margin-bottom:3px;width:70%"></div>' +
                '<div style="height:4px;background:' + t.color + ';opacity:.3;border-radius:1px;width:50%"></div>' +
              '</div>' +
              '<div class="tm-info">' +
                '<div class="tm-name">' + _esc(t.name) + '</div>' +
                '<div class="tm-author">by ' + _esc(t.author) + '</div>' +
                '<div class="tm-desc">' + _esc(t.desc) + '</div>' +
              '</div>' +
              '<button class="tm-install-btn' + (isActive?' tm-active':'') + '" data-id="' + t.id + '">' + (isActive?'Active':'Apply') + '</button>' +
            '</div>';
          }).join(''),
          _installed.filter(function(t){ return !FEATURED.some(function(f){return f.id===t.id;}); }).length > 0 ?
            '<div style="padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-dim);border-top:1px solid #1a1a1a">Custom Installed</div>' +
            _installed.filter(function(t){ return !FEATURED.some(function(f){return f.id===t.id;}); }).map(function(t) {
              return '<div class="tm-card">' +
                '<div class="tm-info" style="flex:1"><div class="tm-name">' + _esc(t.name||t.id) + '</div><div class="tm-author">' + _esc(t.url||'custom') + '</div></div>' +
                '<button class="tm-install-btn' + (t.active?' tm-active':'') + '" data-id="' + t.id + '">' + (t.active?'Active':'Apply') + '</button>' +
                '<button class="tm-remove-btn" data-id="' + t.id + '">×</button>' +
              '</div>';
            }).join('') : '',
        '</div>',
      '</div>',
    ].join('');

    container.querySelectorAll('.tm-install-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id    = btn.dataset.id;
        var found = FEATURED.filter(function(t){ return t.id===id; })[0] || _installed.filter(function(t){ return t.id===id; })[0];
        if (found) _installTheme(found);
      });
    });

    container.querySelectorAll('.tm-remove-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _installed = _installed.filter(function(t){ return t.id!==btn.dataset.id; });
        _saveInstalled(); _render(container);
      });
    });

    var urlBtn = container.querySelector('#tm-url-btn');
    if (urlBtn) urlBtn.addEventListener('click', _installFromURL);

    var search = container.querySelector('#tm-search');
    if (search) search.addEventListener('input', function() {
      var q = search.value.toLowerCase();
      container.querySelectorAll('.tm-card').forEach(function(card) {
        var name = (card.querySelector('.tm-name')||{}).textContent||'';
        card.style.display = !q || name.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }

  function _installTheme(theme) {
    // Mark as active, unmark others
    _installed.forEach(function(t){ t.active=false; });
    var existing = _installed.filter(function(t){ return t.id===theme.id; })[0];
    if (!existing) { var t2 = Object.assign({}, theme, {active:true}); _installed.push(t2); }
    else existing.active = true;
    _saveInstalled();
    _applyCustomTheme(theme);
    if (UI) UI.toast('Theme applied: ' + theme.name, 'success');
    if (_panelEl) _render(_panelEl);
  }

  function _applyCustomTheme(theme) {
    if (!theme) return;
    // Apply as CSS variables
    var style = document.getElementById('custom-theme-style') || document.createElement('style');
    style.id  = 'custom-theme-style';
    if (theme.preview && theme.accent && theme.color) {
      style.textContent = ':root{--bg-app:'+theme.preview+';--bg-sidebar:'+theme.preview+';--bg-tab-active:'+theme.preview+';--accent:'+theme.accent+';--text:'+theme.color+' !important;}';
    } else if (theme.css) {
      style.textContent = theme.css;
    }
    document.head.appendChild(style);

    // Also apply Ace theme if matching
    var aceMap = {'dracula':'dracula','nord':'nord_dark','github-dark':'github','one-dark-pro':'one_dark','solarized':'solarized_dark'};
    if (Editor && aceMap[theme.id]) Editor.setTheme(aceMap[theme.id]);
  }

  function _installFromURL() {
    var url = prompt('Theme URL (JSON or CSS file):');
    if (!url || !url.startsWith('http')) return;
    fetch(url).then(function(r){ return r.text(); }).then(function(text) {
      var theme;
      try { theme = JSON.parse(text); theme.url = url; theme.id = theme.id || 'custom-' + Date.now(); }
      catch(e) { theme = { id:'custom-'+Date.now(), name:'Custom Theme', url:url, css:text }; }
      _installTheme(theme);
    }).catch(function(e){ if(UI)UI.toast('Failed to load theme: '+e.message,'error'); });
  }

  function _loadInstalled() { try { _installed = JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); } catch(e) { _installed=[]; } }
  function _saveInstalled() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_installed)); } catch(e) {} }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
