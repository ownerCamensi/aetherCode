/**
 * path-intelligence.js v2 — Fixed virtual FS path resolver
 * Correctly resolves ./relative, /absolute, ../parent paths
 * Copy/paste/move files between folders
 */
var PathIntelligence = (function() {

  var _clipboard = null;

  function init() {
    // Scan on file switch
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      if (data && data.file) setTimeout(function(){ scanFile(data.file); }, 600);
    });
    // Also scan on save
    EventBus.on('file:saved', function(data) {
      if (data && data.file) scanFile(data.file);
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'path-scan-all', label:'Path: Scan All Files for Broken Paths', category:'Code', action: scanAll });
    }
  }

  // ── Core resolver ────────────────────────────────────────────────────
  function resolvePath(fromFilePath, importPath) {
    if (!importPath) return null;
    // External — pass through
    if (/^(https?:\/\/|\/\/|data:)/.test(importPath)) return importPath;
    // Absolute from project root
    if (importPath.startsWith('/')) {
      return _normalize(importPath.slice(1));
    }
    // Relative
    var dir = fromFilePath ? fromFilePath.split('/').slice(0, -1).join('/') : '';
    return _normalize(dir ? dir + '/' + importPath : importPath);
  }

  function _normalize(p) {
    var parts = p.split('/');
    var out   = [];
    parts.forEach(function(seg) {
      if (seg === '.' || seg === '') return;
      if (seg === '..') { if (out.length) out.pop(); }
      else out.push(seg);
    });
    return out.join('/');
  }

  // ── Find file by resolved path ────────────────────────────────────────
  function findFile(resolvedPath) {
    if (!resolvedPath) return null;
    var norm = resolvedPath.replace(/^\/+/, '');
    return AppState.files.filter(function(f) {
      var fp = (f.path || f.name).replace(/^\/+/, '');
      return fp === norm
        || f.name === norm
        || fp.endsWith('/' + norm)
        || norm.endsWith('/' + f.name)
        || f.name === norm.split('/').pop();
    })[0] || null;
  }

  // ── Scan single file ──────────────────────────────────────────────────
  function scanFile(file) {
    if (!file) return;
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['js','ts','jsx','tsx','html','css','mjs'].indexOf(ext) === -1) return;
    var broken = _findBroken(file);
    _showErrorBadge(broken, file.name);
    return broken;
  }

  function _findBroken(file) {
    var broken  = [];
    var filePath = file.path || file.name;
    var lines    = (file.content || '').split('\n');

    lines.forEach(function(line, i) {
      // JS imports
      var m = line.match(/(?:import|require)\s*(?:\(?\s*['"`])([^'"`\n]+)['"`]/);
      if (m && /^\./.test(m[1])) {
        var resolved = resolvePath(filePath, m[1]);
        var found    = findFile(resolved);
        if (!found && _hasExtension(m[1])) {
          broken.push({ path: m[1], line: i + 1, resolved: resolved, type: 'import' });
        }
      }
      // HTML src/href (skip CDN)
      var hm = line.match(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/);
      if (hm && !/^(https?:|\/\/|data:|#|mailto:)/.test(hm[1])) {
        var resolved2 = resolvePath(filePath, hm[1]);
        if (!findFile(resolved2) && _hasExtension(hm[1])) {
          broken.push({ path: hm[1], line: i + 1, resolved: resolved2, type: 'asset' });
        }
      }
    });
    return broken;
  }

  function _hasExtension(p) {
    return /\.[a-z0-9]{1,6}$/i.test(p.split('?')[0].split('#')[0]);
  }

  function _showErrorBadge(broken, filename) {
    var badge = document.getElementById('path-error-badge');
    if (broken.length === 0) { if (badge) badge.remove(); return; }
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'path-error-badge';
      badge.className = 'path-error-badge';
      var topbar = document.getElementById('topbar') || document.querySelector('.topbar');
      if (topbar) topbar.appendChild(badge);
    }
    badge.innerHTML =
      '<span class="path-err-icon">⚠</span>' +
      '<span>' + broken.length + ' broken path' + (broken.length > 1 ? 's' : '') + '</span>';
    badge.title = broken.map(function(b) { return 'Line ' + b.line + ': ' + b.path; }).join('\n');
    badge.onclick = function() { _showBrokenDialog(broken, filename); };
  }

  function _showBrokenDialog(broken, filename) {
    if (UI) UI.toast(
      '⚠ Broken paths in ' + filename + ':\n' +
      broken.slice(0, 5).map(function(b) { return '  Line ' + b.line + ': ' + b.path; }).join('\n'),
      'warn'
    );
  }

  // ── Scan all files ────────────────────────────────────────────────────
  function scanAll() {
    var total = 0;
    AppState.files.forEach(function(f) {
      var broken = _findBroken(f);
      total += broken.length;
    });
    if (UI) UI.toast(
      total > 0 ? '⚠ ' + total + ' broken paths found — open files to see details' : '✅ All paths resolved OK',
      total > 0 ? 'warn' : 'success'
    );
  }

  // ── Copy / Paste / Move ───────────────────────────────────────────────
  function copyFile(fileId) {
    var f = AppState.files.filter(function(f) { return f.id === fileId; })[0];
    if (!f) return;
    _clipboard = { content: f.content, name: f.name, path: f.path };
    if (UI) UI.toast('Copied: ' + f.name, 'info');
  }

  function pasteFile(targetFolder) {
    if (!_clipboard) { if (UI) UI.toast('Nothing to paste', 'warn'); return; }
    var parts   = _clipboard.name.split('.');
    var base    = parts.slice(0, -1).join('.') || parts[0];
    var ext     = parts.length > 1 ? '.' + parts[parts.length - 1] : '';
    var newName = base + '_copy' + ext;
    var newPath = (targetFolder ? targetFolder + '/' : '') + newName;
    var f = createFileObject(newName, _clipboard.content);
    f.path = newPath;
    AppState.files.push(f);
    saveToStorage();
    if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
    if (UI) UI.toast('Pasted: ' + newName, 'success');
  }

  function moveFile(fileId, newFolder) {
    var f = AppState.files.filter(function(f) { return f.id === fileId; })[0];
    if (!f) return;
    f.path = (newFolder ? newFolder + '/' : '') + f.name;
    saveToStorage();
    if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
    if (UI) UI.toast('Moved: ' + f.name, 'success');
  }

  function getDependencyMap() {
    var map = {};
    AppState.files.forEach(function(f) {
      var deps = [];
      (f.content || '').split('\n').forEach(function(line) {
        var m = line.match(/(?:import|require)\s*(?:\(?\s*['"`])([^'"`\n]+)['"`]/);
        if (m && /^\./.test(m[1])) deps.push(resolvePath(f.path || f.name, m[1]));
      });
      map[f.path || f.name] = deps;
    });
    return map;
  }

  return { init, resolvePath, findFile, scanFile, scanAll, getDependencyMap, copyFile, pasteFile, moveFile };
})();
