/**
 * terminal.js — Termux-style terminal panel
 * When on mobile with Termux installed, bridges CodeX ↔ Termux
 * via intent URLs. On desktop, provides a simulated shell.
 *
 * How it works:
 *   1. User selects a project folder (from file tree or File System Access API)
 *   2. Terminal panel shows with simulated commands
 *   3. "Open in Termux" button sends current path via deep link
 *   4. Termux command suggestions: npm install, pip install, ls, etc.
 */
var Terminal = (function() {

  var _panelEl      = null;
  var _cwd          = '/';
  var _history      = [];
  var _histIdx      = -1;
  var _outputLines  = [];
  var _folderPath   = null; // File System Access API path if available

  function init() {
    PanelSystem.register({
      id:    'terminal',
      title: 'Terminal',
      icon:  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 9a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3A.5.5 0 0 1 6 9zM3.854 4.146a.5.5 0 1 0-.708.708L4.793 6.5 3.146 8.146a.5.5 0 1 0 .708.708l2-2a.5.5 0 0 0 0-.708l-2-2z"/><path d="M2 1a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2H2zm12 1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'terminal-open', label:'Terminal: Open Terminal Panel', category:'View', action: function(){ PanelSystem.show('terminal'); } });
      CommandPalette.register({ id:'terminal-termux', label:'Terminal: Open in Termux', category:'View', action: _openInTermux });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div class="term-panel">',
        '<div class="term-toolbar">',
          '<span class="term-cwd" id="term-cwd">' + _esc(_cwd) + '</span>',
          '<div style="display:flex;gap:4px">',
            '<button class="btn-sm" id="term-clear-btn" style="font-size:10px;padding:2px 8px">Clear</button>',
            '<button class="btn-sm btn-primary-sm" id="term-termux-btn" style="font-size:10px;padding:2px 8px" title="Open this path in Termux app">📱 Termux</button>',
            '<button class="btn-sm" id="term-folder-btn" style="font-size:10px;padding:2px 8px" title="Select project folder">📁 Set Folder</button>',
          '</div>',
        '</div>',
        // Quick commands
        '<div class="term-quick">',
          _quickCmd('ls -la') + _quickCmd('npm install') + _quickCmd('npm run dev') + _quickCmd('npm run build') +
          _quickCmd('pip install -r requirements.txt') + _quickCmd('python main.py') +
          _quickCmd('node server.js') + _quickCmd('git status') + _quickCmd('git log --oneline') +
          _quickCmd('git add . && git commit -m ""'),
        '</div>',
        '<div class="term-output" id="term-output">',
          _outputLines.map(_renderLine).join('') ||
          '<div class="term-welcome">',
            '<div style="color:#4fc1ff;font-size:12px;font-weight:600">CodeX Terminal</div>',
            '<div style="color:#858585;font-size:11px;margin-top:4px">',
              'Simulated shell with Termux integration.<br>',
              'Click 📱 Termux to open commands in Termux app.<br>',
              'Click 📁 Set Folder to link your project path.',
            '</div>',
          '</div>',
        '</div>',
        '<div class="term-input-row">',
          '<span class="term-prompt">$ </span>',
          '<input class="term-input" id="term-input" placeholder="Type command…" autocomplete="off" spellcheck="false">',
          '<button class="term-send-btn" id="term-send">↵</button>',
        '</div>',
      '</div>',
    ].join('');

    _bindTermEvents(container);
    _scrollToBottom();
  }

  function _quickCmd(cmd) {
    return '<button class="term-quick-btn" data-cmd="' + _esc(cmd) + '">' + _esc(cmd.split(' ')[0] + (cmd.includes(' ')?' …':'')) + '</button>';
  }

  function _bindTermEvents(container) {
    var input   = container.querySelector('#term-input');
    var sendBtn = container.querySelector('#term-send');

    if (sendBtn) sendBtn.addEventListener('click', function() { _runCmd(input ? input.value : ''); if (input) { input.value = ''; input.focus(); } });
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { _runCmd(input.value); input.value = ''; }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          _histIdx = Math.min(_histIdx + 1, _history.length - 1);
          if (_history[_history.length - 1 - _histIdx]) input.value = _history[_history.length - 1 - _histIdx];
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          _histIdx = Math.max(_histIdx - 1, -1);
          input.value = _histIdx >= 0 ? (_history[_history.length - 1 - _histIdx] || '') : '';
        }
      });
      input.focus();
    }

    container.querySelector('#term-clear-btn') && container.querySelector('#term-clear-btn').addEventListener('click', function() {
      _outputLines = []; var out = container.querySelector('#term-output'); if (out) out.innerHTML = '';
    });

    container.querySelector('#term-termux-btn') && container.querySelector('#term-termux-btn').addEventListener('click', _openInTermux);

    container.querySelector('#term-folder-btn') && container.querySelector('#term-folder-btn').addEventListener('click', function() {
      // Use File System Access API if available
      if ('showDirectoryPicker' in window) {
        window.showDirectoryPicker().then(function(handle) {
          _folderPath = handle.name;
          _cwd = '~/' + handle.name;
          var cwdEl = container.querySelector('#term-cwd');
          if (cwdEl) cwdEl.textContent = _cwd;
          _logLine('system', 'Folder set to: ' + _cwd);
          if (UI) UI.toast('Folder linked: ' + _cwd, 'success');
        }).catch(function(){});
      } else {
        var p = prompt('Enter project path (e.g. /storage/emulated/0/myproject):');
        if (p) { _folderPath = p; _cwd = p; var el = container.querySelector('#term-cwd'); if (el) el.textContent = _cwd; }
      }
    });

    container.querySelectorAll('.term-quick-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (input) { input.value = btn.dataset.cmd; input.focus(); }
      });
    });
  }

  // ─── Command runner (simulated) ────────────────────────────────────────────

  function _runCmd(rawCmd) {
    var cmd = (rawCmd || '').trim();
    if (!cmd) return;
    _history.push(cmd);
    _histIdx = -1;
    _logLine('input', '$ ' + cmd);

    var parts = cmd.split(/\s+/);
    var base  = parts[0];

    // Simulated commands
    if (base === 'ls' || base === 'dir') {
      var files = AppState.files.filter(function(f){ return f.name !== '.gitkeep'; });
      _logLine('output', files.map(function(f){ return (f.path&&f.path.indexOf('/')!==-1?'📁 ':'📄 ')+f.name; }).join('\n') || '(empty)');
    } else if (base === 'clear' || base === 'cls') {
      _outputLines = []; var out = _panelEl && _panelEl.querySelector('#term-output'); if (out) out.innerHTML = '';
    } else if (base === 'pwd') {
      _logLine('output', _folderPath || _cwd);
    } else if (base === 'cat' && parts[1]) {
      var name = parts[1];
      var file = AppState.files.filter(function(f){ return f.name===name||f.path===name; })[0];
      if (file) _logLine('output', file.content || '(empty file)');
      else _logLine('error', 'cat: ' + name + ': No such file');
    } else if (base === 'echo') {
      _logLine('output', parts.slice(1).join(' ').replace(/^["']|["']$/g,''));
    } else if (base === 'cd') {
      if (parts[1]) { _cwd = _folderPath ? _folderPath + '/' + parts[1] : parts[1]; }
      else { _cwd = _folderPath || '~'; }
      var cwdEl = _panelEl && _panelEl.querySelector('#term-cwd');
      if (cwdEl) cwdEl.textContent = _cwd;
    } else if (['npm','npx','yarn','pnpm','pip','pip3','python','python3','node','git','cargo','go'].indexOf(base) !== -1) {
      // Real package managers — open in Termux
      _logLine('warn', 'ℹ️  ' + base + ' requires native execution.');
      _logLine('output', 'Opening in Termux with: cd "' + (_folderPath||_cwd) + '" && ' + cmd);
      _openInTermuxWithCmd(cmd);
    } else if (base === 'help') {
      _logLine('output', [
        'Available commands:',
        '  ls / dir       — list project files',
        '  cat <file>     — view file content',
        '  echo <text>    — print text',
        '  cd <dir>       — change directory',
        '  clear          — clear terminal',
        '  pwd            — print working directory',
        '',
        'Package managers (opens Termux):',
        '  npm, npx, yarn, pip, python, node, git, cargo, go',
      ].join('\n'));
    } else {
      _logLine('warn', base + ': command not found in simulated shell.');
      _logLine('output', 'Tip: Use "help" for available commands, or tap 📱 Termux for native commands.');
    }

    _scrollToBottom();
  }

  // ─── Termux integration ───────────────────────────────────────────────────

  function _openInTermux() {
    var path = _folderPath || _cwd || '.';
    var cdCmd = 'cd "' + path.replace(/"/g,'\\"') + '"';
    _sendToTermux(cdCmd);
  }

  function _openInTermuxWithCmd(cmd) {
    var path  = _folderPath || _cwd || '.';
    var fullCmd = 'cd "' + path.replace(/"/g,'\\"') + '" && ' + cmd;
    _sendToTermux(fullCmd);
  }

  function _sendToTermux(cmd) {
    // Termux deep link: termux://open?command=...
    var encoded = encodeURIComponent(cmd);
    var url     = 'termux://open?command=' + encoded;

    _logLine('info', '📱 Sending to Termux: ' + cmd);

    // Try Android intent (works if Termux is installed)
    var a = document.createElement('a');
    a.href = url;
    a.click();

    // Fallback: copy to clipboard
    setTimeout(function() {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(function() {
          _logLine('success', '✅ Command copied to clipboard! Paste in Termux.');
          if (UI) UI.toast('Copied to clipboard — paste in Termux', 'success');
        });
      }
    }, 300);
  }

  // ─── Output helpers ─────────────────────────────────────────────────────

  function _logLine(type, text) {
    _outputLines.push({ type: type, text: text });
    var out = _panelEl && _panelEl.querySelector('#term-output');
    if (!out) return;
    // Remove welcome if present
    var welcome = out.querySelector('.term-welcome');
    if (welcome) welcome.remove();
    var el = document.createElement('div');
    el.innerHTML = _renderLine({ type: type, text: text });
    // Unwrap the div inside (innerHTML creates string)
    out.insertAdjacentHTML('beforeend', _renderLine({ type: type, text: text }));
  }

  function _renderLine(line) {
    var colors = {
      input:'#9cdcfe', output:'#d4d4d4', error:'#f48771',
      warn:'#cca700', info:'#4fc1ff', success:'#3fb950', system:'#858585',
    };
    return '<div style="font-family:var(--font-code,monospace);font-size:12px;line-height:1.5;padding:1px 8px;white-space:pre-wrap;word-break:break-all;color:' + (colors[line.type]||'#ccc') + '">' +
           _esc(line.text) + '</div>';
  }

  function _scrollToBottom() {
    var out = _panelEl && _panelEl.querySelector('#term-output');
    if (out) out.scrollTop = out.scrollHeight;
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
