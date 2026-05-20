/**
 * git-panel.js — Local Version Control (Git-style)
 *
 * No backend needed. Tracks file snapshots in localStorage.
 * Shows M/A/D status, inline diff, commit history.
 *
 * Not real git — but same UX. Real git needs a server.
 */
var GitPanel = (function() {

  var STORAGE_KEY = 'codex:git';
  var _state = null; // { commits:[], staged:{} }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _loadState();
    // Register as a bottom panel
    if (typeof PanelSystem !== 'undefined') {
      PanelSystem.register({
        id:    'git',
        title: 'Source Control',
        icon:  '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3.5" r="1.5"/><circle cx="11" cy="12.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><path d="M5 5v4.5M5 9.5c0 1.1.9 2 2 2h1a2 2 0 0 0 2-2V6.5"/><circle cx="11" cy="5" r="1.5"/></svg>',
        render: _render,
        onShow: function(el) { _refresh(el); },
      });
    }
    // Listen for file changes to update status
    EventBus.on(Events.FILE_SWITCHED, function() { _refreshAll(); });
    EventBus.on(Events.FILE_CREATED,  function() { _refreshAll(); });
    EventBus.on(Events.FILE_DELETED,  function() { _refreshAll(); });
  }

  // ─── State ─────────────────────────────────────────────────────────────────

  function _loadState() {
    try {
      _state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || { commits:[], staged:{} };
    } catch(e) {
      _state = { commits:[], staged:{} };
    }
  }

  function _saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch(e) {}
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  /**
   * Returns 'M' | 'A' | 'D' | null for a file
   * Compares current content hash vs last committed hash
   */
  function getFileStatus(fileId) {
    var lastCommit = _state.commits[_state.commits.length - 1];
    var file = AppState.files.filter(function(f){ return f.id === fileId; })[0];
    if (!file) return null;

    if (!lastCommit) return 'A'; // no commits yet — all files are new

    var committed = lastCommit.snapshot[fileId];
    if (!committed) return 'A'; // new file since last commit

    var currentHash = _hash(file.content);
    if (committed.hash !== currentHash) return 'M'; // modified

    return null; // clean
  }

  function _getAllStatuses() {
    var result = [];
    var lastCommit = _state.commits[_state.commits.length - 1];

    AppState.files.forEach(function(file) {
      var status = getFileStatus(file.id);
      if (status) result.push({ file:file, status:status });
    });

    // Check deleted files
    if (lastCommit) {
      Object.keys(lastCommit.snapshot).forEach(function(id) {
        var stillExists = AppState.files.filter(function(f){ return f.id === id; })[0];
        if (!stillExists) {
          result.push({ file:{ id:id, name:lastCommit.snapshot[id].name }, status:'D' });
        }
      });
    }

    return result;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  function _render(container) {
    container.innerHTML = '<div id="git-panel-inner"></div>';
    _refresh(container);
  }

  function _refresh(container) {
    var inner = container.querySelector('#git-panel-inner') || container;
    var statuses = _getAllStatuses();
    var lastCommit = _state.commits[_state.commits.length - 1];
    var commitCount = _state.commits.length;

    var html = '<div class="git-panel">';

    // Header
    html += '<div class="git-header">';
    html += '<span class="git-branch">⎇ main · ' + commitCount + ' commit' + (commitCount !== 1 ? 's' : '') + '</span>';
    html += '<button class="btn-sm btn-primary-sm" id="git-btn-commit" style="font-size:10px;padding:3px 10px">Commit</button>';
    html += '</div>';

    // Changed files
    if (statuses.length === 0) {
      html += '<div class="git-clean"><span>✓</span> No changes — working tree clean</div>';
    } else {
      html += '<div class="git-section-title">Changes (' + statuses.length + ')</div>';
      statuses.forEach(function(item) {
        var color = item.status === 'A' ? '#3fb950' : item.status === 'M' ? '#cca700' : '#f48771';
        html += '<div class="git-file-row" data-id="' + item.file.id + '">' +
                '<span class="git-status-badge" style="color:' + color + '">' + item.status + '</span>' +
                '<span class="git-file-name">' + _esc(item.file.name) + '</span>' +
                '<button class="git-diff-btn tree-btn" data-id="' + item.file.id + '" title="View diff">±</button>' +
                '</div>';
      });
    }

    // Commit history
    if (_state.commits.length > 0) {
      html += '<div class="git-section-title" style="margin-top:8px">History</div>';
      var recent = _state.commits.slice().reverse().slice(0, 10);
      recent.forEach(function(commit) {
        var d = new Date(commit.timestamp);
        var ago = _timeAgo(d);
        html += '<div class="git-commit-row">' +
                '<span class="git-commit-hash">' + commit.id.slice(0,7) + '</span>' +
                '<span class="git-commit-msg">' + _esc(commit.message) + '</span>' +
                '<span class="git-commit-time">' + ago + '</span>' +
                '</div>';
      });
    }

    html += '</div>';
    inner.innerHTML = html;

    // Bind events
    inner.querySelector('#git-btn-commit') &&
      inner.querySelector('#git-btn-commit').addEventListener('click', promptCommit);

    inner.querySelectorAll('.git-diff-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _showDiff(btn.dataset.id, inner);
      });
    });

    inner.querySelectorAll('.git-file-row').forEach(function(row) {
      row.addEventListener('click', function(e) {
        if (e.target.closest('.git-diff-btn')) return;
        var file = AppState.files.filter(function(f){ return f.id === row.dataset.id; })[0];
        if (file) { AppState.activeFileId = file.id; if(Editor) Editor.loadFile(file); }
      });
    });
  }

  // ─── Diff view ─────────────────────────────────────────────────────────────

  function _showDiff(fileId, container) {
    var file = AppState.files.filter(function(f){ return f.id === fileId; })[0];
    if (!file) return;
    var lastCommit = _state.commits[_state.commits.length - 1];
    var committed  = lastCommit && lastCommit.snapshot[fileId] ? lastCommit.snapshot[fileId].content : '';
    var current    = file.content;
    var diff       = _computeDiff(committed, current);

    var overlay = document.createElement('div');
    overlay.className = 'git-diff-overlay';
    overlay.innerHTML =
      '<div class="git-diff-header">' +
      '<span>' + _esc(file.name) + ' — diff</span>' +
      '<button class="git-diff-close">×</button>' +
      '</div>' +
      '<pre class="git-diff-body">' + diff + '</pre>';
    container.appendChild(overlay);
    overlay.querySelector('.git-diff-close').onclick = function() { overlay.remove(); };
  }

  function _computeDiff(oldText, newText) {
    var oldLines = (oldText || '').split('\n');
    var newLines = (newText || '').split('\n');
    var result   = [];
    var maxLen   = Math.max(oldLines.length, newLines.length);

    for (var i = 0; i < maxLen; i++) {
      var o = oldLines[i];
      var n = newLines[i];
      if (o === undefined) {
        result.push('<span class="diff-add">+ ' + _esc(n) + '</span>');
      } else if (n === undefined) {
        result.push('<span class="diff-del">- ' + _esc(o) + '</span>');
      } else if (o !== n) {
        result.push('<span class="diff-del">- ' + _esc(o) + '</span>');
        result.push('<span class="diff-add">+ ' + _esc(n) + '</span>');
      } else {
        result.push('<span class="diff-ctx">  ' + _esc(o) + '</span>');
      }
    }
    return result.join('\n');
  }

  // ─── Commit ────────────────────────────────────────────────────────────────

  function promptCommit() {
    var msg = prompt('Commit message:');
    if (!msg || !msg.trim()) return;
    _commit(msg.trim());
  }

  function _commit(message) {
    var snapshot = {};
    AppState.files.forEach(function(file) {
      snapshot[file.id] = { name:file.name, hash:_hash(file.content), content:file.content };
    });
    var commit = {
      id:        _randomId(),
      message:   message,
      timestamp: Date.now(),
      snapshot:  snapshot,
    };
    _state.commits.push(commit);
    _saveState();
    if (UI) UI.toast('Committed: ' + message, 'success');
    _refreshAll();
  }

  function openPanel() {
    if (PanelSystem) PanelSystem.show('git');
  }

  function _refreshAll() {
    var container = document.querySelector('[data-panel="git"]');
    if (container) _refresh(container);
    // Refresh folder tree to update status badges
    if (FolderTree) FolderTree.render(document.getElementById('file-list'));
  }

  // ─── Utils ─────────────────────────────────────────────────────────────────

  function _hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
    return h.toString(36);
  }

  function _randomId() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function _timeAgo(date) {
    var sec = Math.floor((Date.now() - date) / 1000);
    if (sec < 60)   return 'just now';
    if (sec < 3600) return Math.floor(sec/60) + 'm ago';
    if (sec < 86400)return Math.floor(sec/3600) + 'h ago';
    return Math.floor(sec/86400) + 'd ago';
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init:init, getFileStatus:getFileStatus, promptCommit:promptCommit, openPanel:openPanel };
})();
