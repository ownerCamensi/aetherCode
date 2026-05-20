/**
 * tab-manager.js — Multi-tab editing with per-file Ace sessions
 *
 * FIX: ace.createEditSession does NOT exist on the global ace object.
 * The correct API is: new (ace.require('ace/edit_session').EditSession)(content, mode)
 * We grab the EditSession class once on init and reuse it.
 */

var TabManager = (function() {

  var _EditSession = null; // ace EditSession class — grabbed on init
  var _sessions    = {};   // fileId → EditSession instance
  var _dirty       = {};   // fileId → boolean
  var _dragSrcId   = null;

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Grab EditSession class — works with both CDN and local Ace
    try {
      _EditSession = ace.require('ace/edit_session').EditSession;
    } catch(e) {
      console.warn('[TabManager] Could not get EditSession class:', e);
      return;
    }

    EventBus.on(Events.APP_READY, function() {
      AppState.files.forEach(function(f) { _ensureSession(f); });
      _render();
      var active = getActiveFile();
      if (active) _activateSession(active);
    });

    EventBus.on(Events.FILE_CREATED, function(data) {
      if (data && data.file) _ensureSession(data.file);
      _render();
    });

    EventBus.on(Events.FILE_DELETED, function(data) {
      if (data && data.id) _destroySession(data.id);
      _render();
    });

    EventBus.on(Events.FILE_RENAMED, function() { _render(); });

    // When folder tree or other code switches files
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      if (data && data.file) {
        _ensureSession(data.file);
        _activateSession(data.file);
      }
      _render();
    });

    // Mark dirty on content change
    EventBus.on('editor:change', function() {
      var id = AppState.activeFileId;
      if (id && !_dirty[id]) {
        _dirty[id] = true;
        _updateDirtyDot(id, true);
      }
    });

    // Clear dirty on save
    EventBus.on('file:saved', function(data) {
      var id = (data && data.id) ? data.id : AppState.activeFileId;
      if (id) { _dirty[id] = false; _updateDirtyDot(id, false); }
    });

    _restoreTabOrder();
  }

  // ─── Session management ────────────────────────────────────────────────────

  function _ensureSession(file) {
    if (_sessions[file.id]) return _sessions[file.id];
    if (!_EditSession) return null;

    var mode    = _modeForFile(file.name);
    // new EditSession(content, mode) — correct API
    var session = new _EditSession(file.content || '', mode);
    session.setUseWorker(false); // disable background worker — avoids CORS issues with local files

    // Sync content changes back to the file object in AppState
    session.on('change', function() {
      if (AppState.activeFileId !== file.id) return;
      file.content    = session.getValue();
      file.modifiedAt = Date.now();
    });

    _sessions[file.id] = session;
    return session;
  }

  function _activateSession(file) {
    var aceInst = Editor && Editor._ace;
    if (!aceInst) return;
    var session = _ensureSession(file);
    if (!session) return;
    aceInst.setSession(session);
    AppState.activeFileId = file.id;
    aceInst.focus();
    // Update status bar language
    if (UI && UI.updateStatusLang) {
      UI.updateStatusLang(_langLabel(_ext(file.name)));
    }
  }

  function _destroySession(fileId) {
    var s = _sessions[fileId];
    if (s) { try { s.destroy && s.destroy(); } catch(e){} delete _sessions[fileId]; }
    delete _dirty[fileId];
  }

  // ─── Render tab bar ────────────────────────────────────────────────────────

  function _render() {
    var bar = document.getElementById('tab-bar');
    if (!bar) return;
    bar.innerHTML = '';

    AppState.files.forEach(function(file, idx) {
      bar.appendChild(_buildTab(file, idx));
    });

    // + New tab button
    var plus = document.createElement('button');
    plus.className = 'tab-new-btn';
    plus.title     = 'New File';
    plus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    plus.addEventListener('click', function() {
      var btn = document.getElementById('btn-new-file');
      if (btn) btn.click();
    });
    bar.appendChild(plus);
    _saveTabOrder();
  }

  function _buildTab(file, idx) {
    var ext     = _ext(file.name);
    var icon    = Icons.getFileIcon(ext, PluginManager ? PluginManager.getFileIconSVG(ext) : null);
    var isActive = file.id === AppState.activeFileId;
    var isDirty  = !!_dirty[file.id];

    var tab         = document.createElement('div');
    tab.className   = 'tab' + (isActive ? ' active' : '');
    tab.dataset.id  = file.id;
    tab.dataset.idx = String(idx);
    tab.draggable   = true;
    tab.innerHTML   =
      '<span class="tab-icon">' + icon + '</span>' +
      '<span class="tab-name">' + _esc(file.name) + '</span>' +
      (isDirty ? '<span class="tab-dirty" title="Unsaved">●</span>' : '') +
      '<button class="tab-close" data-id="' + file.id + '" title="Close (middle-click)">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      '</button>';

    // Switch on click
    tab.addEventListener('click', function(e) {
      if (e.target.closest('.tab-close')) return;
      _switchTo(file.id);
    });

    // Close button
    tab.querySelector('.tab-close').addEventListener('click', function(e) {
      e.stopPropagation(); _closeTab(file.id);
    });

    // Middle-click close
    tab.addEventListener('mousedown', function(e) {
      if (e.button === 1) { e.preventDefault(); _closeTab(file.id); }
    });

    // Drag reorder
    tab.addEventListener('dragstart', function(e) {
      _dragSrcId = file.id;
      e.dataTransfer.effectAllowed = 'move';
      tab.classList.add('dragging');
    });
    tab.addEventListener('dragend',  function() {
      tab.classList.remove('dragging');
      document.querySelectorAll('.tab.drag-over').forEach(function(t) { t.classList.remove('drag-over'); });
    });
    tab.addEventListener('dragover', function(e) {
      e.preventDefault();
      if (file.id !== _dragSrcId) tab.classList.add('drag-over');
    });
    tab.addEventListener('dragleave', function() { tab.classList.remove('drag-over'); });
    tab.addEventListener('drop', function(e) {
      e.preventDefault();
      tab.classList.remove('drag-over');
      if (_dragSrcId && _dragSrcId !== file.id) _reorder(_dragSrcId, file.id);
    });

    return tab;
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  function _switchTo(id) {
    var file = AppState.files.filter(function(f) { return f.id === id; })[0];
    if (!file || file.id === AppState.activeFileId) return;
    _activateSession(file);
    _render();
    EventBus.emit(Events.FILE_SWITCHED, { file: file });
  }

  function _closeTab(id) {
    if (AppState.files.length === 1) { if (UI) UI.toast('Cannot close last tab.', 'error'); return; }
    if (AppState.activeFileId === id) {
      var idx  = AppState.files.findIndex(function(f) { return f.id === id; });
      var next = AppState.files[idx + 1] || AppState.files[idx - 1];
      if (next) _switchTo(next.id);
    }
    _destroySession(id);
    AppState.files = AppState.files.filter(function(f) { return f.id !== id; });
    saveToStorage();
    EventBus.emit(Events.FILE_DELETED, { id: id });
    _render();
  }

  function _reorder(srcId, targetId) {
    var files     = AppState.files;
    var srcIdx    = files.findIndex(function(f) { return f.id === srcId; });
    var targetIdx = files.findIndex(function(f) { return f.id === targetId; });
    if (srcIdx === -1 || targetIdx === -1) return;
    var removed = files.splice(srcIdx, 1)[0];
    files.splice(targetIdx, 0, removed);
    saveToStorage(); _render();
  }

  function _updateDirtyDot(id, isDirty) {
    var tab = document.querySelector('.tab[data-id="' + id + '"]');
    if (!tab) return;
    var dot = tab.querySelector('.tab-dirty');
    if (isDirty && !dot) {
      var d = document.createElement('span');
      d.className = 'tab-dirty'; d.title = 'Unsaved'; d.textContent = '●';
      var close = tab.querySelector('.tab-close');
      if (close) tab.insertBefore(d, close); else tab.appendChild(d);
    } else if (!isDirty && dot) { dot.remove(); }
  }

  function _saveTabOrder() {
    try { localStorage.setItem('codex:tab-order', JSON.stringify(AppState.files.map(function(f) { return f.id; }))); } catch(e) {}
  }

  function _restoreTabOrder() {
    try {
      var order = JSON.parse(localStorage.getItem('codex:tab-order') || '[]');
      if (!order.length) return;
      var sorted = [];
      order.forEach(function(id) {
        var f = AppState.files.filter(function(x) { return x.id === id; })[0];
        if (f) sorted.push(f);
      });
      AppState.files.forEach(function(f) {
        if (!sorted.find(function(x) { return x.id === f.id; })) sorted.push(f);
      });
      AppState.files = sorted;
    } catch(e) {}
  }

  function _modeForFile(name) {
    var ext   = _ext(name);
    var modes = {
      js:'ace/mode/javascript', ts:'ace/mode/typescript', jsx:'ace/mode/jsx', tsx:'ace/mode/tsx',
      html:'ace/mode/html', css:'ace/mode/css', scss:'ace/mode/scss', json:'ace/mode/json',
      md:'ace/mode/markdown', py:'ace/mode/python', java:'ace/mode/java', c:'ace/mode/c_cpp',
      cpp:'ace/mode/c_cpp', rs:'ace/mode/rust', go:'ace/mode/golang', sh:'ace/mode/sh',
      xml:'ace/mode/xml', sql:'ace/mode/sql', php:'ace/mode/php', rb:'ace/mode/ruby', txt:'ace/mode/text',
    };
    return modes[ext] || 'ace/mode/text';
  }

  function _langLabel(ext) {
    var m = { js:'JavaScript', ts:'TypeScript', jsx:'JSX', tsx:'TSX', html:'HTML', css:'CSS',
              scss:'SCSS', json:'JSON', md:'Markdown', py:'Python', java:'Java', c:'C',
              cpp:'C++', rs:'Rust', go:'Go', sh:'Shell', txt:'Plain Text' };
    return m[ext] || 'Plain Text';
  }

  function _ext(name) { var p = (name||'').split('.'); return p.length > 1 ? p[p.length-1].toLowerCase() : ''; }
  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init: init, render: _render, switchTo: _switchTo, closeTab: _closeTab };

})();
