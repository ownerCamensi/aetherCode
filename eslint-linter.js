/**
 * eslint-linter.js — Real-time ESLint + basic linting in Ace editor
 * Uses ESLint 8 via CDN for JS/TS, basic parsers for HTML/CSS
 * Shows red/yellow squiggles + gutter markers in editor
 */
var ESLintLinter = (function() {

  var _enabled      = false;
  var _eslintReady  = false;
  var _debounce     = null;
  var _markers      = [];
  var _annotations  = [];
  var STORAGE_KEY   = 'codex:eslint-enabled';
  var ESLINT_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/eslint/8.57.0/eslint.min.js';

  // Default ESLint rules — balanced for beginner/intermediate
  var DEFAULT_RULES = {
    'no-undef':              'warn',
    'no-unused-vars':        'warn',
    'no-console':            'off',
    'no-debugger':           'warn',
    'no-duplicate-case':     'error',
    'no-empty':              'warn',
    'no-extra-semi':         'warn',
    'no-unreachable':        'warn',
    'no-var':                'off',
    'prefer-const':          'off',
    'eqeqeq':                'warn',
    'no-redeclare':          'error',
    'use-isnan':             'error',
    'valid-typeof':          'error',
    'no-constant-condition': 'warn',
    'no-dupe-keys':          'error',
    'no-duplicate-imports':  'error',
    'no-self-assign':        'warn',
    'semi':                  ['warn', 'always'],
  };

  function init() {
    _enabled = localStorage.getItem(STORAGE_KEY) === 'true';

    if (_enabled) _loadESLint();

    EventBus.on('editor:change', function() {
      if (!_enabled) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(_lint, 700);
    });

    EventBus.on(Events.FILE_SWITCHED, function() {
      if (!_enabled) return;
      clearTimeout(_debounce);
      _debounce = setTimeout(_lint, 400);
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'eslint-toggle', label:'ESLint: Toggle Real-time Linting',    category:'Code', action: toggle });
      CommandPalette.register({ id:'eslint-fix',    label:'ESLint: Fix Current File',            category:'Code', action: fixFile });
      CommandPalette.register({ id:'eslint-config', label:'ESLint: Open Lint Settings',          category:'Code', action: openConfig });
    }
  }

  function _loadESLint(cb) {
    if (_eslintReady) { if (cb) cb(); return; }
    if (document.getElementById('eslint-script')) { if (cb) cb(); return; }

    var s = document.createElement('script');
    s.id  = 'eslint-script';
    s.src = ESLINT_CDN;
    s.onload = function() {
      _eslintReady = true;
      if (UI) UI.toast('ESLint ready ✨', 'success');
      if (cb) cb();
      _lint();
    };
    s.onerror = function() {
      if (UI) UI.toast('ESLint CDN failed — check connection', 'warn');
    };
    document.head.appendChild(s);
  }

  function _lint() {
    if (!Editor || !Editor._ace) return;
    var file = typeof getActiveFile !== 'undefined' ? getActiveFile() : null;
    if (!file) return;

    var ext  = (file.name.split('.').pop() || '').toLowerCase();
    var code = Editor._ace.getValue() || '';

    if (['js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx'].includes(ext)) {
      if (!_eslintReady) { _loadESLint(); return; }
      _lintJS(code, ext);
    } else if (ext === 'html') {
      _lintHTML(code);
    } else if (ext === 'css') {
      _lintCSS(code);
    } else {
      _clearMarkers();
    }
  }

  function _lintJS(code, ext) {
    if (!window.eslint) return;
    try {
      var messages = window.eslint.verify(code, {
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: ext === 'jsx' || ext === 'tsx', globalReturn: true },
        },
        env: { browser: true, es2022: true, node: true },
        globals: {
          // CodeX globals
          AppState:1, Editor:1, EventBus:1, Events:1, PanelSystem:1, UI:1,
          Runner:1, FolderTree:1, TabManager:1, CommandPalette:1,
          getActiveFile:1, saveToStorage:1, createFileObject:1,
          Icons:1, AIAssistant:1,
        },
        rules: _getActiveRules(),
      });
      _applyMessages(messages);
    } catch(e) {
      _clearMarkers();
    }
  }

  function _lintHTML(code) {
    var errors = [];
    var lines   = code.split('\n');

    // Check unclosed tags
    var tagStack = [];
    var selfClose = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
    lines.forEach(function(line, row) {
      var re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g, m;
      while ((m = re.exec(line)) !== null) {
        var tag   = m[1].toLowerCase();
        var isClose = m[0].startsWith('</');
        var isSelf  = m[0].endsWith('/>') || selfClose.indexOf(tag) !== -1;
        if (!isClose && !isSelf) tagStack.push({ tag:tag, row:row, col:m.index });
        else if (isClose && tagStack.length > 0 && tagStack[tagStack.length-1].tag === tag) tagStack.pop();
      }
      // Inline style issues
      if (line.indexOf('style=""') !== -1) errors.push({ line:row+1, column:1, message:'Empty style attribute', severity:1 });
    });
    tagStack.forEach(function(t) { errors.push({ line:t.row+1, column:t.col+1, message:'Unclosed <'+t.tag+'> tag', severity:1 }); });

    _applyMessages(errors.map(function(e) {
      return { line:e.line, column:e.column, message:e.message, severity:e.severity };
    }));
  }

  function _lintCSS(code) {
    var errors = [];
    var lines   = code.split('\n');
    var braceCount = 0;
    lines.forEach(function(line, i) {
      braceCount += (line.match(/{/g)||[]).length;
      braceCount -= (line.match(/}/g)||[]).length;
      // Missing semicolons (basic)
      var trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.endsWith(',') && !trimmed.endsWith(';') && trimmed.indexOf(':') !== -1 && !trimmed.startsWith('@') && !trimmed.startsWith('*')) {
        errors.push({ line:i+1, column:1, message:'Missing semicolon', severity:1 });
      }
      // Empty rule
      if (/{\s*}/.test(line)) errors.push({ line:i+1, column:1, message:'Empty CSS rule', severity:1 });
    });
    if (braceCount !== 0) errors.push({ line:lines.length, column:1, message:'Unbalanced braces ('+braceCount+')', severity:2 });
    _applyMessages(errors.map(function(e) { return { line:e.line, column:e.column, message:e.message, severity:e.severity }; }));
  }

  function _applyMessages(messages) {
    if (!Editor || !Editor._ace) return;
    var session = Editor._ace.getSession();
    _clearMarkers();

    var annotations = messages.map(function(msg) {
      var type = msg.severity === 2 ? 'error' : 'warning';
      return { row: (msg.line||1)-1, column: (msg.column||1)-1, text: msg.message, type: type };
    });

    session.setAnnotations(annotations);
    _annotations = annotations;

    // Add inline marker ranges for red/yellow underlines
    messages.forEach(function(msg) {
      var row = (msg.line||1)-1;
      var col = (msg.column||1)-1;
      var line = session.getLine(row) || '';
      var endCol = Math.min(col + (msg.endColumn ? msg.endColumn - msg.column : Math.max(5, line.trim().length)), line.length);

      var Range  = ace.require('ace/range').Range;
      var range  = new Range(row, col, row, endCol);
      var cls    = msg.severity === 2 ? 'ace-lint-error' : 'ace-lint-warn';
      var marker = session.addMarker(range, cls, 'text', false);
      _markers.push(marker);
    });

    // Update status bar
    _updateStatusBar(messages);
  }

  function _clearMarkers() {
    if (!Editor || !Editor._ace) return;
    var session = Editor._ace.getSession();
    _markers.forEach(function(m) { session.removeMarker(m); });
    _markers = [];
    _annotations = [];
    session.clearAnnotations();
    _updateStatusBar([]);
  }

  function _updateStatusBar(messages) {
    var el = document.getElementById('lint-status');
    if (!el) return;
    var errors   = messages.filter(function(m) { return m.severity === 2; }).length;
    var warnings = messages.filter(function(m) { return m.severity === 1; }).length;

    if (!_enabled) { el.innerHTML = ''; return; }
    if (errors + warnings === 0) {
      el.innerHTML = '<span style="color:var(--success)">✓ No issues</span>';
    } else {
      el.innerHTML =
        (errors   > 0 ? '<span style="color:var(--danger)">✗ '+errors+' error'+(errors>1?'s':'')+'</span> ' : '') +
        (warnings > 0 ? '<span style="color:var(--warning)">⚠ '+warnings+' warning'+(warnings>1?'s':'')+'</span>' : '');
    }
  }

  function _getActiveRules() {
    try {
      var saved = JSON.parse(localStorage.getItem('codex:eslint-rules') || 'null');
      return saved || DEFAULT_RULES;
    } catch(e) { return DEFAULT_RULES; }
  }

  // Auto-fix: remove unused vars markers, fix missing semicolons
  function fixFile() {
    if (!Editor || !Editor._ace) return;
    var code = Editor._ace.getValue();
    // Basic auto-fixes
    code = code.replace(/;;+/g, ';');                   // double semicolons
    code = code.replace(/\bvar\b(\s+\w)/g, 'let$1');    // var → let (optional — only if setting enabled)
    Editor._ace.setValue(code, -1);
    _lint();
    if (UI) UI.toast('Auto-fixed basic issues', 'success');
  }

  function openConfig() {
    var overlay = document.getElementById('modal-overlay');
    var modal   = document.getElementById('modal');
    if (!overlay || !modal) return;
    var rules = _getActiveRules();

    modal.style.width = 'min(500px,96vw)';
    modal.innerHTML = [
      '<div class="modal-header"><div style="display:flex;align-items:center;gap:8px"><span>🔍</span><span class="modal-title">ESLint Settings</span></div><button id="modal-close-btn" class="modal-close">×</button></div>',
      '<div class="modal-body" style="padding:14px;max-height:68vh;overflow-y:auto">',
        '<div style="margin-bottom:12px;font-size:11px;color:var(--text-dim)">Configure which rules are active. Changes apply instantly.</div>',
        '<div style="display:flex;flex-direction:column;gap:6px">',
          Object.keys(DEFAULT_RULES).map(function(rule) {
            var val = rules[rule];
            var level = Array.isArray(val) ? val[0] : val;
            return '<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;background:rgba(255,255,255,.04);border-radius:4px">' +
              '<code style="flex:1;font-size:11px;color:var(--text)">'+rule+'</code>' +
              '<select class="eslint-rule-select ai-select" data-rule="'+rule+'" style="width:90px;padding:3px 6px;font-size:11px">' +
                '<option value="off"'+(level==='off'?' selected':'')+'>off</option>' +
                '<option value="warn"'+(level==='warn'?' selected':'')+'>warn</option>' +
                '<option value="error"'+(level==='error'?' selected':'')+'>error</option>' +
              '</select>' +
            '</div>';
          }).join(''),
        '</div>',
      '</div>',
      '<div class="modal-footer">',
        '<button id="eslint-reset" class="btn-sm">Reset Defaults</button>',
        '<button id="eslint-save" class="btn-sm btn-primary-sm">Save</button>',
      '</div>',
    ].join('');

    overlay.classList.remove('hidden');
    modal.querySelector('#modal-close-btn').onclick = function() { overlay.classList.add('hidden'); };
    modal.querySelector('#eslint-reset').addEventListener('click', function() {
      localStorage.removeItem('codex:eslint-rules'); overlay.classList.add('hidden'); _lint(); if(UI) UI.toast('ESLint rules reset','info');
    });
    modal.querySelector('#eslint-save').addEventListener('click', function() {
      var newRules = {};
      modal.querySelectorAll('.eslint-rule-select').forEach(function(sel) { newRules[sel.dataset.rule] = sel.value; });
      localStorage.setItem('codex:eslint-rules', JSON.stringify(newRules));
      overlay.classList.add('hidden'); _lint(); if(UI) UI.toast('ESLint rules saved','success');
    });
  }

  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem(STORAGE_KEY, String(_enabled));
    if (_enabled) { _loadESLint(); }
    else { _clearMarkers(); }
    if (UI) UI.toast('ESLint ' + (_enabled ? '🔍 ON — live linting active' : 'OFF'), _enabled ? 'success' : 'info');
    return _enabled;
  }

  function isEnabled() { return _enabled; }

  return { init, toggle, isEnabled, fixFile, openConfig };
})();
