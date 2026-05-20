/**
 * file-manager.js — Real File System Access (like aCode)
 * Uses the File System Access API to open real folders.
 * User can read, write, update files directly from their file manager.
 * Works on Chrome/Edge on Android + Desktop.
 */
var FileManager = (function() {

  var _dirHandle  = null;  // current directory handle
  var _fileHandles = {};   // fileId → FileSystemFileHandle

  function init() {
    // Register command
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({
        id:       'open-folder',
        label:    'Open Folder from File Manager',
        icon:     '<svg viewBox="0 0 24 24" fill="none" stroke="#dcb67a" stroke-width="1.6" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M2 10h20"/></svg>',
        category: 'File',
        action:   openFolder,
      });
    }
  }

  // ─── Open Folder ──────────────────────────────────────────────────────────

  async function openFolder() {
    if (!window.showDirectoryPicker) {
      if (UI) UI.toast('File System Access API not supported in this browser. Use Chrome.', 'error');
      return;
    }
    try {
      _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await _loadDirectory(_dirHandle, '');
      if (UI) UI.toast('Folder opened: ' + _dirHandle.name, 'success');
    } catch(e) {
      if (e.name !== 'AbortError') {
        if (UI) UI.toast('Could not open folder: ' + e.message, 'error');
      }
    }
  }

  // ─── Load directory recursively ───────────────────────────────────────────

  async function _loadDirectory(dirHandle, basePath) {
    var entries = [];
    for await (var entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        if (_shouldInclude(entry.name)) {
          entries.push({ kind: 'file', handle: entry, name: entry.name, path: basePath + entry.name });
        }
      } else if (entry.kind === 'directory' && !_shouldIgnoreDir(entry.name)) {
        entries.push({ kind: 'directory', handle: entry, name: entry.name, path: basePath + entry.name + '/' });
      }
    }

    // Load files
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.kind === 'file') {
        try {
          var file    = await e.handle.getFile();
          var content = await file.text();
          var fileObj = createFileObject(e.name, content);
          fileObj.path         = e.path;
          fileObj._diskHandle  = e.handle;
          fileObj._isDisk      = true;
          _fileHandles[fileObj.id] = e.handle;
          // Replace if already open
          var existing = AppState.files.filter(function(f) { return f.path === e.path; })[0];
          if (existing) {
            existing.content    = content;
            existing._diskHandle= e.handle;
            existing._isDisk    = true;
            _fileHandles[existing.id] = e.handle;
          } else {
            AppState.files.push(fileObj);
          }
        } catch(err) {
          console.warn('[FM] Could not read', e.name, err);
        }
      } else if (e.kind === 'directory') {
        // Recurse (limit depth to 3 for performance)
        if ((basePath.match(/\//g) || []).length < 3) {
          await _loadDirectory(e.handle, e.path);
        }
      }
    }

    // Activate first file
    if (AppState.files.length > 0 && !AppState.activeFileId) {
      AppState.activeFileId = AppState.files[0].id;
    }

    saveToStorage();
    EventBus.emit(Events.FILE_CREATED, {});
    if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
  }

  // ─── Save file to disk ────────────────────────────────────────────────────

  async function saveActive() {
    var file   = getActiveFile();
    if (!file) return;
    var handle = file._diskHandle || _fileHandles[file.id];
    if (!handle) {
      // Not a disk file — offer Save As
      await saveAs(file);
      return;
    }
    try {
      var writable = await handle.createWritable();
      await writable.write(file.content);
      await writable.close();
      if (UI) UI.toast('Saved: ' + file.name, 'success');
      _showSaveIndicator();
    } catch(e) {
      if (UI) UI.toast('Save failed: ' + e.message, 'error');
    }
  }

  async function saveAs(file) {
    if (!window.showSaveFilePicker) {
      if (UI) UI.toast('Save As not supported. Use Chrome.', 'error');
      return;
    }
    try {
      var ext    = (file.name.split('.').pop() || 'txt').toLowerCase();
      var handle = await window.showSaveFilePicker({
        suggestedName: file.name,
        types: [{ description: 'Code file', accept: { 'text/plain': ['.' + ext] } }],
      });
      var writable = await handle.createWritable();
      await writable.write(file.content);
      await writable.close();
      file._diskHandle = handle;
      _fileHandles[file.id] = handle;
      if (UI) UI.toast('Saved as: ' + file.name, 'success');
    } catch(e) {
      if (e.name !== 'AbortError') {
        if (UI) UI.toast('Save As failed: ' + e.message, 'error');
      }
    }
  }

  // ─── Auto-save indicator ──────────────────────────────────────────────────

  function _showSaveIndicator() {
    var el = document.getElementById('save-indicator');
    if (el) {
      el.textContent = 'Saved';
      el.style.opacity = '1';
      setTimeout(function() { el.style.opacity = '0'; }, 1500);
    }
  }

  // ─── Filter helpers ───────────────────────────────────────────────────────

  function _shouldInclude(name) {
    var exts = ['.js','.ts','.jsx','.tsx','.html','.css','.scss','.json','.md','.txt','.py','.java','.c','.cpp','.rs','.go','.sh','.xml','.sql','.php','.rb','.vue','.svelte','.env','.gitignore','.yaml','.yml','.toml','.ini','.cfg'];
    var lower = name.toLowerCase();
    return exts.some(function(e) { return lower.endsWith(e); });
  }

  function _shouldIgnoreDir(name) {
    return ['node_modules','.git','.svn','__pycache__','.next','.nuxt','dist','build','.cache','vendor'].indexOf(name) !== -1;
  }

  // ─── Bind Ctrl+S ─────────────────────────────────────────────────────────

  function bindSave() {
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActive();
      }
    });
  }

  return { init: init, openFolder: openFolder, saveActive: saveActive, saveAs: saveAs, bindSave: bindSave };

})();
