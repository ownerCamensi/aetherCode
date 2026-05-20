/**
 * panel-system.js — Bottom Panel Bar (VSCode-style)
 * Enhanced output panel with filter buttons, timestamps, log levels
 */
var PanelSystem = (function() {

  var _panels    = {};
  var _activeId  = null;
  var _isOpen    = false;
  var _isMax     = false;
  var _prevH     = 220;
  var _panelArea = null;
  var _panelBar  = null;
  var _panelBody = null;
  var _resizing  = false;
  var _startY    = 0;
  var _startH    = 0;

  // Output filter state
  var _outputFilter = 'all'; // 'all' | 'log' | 'info' | 'warn' | 'error'
  var _outputLines  = [];    // { level, message, time }

  var BUILTIN = { OUTPUT:'output', CONSOLE:'eruda-console' };

  function init() {
    _panelArea = document.getElementById('panel-area');
    _panelBar  = document.getElementById('panel-bar');
    _panelBody = document.getElementById('panel-body');
    if (!_panelArea || !_panelBar || !_panelBody) return;

    _bindResizer();

    register({
      id:    BUILTIN.OUTPUT,
      title: 'Output',
      icon:  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm9.5 5.5h-3a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1zm-6.354-.354a.5.5 0 1 0 .707.707L4.5 8.207l.646.646a.5.5 0 0 0 .707-.707l-1-1a.5.5 0 0 0-.707 0l-1 1z"/></svg>',
      render: _renderOutputPanel,
    });

    if (typeof EventBus !== 'undefined') {
      EventBus.on('output:log', function(data) {
        _appendOutputLine(data.level || 'log', data.message || '');
      });
    }
  }

  function _renderOutputPanel(container) {
    container.style.display   = 'flex';
    container.style.flexDirection = 'column';
    container.style.height    = '100%';
    container.innerHTML =
      '<div class="output-toolbar">' +
        '<button class="output-filter-btn active" data-filter="all">All</button>' +
        '<button class="output-filter-btn" data-filter="info">Info</button>' +
        '<button class="output-filter-btn" data-filter="warn">Warn</button>' +
        '<button class="output-filter-btn" data-filter="error">Error</button>' +
        '<button class="output-filter-btn" data-filter="log">Log</button>' +
        '<button class="output-clear-btn" title="Clear output">Clear</button>' +
      '</div>' +
      '<div id="output-panel-content" style="flex:1;overflow-y:auto;"></div>';

    _bindOutputEvents(container);
    _renderOutputLines(container.querySelector('#output-panel-content'));
  }

  function _bindOutputEvents(container) {
    container.querySelectorAll('.output-filter-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('.output-filter-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _outputFilter = btn.dataset.filter;
        _renderOutputLines(container.querySelector('#output-panel-content'));
      });
    });
    var clearBtn = container.querySelector('.output-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function() {
      _outputLines = [];
      var out = container.querySelector('#output-panel-content');
      if (out) out.innerHTML = '<div class="panel-empty">Output cleared.</div>';
    });
  }

  function _appendOutputLine(level, message) {
    var entry = { level: level, message: message, time: new Date().toLocaleTimeString() };
    _outputLines.push(entry);
    if (_outputLines.length > 500) _outputLines = _outputLines.slice(-400);

    var container = document.querySelector('[data-panel="output"]');
    var out = container ? container.querySelector('#output-panel-content') : null;
    if (!out) return;

    var empty = out.querySelector('.panel-empty');
    if (empty) empty.remove();

    // Filter check
    if (_outputFilter !== 'all' && level !== _outputFilter) return;

    var colors = { log:'var(--text)', info:'var(--accent)', warn:'var(--warning)', error:'var(--danger)', success:'var(--success)', output:'var(--text)', separator:'var(--border)' };
    var line = document.createElement('div');
    line.className = 'output-line output-' + level;
    line.innerHTML =
      '<span class="output-ts">' + entry.time + '</span>' +
      '<span class="output-level">' + level.toUpperCase() + '</span>' +
      '<span class="output-msg">' + _esc(message) + '</span>';
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;

    if (level === 'error' && _activeId !== BUILTIN.OUTPUT) show(BUILTIN.OUTPUT);
  }

  function _renderOutputLines(out) {
    if (!out) return;
    if (_outputLines.length === 0) { out.innerHTML = '<div class="panel-empty">No output yet. Run a file to see output here.</div>'; return; }
    var filtered = _outputFilter === 'all' ? _outputLines : _outputLines.filter(function(l) { return l.level === _outputFilter; });
    out.innerHTML = filtered.map(function(entry) {
      return '<div class="output-line output-' + entry.level + '">' +
             '<span class="output-ts">' + entry.time + '</span>' +
             '<span class="output-level">' + entry.level.toUpperCase() + '</span>' +
             '<span class="output-msg">' + _esc(entry.message) + '</span>' +
             '</div>';
    }).join('') || '<div class="panel-empty">No ' + _outputFilter + ' messages.</div>';
    out.scrollTop = out.scrollHeight;
  }

  // ─── Register / Unregister ─────────────────────────────────────────────

  function register(config) {
    if (_panels[config.id]) unregister(config.id);
    var el       = document.createElement('div');
    el.className = 'panel-content-pane hidden';
    el.setAttribute('data-panel', config.id);
    if (_panelBody) _panelBody.appendChild(el);
    _panels[config.id] = { config: config, el: el, rendered: false };
    _renderBar();
    if (!_isOpen && Object.keys(_panels).length === 1) show(config.id);
  }

  function unregister(id) {
    var p = _panels[id];
    if (!p) return;
    if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    delete _panels[id];
    if (_activeId === id) {
      var remaining = Object.keys(_panels);
      if (remaining.length > 0) show(remaining[0]);
      else _closePanel();
    }
    _renderBar();
  }

  // ─── Show / Hide ────────────────────────────────────────────────────────

  function show(id) {
    var p = _panels[id];
    if (!p) return;
    Object.keys(_panels).forEach(function(k) {
      _panels[k].el.classList.add('hidden');
      if (_panels[k].config.onHide) _panels[k].config.onHide();
    });
    p.el.classList.remove('hidden');
    _activeId = id;
    if (!p.rendered) { p.config.render(p.el); p.rendered = true; }
    if (p.config.onShow) p.config.onShow(p.el);
    _openPanel();
    _renderBar();
    setTimeout(function() { if (typeof Editor !== 'undefined' && Editor.resize) Editor.resize(); }, 60);
  }

  function hide(id)   { if (_activeId === id) _closePanel(); }
  function toggle(id) { if (_isOpen && _activeId === id) _closePanel(); else show(id); }
  function toggleById(id) { toggle(id || _activeId || BUILTIN.OUTPUT); }
  function getActive()    { return _activeId; }

  function _openPanel() {
    if (_isOpen) return;
    _isOpen = true;
    if (_panelArea) { _panelArea.classList.remove('hidden'); _panelArea.style.display = 'flex'; }
    setTimeout(function() { if (typeof Editor !== 'undefined' && Editor.resize) Editor.resize(); }, 60);
  }

  function _closePanel() {
    _isOpen = false;
    if (_panelArea) { _panelArea.classList.add('hidden'); _panelArea.style.display = ''; }
    setTimeout(function() { if (typeof Editor !== 'undefined' && Editor.resize) Editor.resize(); }, 60);
    _renderBar();
  }

  function _toggleMaximize() {
    if (!_panelArea) return;
    if (_isMax) {
      _panelArea.style.height = _prevH + 'px'; _isMax = false;
    } else {
      _prevH = _panelArea.offsetHeight || 220;
      _panelArea.style.height = '85vh'; _isMax = true;
    }
    _renderBar();
    setTimeout(function() { if (typeof Editor !== 'undefined' && Editor.resize) Editor.resize(); }, 60);
  }

  // ─── Render Bar ─────────────────────────────────────────────────────────

  function _renderBar() {
    if (!_panelBar) return;
    var tabsHtml = '';
    Object.keys(_panels).forEach(function(id) {
      var p = _panels[id];
      var active = id === _activeId ? ' active' : '';
      var icon   = p.config.icon ? '<span class="panel-tab-icon">' + p.config.icon + '</span>' : '';
      tabsHtml += '<button class="panel-tab' + active + '" data-id="' + id + '">' + icon + p.config.title + '</button>';
    });

    var maxIcon = _isMax
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="21" y2="3"/><line x1="3" y1="21" x2="14" y2="10"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

    _panelBar.innerHTML =
      '<div class="panel-tabs">' + tabsHtml + '</div>' +
      '<div class="panel-bar-actions">' +
        '<button id="btn-panel-max"   class="panel-action-btn" title="Maximize">' + maxIcon + '</button>' +
        '<button id="btn-panel-close" class="panel-action-btn" title="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>';

    _panelBar.querySelectorAll('.panel-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { toggle(btn.dataset.id); });
    });
    var maxBtn   = document.getElementById('btn-panel-max');
    var closeBtn = document.getElementById('btn-panel-close');
    if (maxBtn)   maxBtn.addEventListener('click', _toggleMaximize);
    if (closeBtn) closeBtn.addEventListener('click', _closePanel);
  }

  // ─── Resizer ────────────────────────────────────────────────────────────

  function _bindResizer() {
    var r = document.getElementById('panel-resizer');
    if (!r) return;
    // Clone to remove old listeners
    var nr = r.cloneNode(true);
    r.parentNode.replaceChild(nr, r);

    nr.addEventListener('mousedown',  function(e) { _startResize(e.clientY); });
    nr.addEventListener('touchstart', function(e) { _startResize(e.touches[0].clientY); }, { passive:true });
    document.addEventListener('mousemove',  function(e) { _doResize(e.clientY); });
    document.addEventListener('touchmove',  function(e) { if(_resizing){ e.preventDefault(); _doResize(e.touches[0].clientY); } }, { passive:false });
    document.addEventListener('mouseup',    _stopResize);
    document.addEventListener('touchend',   _stopResize);
  }

  function _startResize(y) {
    _resizing = true; _startY = y;
    _startH   = _panelArea ? _panelArea.offsetHeight : 220;
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'ns-resize';
    if (_isMax) _isMax = false;
  }
  function _doResize(y) {
    if (!_resizing || !_panelArea) return;
    var newH = Math.max(80, Math.min(_startH + (_startY - y), window.innerHeight * 0.85));
    _panelArea.style.height = newH + 'px';
    if (typeof Editor !== 'undefined' && Editor.resize) Editor.resize();
  }
  function _stopResize() {
    if (!_resizing) return;
    _resizing = false;
    document.body.style.userSelect = '';
    document.body.style.cursor     = '';
  }

  function log(level, message) { _appendOutputLine(level, message); if (!_isOpen) show(BUILTIN.OUTPUT); }
  function clearOutput() { _outputLines = []; var c = document.getElementById('output-panel-content'); if(c) c.innerHTML = '<div class="panel-empty">Cleared.</div>'; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, register, unregister, show, hide, toggle, toggleById, getActive, log, clearOutput, BUILTIN };
})();
