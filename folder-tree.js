/**
 * folder-tree.js — Unlimited nested folder tree (VSCode style)
 * Fixed: folders can contain infinite sub-folders
 * Fixed: in-place inline rename editing
 * Fixed: correct path building for nested files
 */
var FolderTree = (function() {

  var _collapsed = {}; // path → bool
  var _dragId    = null;

  function init() {
    _loadCollapsed();
  }

  // ─── Build tree from flat file list ───────────────────────────────────────

  function _buildTree(files) {
    var root = { type:'root', children:{}, files:[] };
    files.forEach(function(file) {
      var rawPath = (file.path || file.name).replace(/\\/g, '/');
      var parts   = rawPath.split('/').filter(Boolean);
      if (parts.length <= 1) {
        root.files.push(file);
      } else {
        var node = root;
        for (var i = 0; i < parts.length - 1; i++) {
          var seg      = parts[i];
          var fullPath = parts.slice(0, i + 1).join('/');
          if (!node.children[seg]) {
            node.children[seg] = { type:'folder', name:seg, fullPath:fullPath, children:{}, files:[] };
          }
          node = node.children[seg];
        }
        node.files.push(file);
      }
    });
    return root;
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  function render(container) {
    if (!container) return;
    var tree = _buildTree(AppState.files);
    var html = _renderNode(tree, 0);
    container.innerHTML = html || '<p class="empty-hint">No files yet.<br>Click + to create one.</p>';
    _bindEvents(container);
  }

  function _renderNode(node, depth) {
    var html = '';
    var pad  = 8 + depth * 12;

    // Folders first, sorted
    Object.keys(node.children).sort().forEach(function(name) {
      var child     = node.children[name];
      var collapsed = !!_collapsed[child.fullPath];
      var arrowCls  = collapsed ? '' : 'open';

      html += '<div class="tree-folder-wrap">' +
              '<div class="tree-row tree-folder-row" style="padding-left:' + pad + 'px" data-folder="' + _esc(child.fullPath) + '">' +
              '<span class="tree-arrow ' + arrowCls + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>' +
              '</span>' +
              '<span class="tree-icon">' + (collapsed ? _folderIcon(false) : _folderIcon(true)) + '</span>' +
              '<span class="tree-label">' + _esc(name) + '</span>' +
              '<span class="tree-row-actions">' +
                '<button class="tree-btn" data-action="new-file-in" data-path="' + _esc(child.fullPath) + '" title="New File">'+
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>' +
                '</button>' +
                '<button class="tree-btn" data-action="new-folder-in" data-path="' + _esc(child.fullPath) + '" title="New Subfolder">'+
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>' +
                '</button>' +
                '<button class="tree-btn" data-action="rename-folder" data-path="' + _esc(child.fullPath) + '" data-name="' + _esc(name) + '" title="Rename">'+
                  Icons.getUI('rename') +
                '</button>' +
                '<button class="tree-btn" data-action="delete-folder" data-path="' + _esc(child.fullPath) + '" title="Delete folder">'+
                  Icons.getUI('trash') +
                '</button>' +
              '</span>' +
              '</div>';

      if (!collapsed) {
        var childHtml = _renderNode(child, depth + 1);
        html += '<div class="tree-children">' + (childHtml || '<div style="padding:4px ' + (pad+24) + 'px;font-size:11px;color:var(--text-dim)">Empty folder</div>') + '</div>';
      }
      html += '</div>';
    });

    // Files
    node.files.forEach(function(file) {
      if (file.name === '.gitkeep') return; // hide placeholder
      var ext    = _ext(file.name);
      var icon   = Icons.getFileIcon(ext, typeof PluginManager !== 'undefined' ? PluginManager.getFileIconSVG(ext) : null);
      var active = file.id === AppState.activeFileId ? ' active' : '';
      var status = typeof GitPanel !== 'undefined' ? GitPanel.getFileStatus(file.id) : null;
      var badge  = status ? '<span class="tree-git-badge git-' + status + '">' + status + '</span>' : '';

      html += '<div class="tree-row tree-file' + active + '" data-id="' + file.id + '" style="padding-left:' + (pad + 14) + 'px" draggable="true">' +
              '<span class="tree-icon file-icon">' + icon + '</span>' +
              '<span class="tree-label">' + _esc(file.name) + '</span>' +
              badge +
              '<span class="tree-row-actions">' +
                '<button class="tree-btn file-split-btn" data-id="' + file.id + '" data-name="' + _esc(file.name) + '" title="Open in Split Screen">⊞</button>' +
                '<button class="tree-btn file-copy-btn" data-id="' + file.id + '" title="Copy file">⧉</button>' +
                '<button class="tree-btn file-rename-btn" data-id="' + file.id + '" title="Rename">' + Icons.getUI('rename') + '</button>' +
                '<button class="tree-btn file-delete-btn" data-id="' + file.id + '" title="Delete">'  + Icons.getUI('trash')  + '</button>' +
              '</span>' +
              '</div>';
    });

    return html;
  }

  function _folderIcon(open) {
    if (open) return '<svg viewBox="0 0 32 32"><path d="M3 8a2 2 0 0 1 2-2h8l2 3h12a2 2 0 0 1 2 2v1H3V8z" fill="#dcb67a"/><path d="M3 13h26l-3 13H5L3 13z" fill="#e8c988"/></svg>';
    return '<svg viewBox="0 0 32 32"><path d="M3 8a2 2 0 0 1 2-2h8l2 3h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" fill="#dcb67a"/></svg>';
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  function _bindEvents(container) {
    // Toggle folder collapse
    container.querySelectorAll('.tree-folder-row').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.tree-btn')) return;
        var path = el.dataset.folder;
        _collapsed[path] = !_collapsed[path];
        _saveCollapsed();
        render(container);
      });
    });

    // Switch to file
    container.querySelectorAll('.tree-file').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.tree-btn')) return;
        _switchFile(el.dataset.id);
      });
    });

    // Action buttons
    container.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = btn.dataset.action;
        var path   = btn.dataset.path;
        var name   = btn.dataset.name;

        if (action === 'new-file-in')    _promptNewFile(path);
        if (action === 'new-folder-in')  _promptNewFolder(path);
        if (action === 'rename-folder')  _promptRenameFolder(path, name, container);
        if (action === 'delete-folder')  _deleteFolder(path, container);
      });
    });

    // File copy
    container.querySelectorAll('.file-copy-btn').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof PathIntelligence !== 'undefined') PathIntelligence.copyFile(b.dataset.id);
      });
    });

    // File split button
    container.querySelectorAll('.file-split-btn').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof SplitScreen !== 'undefined') {
          if (!SplitScreen.isEnabled()) SplitScreen.toggle(true);
          if (UI) UI.toast('Split screen opened. Select files in each pane.', 'info');
          PanelSystem && PanelSystem.show && PanelSystem.show('output'); // ensure workspace visible
        }
      });
    });

    // File rename/delete
    container.querySelectorAll('.file-rename-btn').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); _promptRenameFile(b.dataset.id, container); });
    });
    container.querySelectorAll('.file-delete-btn').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); _deleteFile(b.dataset.id, container); });
    });
  }

  // ─── File/Folder Actions ─────────────────────────────────────────────────

  function _switchFile(id) {
    var file = AppState.files.filter(function(f) { return f.id === id; })[0];
    if (!file) return;
    AppState.activeFileId = id;
    saveToStorage();
    if (Editor) Editor.loadFile(file);
    EventBus.emit(Events.FILE_SWITCHED, { file: file });
  }

  function _promptNewFile(folderPath) {
    _showInput('New File', 'filename.js', function(name) {
      if (!name) return;
      var file  = createFileObject(name, '');
      file.path = (folderPath ? folderPath + '/' : '') + name;
      AppState.files.push(file);
      AppState.activeFileId = file.id;
      if (Editor) Editor.loadFile(file);
      saveToStorage();
      EventBus.emit(Events.FILE_CREATED, { file: file });
    });
  }

  function _promptNewFolder(parentPath) {
    _showInput('New Folder', 'folder-name', function(name) {
      if (!name) return;
      var fullPath = (parentPath ? parentPath + '/' : '') + name;
      // Create placeholder file
      var file  = createFileObject('.gitkeep', '');
      file.path = fullPath + '/.gitkeep';
      AppState.files.push(file);
      _collapsed[fullPath] = false; // auto-open new folder
      saveToStorage();
      EventBus.emit(Events.FILE_CREATED, { file: file });
    });
  }

  function promptNewFolder() { _promptNewFolder(''); }

  function _promptRenameFile(id, container) {
    var file = AppState.files.filter(function(f) { return f.id === id; })[0];
    if (!file) return;
    _showInput('Rename', file.name, function(name) {
      if (!name) return;
      if (file.path) {
        var parts = file.path.split('/');
        parts[parts.length - 1] = name;
        file.path = parts.join('/');
      }
      file.name = name;
      saveToStorage();
      EventBus.emit(Events.FILE_RENAMED, { file: file });
    });
  }

  function _promptRenameFolder(path, oldName, container) {
    _showInput('Rename Folder', oldName, function(newName) {
      if (!newName || newName === oldName) return;
      var parentPath = path.split('/').slice(0, -1).join('/');
      var newPath    = (parentPath ? parentPath + '/' : '') + newName;
      // Rename all files under this folder
      AppState.files.forEach(function(f) {
        if (f.path && (f.path.startsWith(path + '/') || f.path === path)) {
          f.path = f.path.replace(path, newPath);
        }
      });
      // Update collapse state
      if (_collapsed[path] !== undefined) {
        _collapsed[newPath] = _collapsed[path];
        delete _collapsed[path];
      }
      saveToStorage();
      _saveCollapsed();
      EventBus.emit(Events.UI_REFRESH, {});
    });
  }

  function _deleteFolder(path, container) {
    if (!confirm('Delete folder "' + path.split('/').pop() + '" and all its contents?')) return;
    AppState.files = AppState.files.filter(function(f) {
      return !(f.path && (f.path.startsWith(path + '/') || f.path === path + '/.gitkeep'));
    });
    delete _collapsed[path];
    saveToStorage();
    _saveCollapsed();
    EventBus.emit(Events.FILE_DELETED, { id: null });
  }

  function _deleteFile(id, container) {
    if (AppState.files.length === 1) { if (UI) UI.toast('Cannot delete last file.', 'error'); return; }
    AppState.files = AppState.files.filter(function(f) { return f.id !== id; });
    if (AppState.activeFileId === id) {
      AppState.activeFileId = AppState.files[0].id;
      if (Editor) Editor.loadFile(AppState.files[0]);
    }
    saveToStorage();
    EventBus.emit(Events.FILE_DELETED, { id: id });
  }

  // ─── Simple input prompt ─────────────────────────────────────────────────

  function _showInput(title, placeholder, cb) {
    var overlay = document.getElementById('modal-overlay');
    var modal   = document.getElementById('modal');
    if (!overlay || !modal) { var v = prompt(title); if (v) cb(v.trim()); return; }
    modal.style.width = '';
    modal.innerHTML =
      '<div class="modal-header"><span class="modal-title">' + title + '</span>' +
      '<button id="modal-close-btn" class="modal-close">' + Icons.getUI('close') + '</button></div>' +
      '<div class="modal-body"><input id="modal-input" placeholder="' + _esc(placeholder) + '" autocomplete="off"></div>' +
      '<div class="modal-footer"><button id="modal-cancel" class="btn-sm">Cancel</button>' +
      '<button id="modal-confirm" class="btn-sm btn-primary-sm">OK</button></div>';
    overlay.classList.remove('hidden');
    var inp = modal.querySelector('#modal-input');
    function confirm() { overlay.classList.add('hidden'); cb((inp.value || '').trim()); }
    function cancel()  { overlay.classList.add('hidden'); }
    modal.querySelector('#modal-confirm').onclick   = confirm;
    modal.querySelector('#modal-cancel').onclick    = cancel;
    modal.querySelector('#modal-close-btn').onclick = cancel;
    if (inp) { inp.focus(); inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') cancel(); }); }
  }

  // ─── Persistence ─────────────────────────────────────────────────────────

  function _loadCollapsed() { try { _collapsed = JSON.parse(localStorage.getItem('codex:tree:collapsed') || '{}'); } catch(e) { _collapsed = {}; } }
  function _saveCollapsed() { try { localStorage.setItem('codex:tree:collapsed', JSON.stringify(_collapsed)); } catch(e) {} }
  function _ext(name) { var p = (name||'').split('.'); return p.length > 1 ? p[p.length-1].toLowerCase() : ''; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  return { init, render, promptNewFolder };
})();
