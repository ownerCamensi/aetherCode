/**
 * export-zip.js — Export project as ZIP + Import ZIP
 * Uses JSZip from CDN. Both import and export work fully.
 */
var ExportZip = (function() {

  var _jszip = null;

  function init() {
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'export-zip',  label:'File: Export Project as ZIP',   category:'File', action: exportZip });
      CommandPalette.register({ id:'import-zip',  label:'File: Import ZIP Project',       category:'File', action: importZip });
    }
  }

  // ─── Load JSZip ───────────────────────────────────────────────────────────

  function _loadJSZip(cb) {
    if (_jszip) { cb(null); return; }
    if (window.JSZip) { _jszip = window.JSZip; cb(null); return; }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload  = function() { _jszip = window.JSZip; cb(null); };
    s.onerror = function() { cb('Failed to load JSZip. Check internet.'); };
    document.head.appendChild(s);
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  function exportZip() {
    var validFiles = AppState.files.filter(function(f) { return f.name !== '.gitkeep'; });
    if (!validFiles.length) { if (UI) UI.toast('No files to export.', 'error'); return; }

    _loadJSZip(function(err) {
      if (err) { if (UI) UI.toast(err, 'error'); return; }
      _buildZip(validFiles);
    });
  }

  function _buildZip(files) {
    if (UI) UI.toast('Building ZIP…', 'info');
    var zip = new _jszip();

    files.forEach(function(file) {
      // Use path if available (preserves folder structure)
      var filePath = file.path || file.name;
      // Handle base64 image files
      if (file.isImage && file.content && file.content.startsWith('data:')) {
        var b64 = file.content.split(',')[1];
        if (b64) zip.file(filePath, b64, { base64: true });
      } else {
        zip.file(filePath, file.content || '');
      }
    });

    var projectName = _getProjectName();

    zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }).then(function(blob) {
      var filename = projectName + '.zip';
      var url = URL.createObjectURL(blob);
      var a   = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
      if (UI) UI.toast('Downloaded: ' + filename + ' (' + files.length + ' files)', 'success');
      // Emit to output
      if (typeof EventBus !== 'undefined') EventBus.emit('output:log', { level:'success', message:'Exported ' + files.length + ' files as ' + filename });
    }).catch(function(e) {
      if (UI) UI.toast('ZIP failed: ' + e.message, 'error');
    });
  }

  // ─── Import ───────────────────────────────────────────────────────────────

  function importZip() {
    _loadJSZip(function(err) {
      if (err) { if (UI) UI.toast(err, 'error'); return; }
      var input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.zip';
      input.addEventListener('change', function() {
        var file = input.files[0];
        if (!file) return;
        _readZip(file);
      });
      input.click();
    });
  }

  function _readZip(zipFile) {
    if (UI) UI.toast('Extracting ' + zipFile.name + '…', 'info');
    var reader = new FileReader();
    reader.onload = function(e) {
      _jszip.loadAsync(e.target.result).then(function(zip) {
        _extractZip(zip, zipFile.name.replace('.zip',''));
      }).catch(function(e) {
        if (UI) UI.toast('Invalid ZIP: ' + e.message, 'error');
      });
    };
    reader.readAsArrayBuffer(zipFile);
  }

  function _extractZip(zip, projectName) {
    var IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','svg','ico','bmp'];
    var promises   = [];
    var newFiles   = [];

    zip.forEach(function(relativePath, entry) {
      if (entry.dir) return;
      // Skip macOS metadata
      if (relativePath.startsWith('__MACOSX') || relativePath.includes('.DS_Store')) return;

      var ext = relativePath.split('.').pop().toLowerCase();
      var isImg = IMAGE_EXTS.indexOf(ext) !== -1;

      var promise = entry.async(isImg ? 'base64' : 'string').then(function(content) {
        var parts    = relativePath.split('/');
        var fileName = parts[parts.length - 1];
        var file     = createFileObject(fileName, isImg ? 'data:image/' + ext + ';base64,' + content : content);
        file.path    = relativePath;
        file.isImage = isImg;
        newFiles.push(file);
      });
      promises.push(promise);
    });

    Promise.all(promises).then(function() {
      if (newFiles.length === 0) { if (UI) UI.toast('ZIP is empty.', 'warn'); return; }

      // Ask user: replace or merge?
      var overlay = document.getElementById('modal-overlay');
      var modal   = document.getElementById('modal');
      if (!overlay || !modal) { _applyFiles(newFiles, false); return; }

      modal.style.width = 'min(360px,94vw)';
      modal.innerHTML =
        '<div class="modal-header"><span class="modal-title">Import ZIP: ' + _esc(projectName) + '</span>' +
        '<button id="modal-close-btn" class="modal-close">' + (typeof Icons!=='undefined'?Icons.getUI('close'):'×') + '</button></div>' +
        '<div class="modal-body" style="padding:16px">' +
          '<p style="margin-bottom:12px;color:var(--text);font-size:13px">Found <strong>' + newFiles.length + ' files</strong> in this ZIP.</p>' +
          '<p style="color:var(--text-dim);font-size:12px">How do you want to import?</p>' +
        '</div>' +
        '<div class="modal-footer">' +
          '<button id="modal-cancel" class="btn-sm">Cancel</button>' +
          '<button id="zip-merge" class="btn-sm">Merge</button>' +
          '<button id="zip-replace" class="btn-sm btn-primary-sm">Replace All</button>' +
        '</div>';
      overlay.classList.remove('hidden');
      modal.querySelector('#zip-replace').onclick = function() { overlay.classList.add('hidden'); _applyFiles(newFiles, false); };
      modal.querySelector('#zip-merge').onclick   = function() { overlay.classList.add('hidden'); _applyFiles(newFiles, true);  };
      modal.querySelector('#modal-cancel').onclick = function() { overlay.classList.add('hidden'); };
      modal.querySelector('#modal-close-btn').onclick = function() { overlay.classList.add('hidden'); };
    });
  }

  function _applyFiles(newFiles, merge) {
    if (!merge) {
      AppState.files = newFiles;
    } else {
      // Merge: update existing by path, add new ones
      newFiles.forEach(function(nf) {
        var existing = AppState.files.filter(function(f){ return (f.path||f.name)===(nf.path||nf.name); })[0];
        if (existing) { existing.content=nf.content; existing.modifiedAt=Date.now(); }
        else AppState.files.push(nf);
      });
    }
    AppState.activeFileId = AppState.files[0].id;
    saveToStorage();
    if (Editor) Editor.loadFile(AppState.files[0]);
    if (typeof FolderTree!=='undefined') FolderTree.render(document.getElementById('file-list'));
    if (typeof TabManager!=='undefined') TabManager.render();
    EventBus.emit(Events.APP_READY, {});
    if (UI) UI.toast('Imported ' + newFiles.length + ' files!', 'success');
  }

  function _getProjectName() {
    var html = AppState.files.filter(function(f){ return f.name.endsWith('.html'); })[0];
    if (html) return html.name.replace('.html','');
    // Try to get project folder name from paths
    var paths = AppState.files.filter(function(f){ return f.path&&f.path.indexOf('/')!==-1; });
    if (paths.length) return paths[0].path.split('/')[0];
    return 'codex-project';
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, exportZip, importZip };
})();
