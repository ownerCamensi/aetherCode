/**
 * lang-runner.js — Python runner with micropip support
 * FIXED: exposes loadPyodide() for pip-panel, proper input() mock
 */
var LangRunner = (function() {

  var _pyodide    = null;
  var _pyLoading  = false;
  var _pyLoadCbs  = [];
  var _panelEl    = null;

  function init() {
    PanelSystem.register({
      id:'python', title:'Python',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M9.514 0C7.37 0 7.17 1.23 7.17 2.36v1.1h2.38v.37H5.68C4.49 3.83 3.5 4.84 3.5 6.83c0 1.98.93 2.37 2.18 2.37H6.5V7.95c0-1.12.6-2.12 2.12-2.12h2.56c1.19 0 1.82-.7 1.82-1.82V2.36C13 1.24 12.04 0 9.514 0zm-1.3.93c.45 0 .82.37.82.82a.82.82 0 0 1-.82.82.82.82 0 0 1-.82-.82c0-.45.37-.82.82-.82z"/></svg>',
      render: _renderPanel,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'run-python', label:'Python: Run Current File', category:'Python', action: runPython });
    }
  }

  // ─── Load Pyodide ───────────────────────────────────────────────────────

  function loadPyodide() {
    return new Promise(function(resolve, reject) {
      if (_pyodide) { resolve(_pyodide); return; }
      _pyLoadCbs.push({ resolve, reject });
      if (_pyLoading) return;
      _pyLoading = true;
      _pyLog('info', '⏳ Loading Python (Pyodide ~10MB)...');

      var s   = document.createElement('script');
      s.src   = 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js';
      s.onload = function() {
        _pyLog('info', '⚙️ Initializing Python environment...');
        window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' })
          .then(function(py) {
            _pyodide  = py;
            _pyLoading = false;
            _pyLog('success', '✅ Python ' + py.version + ' ready!');
            _pyLoadCbs.forEach(function(cb) { cb.resolve(py); });
            _pyLoadCbs = [];
          })
          .catch(function(e) {
            _pyLoading = false;
            _pyLoadCbs.forEach(function(cb) { cb.reject(e); });
            _pyLoadCbs = [];
          });
      };
      s.onerror = function() {
        _pyLoading = false;
        var e = new Error('Failed to load Pyodide CDN. Check internet.');
        _pyLoadCbs.forEach(function(cb) { cb.reject(e); });
        _pyLoadCbs = [];
      };
      document.head.appendChild(s);
    });
  }

  // ─── Run Python ─────────────────────────────────────────────────────────

  function runPython() {
    PanelSystem.show('python');
    var file = getActiveFile();
    if (!file) { _pyLog('error', 'No active file.'); return; }
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'py') { _pyLog('warn', 'Active file is not .py: ' + file.name); return; }

    var code = Editor && Editor._ace ? Editor._ace.getValue() : (file.content || '');
    if (!code.trim()) { _pyLog('warn', 'File is empty.'); return; }

    loadPyodide().then(function(py) { _execute(py, code); }).catch(function(e) { _pyLog('error', 'Load error: ' + e.message); });
  }

  function _execute(py, code) {
    _pyLog('info', '▶ Running...');
    _pyLog('separator');

    // Register JS callbacks for stdout/stderr
    py.globals.set('_js_out',   function(s) { _pyLog('output', s); });
    py.globals.set('_js_err',   function(s) { _pyLog('error', s); });
    py.globals.set('_js_input', function(p) {
      var ans = window.prompt(p || 'input()');
      if (ans === null) ans = '';
      _pyLog('info', (p || '') + ans);
      return ans;
    });

    var setup = [
      'import sys, builtins',
      'class _JSOut:',
      '    def __init__(self, fn): self._fn = fn',
      '    def write(self, s):',
      '        if s and s != "\\n": self._fn(s)',
      '    def flush(self): pass',
      'sys.stdout = _JSOut(_js_out)',
      'sys.stderr = _JSOut(_js_err)',
      'builtins.input = lambda p="": _js_input(str(p))',
    ].join('\n');

    try { py.runPython(setup); } catch(e) { _pyLog('error', 'Setup: ' + e.message); return; }

    var wrapped =
      'try:\n' +
      code.split('\n').map(function(l) { return '    ' + l; }).join('\n') + '\n' +
      'except Exception as _e:\n' +
      '    import traceback; _js_err(traceback.format_exc())\n' +
      'except SystemExit as _e:\n' +
      '    _js_out("Process exited: " + str(_e.code))\n';

    var t = Date.now();
    try {
      py.runPython(wrapped);
      _pyLog('separator');
      _pyLog('success', '✅ Done in ' + (Date.now()-t) + 'ms');
    } catch(e) {
      _pyLog('separator');
      _pyLog('error', String(e.message || e));
      _pyLog('error', '❌ Failed in ' + (Date.now()-t) + 'ms');
    } finally {
      try { py.runPython('sys.stdout=sys.__stdout__; sys.stderr=sys.__stderr__'); } catch(e2){}
    }
  }

  // ─── Panel ──────────────────────────────────────────────────────────────

  function _renderPanel(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div class="lang-panel">',
        '<div class="lang-toolbar">',
          '<button class="btn-sm btn-primary-sm" id="py-run-btn">▶ Run</button>',
          '<button class="btn-sm" id="py-clear-btn">Clear</button>',
          '<button class="btn-sm" id="py-load-btn" title="Pre-load Python (faster first run)">Load Python</button>',
          '<span class="lang-hint">Active file must be .py</span>',
        '</div>',
        '<div class="lang-output" id="py-output"></div>',
      '</div>',
    ].join('');

    container.querySelector('#py-run-btn').addEventListener('click', runPython);
    container.querySelector('#py-clear-btn').addEventListener('click', function() {
      var out = document.getElementById('py-output'); if (out) out.innerHTML = '';
    });
    container.querySelector('#py-load-btn').addEventListener('click', function() {
      loadPyodide().catch(function(e) { _pyLog('error', e.message); });
    });
  }

  function _pyLog(level, message) {
    if (typeof EventBus !== 'undefined') EventBus.emit('output:log', { level: level === 'output' ? 'log' : level, message: message || '' });
    var out = document.getElementById('py-output');
    if (!out) return;

    if (level === 'separator') {
      var sep = document.createElement('div');
      sep.style.cssText = 'height:1px;background:rgba(255,255,255,.06);margin:4px 0;';
      out.appendChild(sep);
      out.scrollTop = out.scrollHeight; return;
    }

    var colors = { output:'#d4d4d4', info:'#9cdcfe', warn:'#cca700', error:'#f48771', success:'#3fb950' };
    var el = document.createElement('div');
    el.style.cssText = 'font-family:var(--font-code,monospace);font-size:12px;line-height:1.6;padding:1px 10px;white-space:pre-wrap;word-break:break-all;color:' + (colors[level]||'#ccc') + ';' + (level==='error'?'background:rgba(244,135,113,.05);':'');
    el.textContent = message || '';
    out.appendChild(el);
    out.scrollTop = out.scrollHeight;
  }

  return { init, runPython, loadPyodide, _getPyodide: function() { return _pyodide; } };
})();
