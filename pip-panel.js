/**
 * pip-panel.js — Install Python packages via micropip
 * FIXED: properly waits for Pyodide, installs correctly
 */
var PipPanel = (function() {

  var _installed = [];
  var _panelEl   = null;
  var STORAGE_KEY = 'codex:pip-packages';

  var POPULAR = [
    { name:'numpy',       desc:'Numerical computing'   },
    { name:'pandas',      desc:'Data analysis'         },
    { name:'matplotlib',  desc:'Plotting & charts'     },
    { name:'requests',    desc:'HTTP library'          },
    { name:'beautifulsoup4', desc:'HTML/XML parsing'   },
    { name:'scipy',       desc:'Scientific computing'  },
    { name:'sympy',       desc:'Symbolic math'         },
    { name:'pillow',      desc:'Image processing'      },
    { name:'httpx',       desc:'Async HTTP client'     },
    { name:'rich',        desc:'Rich terminal output'  },
    { name:'arrow',       desc:'Better dates/times'    },
    { name:'pydantic',    desc:'Data validation'       },
  ];

  function init() {
    _loadInstalled();
    PanelSystem.register({
      id:'pip', title:'pip',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.514 0C7.37 0 7.17 1.23 7.17 2.36v1.1h2.38v.37H5.68C4.49 3.83 3.5 4.84 3.5 6.83c0 1.98.93 2.37 2.18 2.37H6.5V7.95c0-1.12.6-2.12 2.12-2.12h2.56c1.19 0 1.82-.7 1.82-1.82V2.36C13 1.24 12.04 0 9.514 0zm-1.3.93c.45 0 .82.37.82.82a.82.82 0 0 1-.82.82.82.82 0 0 1-.82-.82c0-.45.37-.82.82-.82z"/></svg>',
      render: _renderPanel,
      onShow: function(el) { _panelEl = el; },
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'pip-open', label:'Python: Open pip Panel', category:'Python', action: function() { PanelSystem.show('pip'); } });
    }
  }

  function _renderPanel(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div class="pip-panel">',
        '<div class="pip-search-row">',
          '<input id="pip-input" class="pip-input" placeholder="Package name (e.g. numpy)" autocomplete="off" spellcheck="false">',
          '<button class="pip-install-btn" id="pip-install-btn">Install</button>',
        '</div>',
        '<div id="pip-log" class="pip-log"></div>',
        '<div style="flex:1;overflow-y:auto">',
          '<div class="pip-section-label">Installed (' + _installed.length + ')</div>',
          '<div id="pip-installed-list" class="pip-installed-list">',
            _installed.length === 0
              ? '<div class="pip-empty">No packages installed yet.</div>'
              : _installed.map(function(p) {
                  return '<div class="pip-inst-item"><span class="pip-inst-name">' + _esc(p.name) + '</span><span class="pip-inst-ver">' + _esc(p.version||'') + '</span><button class="pip-uninstall-btn" data-pkg="' + _esc(p.name) + '">×</button></div>';
                }).join(''),
          '</div>',
          '<div class="pip-section-label">Popular Packages</div>',
          '<div class="pip-popular">',
            POPULAR.map(function(p) {
              var isInstalled = _installed.some(function(i) { return i.name === p.name; });
              return '<div class="pip-popular-item"><div class="pip-pop-info"><span class="pip-pop-name">' + p.name + '</span><span class="pip-pop-desc">' + p.desc + '</span></div>' +
                (isInstalled ? '<span class="pip-pop-installed">✓</span>' : '<button class="pip-pop-btn" data-pkg="' + p.name + '">Install</button>') + '</div>';
            }).join(''),
          '</div>',
        '</div>',
      '</div>',
    ].join('');

    var input    = container.querySelector('#pip-input');
    var installBtn = container.querySelector('#pip-install-btn');
    if (installBtn) installBtn.addEventListener('click', function() { var n = input ? input.value.trim() : ''; if(n) install(n, container); });
    if (input)     input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { var n = input.value.trim(); if(n) install(n, container); } });

    container.querySelectorAll('.pip-pop-btn').forEach(function(b) { b.addEventListener('click', function() { install(b.dataset.pkg, container); }); });
    container.querySelectorAll('.pip-uninstall-btn').forEach(function(b) { b.addEventListener('click', function() { _uninstall(b.dataset.pkg, container); }); });
  }

  function _log(container, msg, color) {
    var logEl = container ? container.querySelector('#pip-log') : document.getElementById('pip-log');
    if (!logEl) return;
    var line = document.createElement('div');
    line.style.cssText = 'font-family:var(--font-code,monospace);font-size:11px;color:' + (color||'#ccc') + ';padding:2px 8px;';
    line.textContent = '[pip] ' + msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  async function install(pkgName, container) {
    // Check if Pyodide is loaded
    var pyodide = typeof LangRunner !== 'undefined' && LangRunner._getPyodide ? LangRunner._getPyodide() : null;

    if (!pyodide) {
      _log(container, 'Loading Python first...', '#9cdcfe');
      if (UI) UI.toast('Loading Python... run a .py file first, then install packages', 'info');

      // Try to load Pyodide via LangRunner
      if (typeof LangRunner !== 'undefined' && LangRunner.loadPyodide) {
        try {
          pyodide = await LangRunner.loadPyodide();
        } catch(e) {
          _log(container, 'Failed to load Python: ' + e.message, '#f48771');
          return;
        }
      } else {
        _log(container, 'Run a .py file first to load Python, then install packages.', '#cca700');
        return;
      }
    }

    _log(container, 'Installing ' + pkgName + '...', '#9cdcfe');

    try {
      await pyodide.runPythonAsync('import micropip\nawait micropip.install("' + pkgName.replace(/"/g,'') + '")');

      var version = 'installed';
      try { version = pyodide.runPython('import importlib.metadata; importlib.metadata.version("' + pkgName + '")'); } catch(e) {}

      _log(container, '✅ ' + pkgName + ' ' + version + ' installed!', '#3fb950');
      _installed = _installed.filter(function(i) { return i.name !== pkgName; });
      _installed.push({ name: pkgName, version: String(version), time: Date.now() });
      _saveInstalled();
      if (UI) UI.toast('pip: ' + pkgName + ' installed ✓', 'success');
      if (container) _renderPanel(container); // refresh
    } catch(e) {
      var msg = e.message || String(e);
      _log(container, '❌ Error: ' + msg, '#f48771');
      if (UI) UI.toast('pip install failed: ' + msg.slice(0,60), 'error');
    }
  }

  function _uninstall(pkgName, container) {
    _installed = _installed.filter(function(i) { return i.name !== pkgName; });
    _saveInstalled();
    _log(container, 'Removed ' + pkgName + ' from registry (stays in memory until page reload).', '#cca700');
    if (container) _renderPanel(container);
  }

  function _saveInstalled()  { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_installed)); } catch(e) {} }
  function _loadInstalled()  { try { _installed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { _installed = []; } }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, install };
})();
