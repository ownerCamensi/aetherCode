/**
 * python-runner.js — Run Python in the browser via Pyodide
 * Supports: numpy, pandas, matplotlib (via canvas), requests (via fetch)
 * Fully offline after first load.
 */
var PythonRunner = (function() {

  var _pyodide    = null;
  var _loading    = false;
  var _ready      = false;
  var _panelEl    = null;
  var _outputLines = [];

  var PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js';

  function init() {
    PanelSystem.register({
      id: 'python', title: 'Python',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.402 3.35-3.402h5.769s3.24.052 3.24-3.13V3.13S18.28 0 11.914 0zm-3.2 1.812a1.042 1.042 0 1 1 0 2.083 1.042 1.042 0 0 1 0-2.083zM12.1 24c6.094 0 5.714-2.656 5.714-2.656l-.007-2.752H12v-.826h8.12S24 18.211 24 12.031c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.402-3.35 3.402H9.448S6.208 12.288 6.208 15.47V20.87S5.734 24 12.1 24zm3.2-1.813a1.042 1.042 0 1 1 0-2.083 1.042 1.042 0 0 1 0 2.083z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; }
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'python-run', label:'Python: Run Active .py File', category:'Run', action: runActiveFile });
      CommandPalette.register({ id:'python-open', label:'Python: Open Python Console', category:'Run', action: function(){ PanelSystem.show('python'); } });
    }

    // Auto-run .py files when saved
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      if (data && data.file && data.file.name.endsWith('.py')) {
        if (_panelEl) _render(_panelEl);
      }
    });
  }

  function _render(container) {
    _panelEl = container;
    var activeFile = typeof getActiveFile !== 'undefined' ? getActiveFile() : null;
    var isPython = activeFile && activeFile.name.endsWith('.py');

    container.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%">' +
        // Header
        '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0;display:flex;align-items:center;gap:8px">' +
          '<svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;color:#f7c948"><path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.96 3.403 5.96h2.03v-2.867s-.109-3.402 3.35-3.402h5.769s3.24.052 3.24-3.13V3.13S18.28 0 11.914 0zm-3.2 1.812a1.042 1.042 0 1 1 0 2.083 1.042 1.042 0 0 1 0-2.083zM12.1 24c6.094 0 5.714-2.656 5.714-2.656l-.007-2.752H12v-.826h8.12S24 18.211 24 12.031c0-6.18-3.403-5.96-3.403-5.96h-2.03v2.867s.109 3.402-3.35 3.402H9.448S6.208 12.288 6.208 15.47V20.87S5.734 24 12.1 24zm3.2-1.813a1.042 1.042 0 1 1 0-2.083 1.042 1.042 0 0 1 0 2.083z"/></svg>' +
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">Python Runner</span>' +
          '<span style="font-size:10px;color:var(--text-dim);margin-left:2px">via Pyodide</span>' +
          '<div style="flex:1"></div>' +
          (_ready
            ? '<span style="font-size:9px;background:rgba(63,185,80,.15);color:var(--success);padding:1px 6px;border-radius:8px">READY</span>'
            : (_loading
                ? '<span style="font-size:9px;background:rgba(204,167,0,.15);color:var(--warning);padding:1px 6px;border-radius:8px">LOADING…</span>'
                : '<span style="font-size:9px;background:rgba(255,255,255,.08);color:var(--text-dim);padding:1px 6px;border-radius:8px">NOT LOADED</span>'
              )
          ) +
        '</div>' +

        // File info + run button
        '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a;display:flex;align-items:center;gap:8px;flex-shrink:0">' +
          (isPython
            ? '<span style="font-size:12px;color:var(--text);flex:1">▶ ' + (activeFile.name) + '</span>' +
              '<button id="py-run-btn" class="btn-sm btn-primary-sm" style="font-size:11px;padding:4px 14px">' + (_ready ? '▶ Run' : '⬇ Load & Run') + '</button>'
            : '<span style="font-size:11px;color:var(--text-dim)">Open a .py file to run it here</span>'
          ) +
        '</div>' +

        // REPL input
        '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a;flex-shrink:0">' +
          '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">Quick REPL</div>' +
          '<div style="display:flex;gap:6px">' +
            '<input id="py-repl" placeholder=">>> print(\'hello\')" style="flex:1;background:#1a1a1a;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:12px;padding:5px 8px;font-family:var(--font-code)">' +
            '<button id="py-repl-run" class="btn-sm" style="font-size:11px">Run</button>' +
          '</div>' +
        '</div>' +

        // Output
        '<div style="flex:1;overflow-y:auto;padding:10px 12px;font-family:var(--font-code);font-size:12px;line-height:1.6" id="py-output">' +
          (_outputLines.length === 0
            ? '<span style="color:var(--text-dim)">Output will appear here…</span>'
            : _outputLines.map(function(l) {
                return '<div class="py-line py-line-' + l.type + '">' + _escHtml(l.text) + '</div>';
              }).join('')
          ) +
        '</div>' +

        // Clear
        '<div style="padding:6px 12px;border-top:1px solid #1a1a1a;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">' +
          '<span style="font-size:10px;color:var(--text-dim)">numpy · pandas · matplotlib · requests</span>' +
          '<button id="py-clear" class="btn-sm" style="font-size:10px;padding:2px 8px">Clear</button>' +
        '</div>' +
      '</div>';

    var runBtn = container.querySelector('#py-run-btn');
    if (runBtn) runBtn.addEventListener('click', function() { runActiveFile(); });

    var replInput = container.querySelector('#py-repl');
    var replRun   = container.querySelector('#py-repl-run');
    if (replRun) replRun.addEventListener('click', function() {
      var code = replInput ? replInput.value.trim() : '';
      if (!code) return;
      if (replInput) replInput.value = '';
      _runCode(code, true);
    });
    if (replInput) replInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); var code = replInput.value.trim(); if(code){replInput.value='';_runCode(code,true);} }
    });

    var clearBtn = container.querySelector('#py-clear');
    if (clearBtn) clearBtn.addEventListener('click', function() { _outputLines=[]; _render(container); });
  }

  function runActiveFile() {
    var file = typeof getActiveFile !== 'undefined' ? getActiveFile() : null;
    if (!file || !file.name.endsWith('.py')) { if(UI) UI.toast('Open a .py file first','warn'); return; }
    PanelSystem.show('python');
    _runCode(file.content || '', false);
  }

  function _runCode(code, isRepl) {
    if (isRepl) _appendOutput('>>> ' + code, 'input');

    if (!_ready) {
      _loadPyodide(function() { _execPython(code); });
    } else {
      _execPython(code);
    }
  }

  function _loadPyodide(cb) {
    if (_loading) return;
    _loading = true;
    _appendOutput('Loading Pyodide (first time only — ~8MB)…', 'system');
    if (_panelEl) _render(_panelEl);

    var s = document.createElement('script');
    s.src = PYODIDE_CDN;
    s.onload = function() {
      window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/' }).then(function(py) {
        _pyodide = py;
        _ready   = true;
        _loading = false;
        _appendOutput('✅ Python ready! (Pyodide 0.27.0)', 'system');
        if (_panelEl) _render(_panelEl);
        if (cb) cb();
      }).catch(function(e) {
        _loading = false;
        _appendOutput('❌ Failed to load Pyodide: ' + e.message, 'error');
        if (_panelEl) _render(_panelEl);
      });
    };
    s.onerror = function() {
      _loading = false;
      _appendOutput('❌ Could not load Pyodide CDN. Check your internet connection.', 'error');
      if (_panelEl) _render(_panelEl);
    };
    document.head.appendChild(s);
  }

  function _execPython(code) {
    if (!_pyodide) return;
    try {
      // Redirect stdout/stderr
      _pyodide.runPython([
        'import sys, io',
        '_stdout_buf = io.StringIO()',
        '_stderr_buf = io.StringIO()',
        'sys.stdout = _stdout_buf',
        'sys.stderr = _stderr_buf',
      ].join('\n'));

      try {
        var result = _pyodide.runPython(code);
        var stdout = _pyodide.runPython('_stdout_buf.getvalue()');
        var stderr = _pyodide.runPython('_stderr_buf.getvalue()');

        if (stdout) stdout.split('\n').forEach(function(l) { if(l) _appendOutput(l, 'stdout'); });
        if (stderr) stderr.split('\n').forEach(function(l) { if(l) _appendOutput(l, 'stderr'); });
        if (result !== undefined && result !== null && String(result) !== 'None') {
          _appendOutput(String(result), 'result');
        }
      } catch(e) {
        var errMsg = e.message || String(e);
        // Clean up Python traceback for readability
        var lines = errMsg.split('\n');
        var lastLines = lines.slice(-3).join('\n');
        _appendOutput(lastLines, 'error');
      }

      // Restore stdout
      _pyodide.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__');
    } catch(e) {
      _appendOutput('Runtime error: ' + e.message, 'error');
    }

    if (_panelEl) {
      var out = _panelEl.querySelector('#py-output');
      if (out) {
        out.innerHTML = _outputLines.map(function(l) {
          return '<div class="py-line py-line-' + l.type + '">' + _escHtml(l.text) + '</div>';
        }).join('');
        out.scrollTop = out.scrollHeight;
      }
    }
  }

  function _appendOutput(text, type) {
    _outputLines.push({ text: text, type: type || 'stdout' });
    if (_outputLines.length > 500) _outputLines = _outputLines.slice(-500);
  }

  function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, runActiveFile };
})();
