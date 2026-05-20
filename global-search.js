/**
 * global-search.js — Search across ALL files with regex support
 */
var GlobalSearch = (function() {

  var _panelEl = null;
  var _results = [];
  var _debounceTimer = null;

  function init() {
    PanelSystem.register({
      id: 'global-search', title: 'Search',
      icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="14" y1="14" x2="10.5" y2="10.5"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; setTimeout(function(){ var i=el.querySelector('#gs-input'); if(i) i.focus(); }, 100); },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'gs-open', label:'Search: Search All Files', category:'Search', action: function(){ PanelSystem.show('global-search'); } });
    }

    // Ctrl+Shift+F
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); PanelSystem.show('global-search'); }
    });
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:8px;border-bottom:1px solid #1a1a1a;flex-shrink:0">',
          '<input id="gs-input" placeholder="Search all files… (Ctrl+Shift+F)" style="width:100%;background:#1a1a1a;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:13px;padding:6px 10px;font-family:var(--font-ui)">',
          '<div style="display:flex;gap:8px;margin-top:6px;align-items:center">',
            '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);cursor:pointer"><input type="checkbox" id="gs-regex" style="accent-color:var(--accent)"> Regex</label>',
            '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);cursor:pointer"><input type="checkbox" id="gs-case" style="accent-color:var(--accent)"> Aa</label>',
            '<label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);cursor:pointer"><input type="checkbox" id="gs-word" style="accent-color:var(--accent)"> \\b</label>',
            '<span id="gs-count" style="font-size:10px;color:var(--text-dim);margin-left:auto"></span>',
          '</div>',
          '<div style="display:flex;gap:4px;margin-top:6px">',
            '<input id="gs-replace" placeholder="Replace with…" style="flex:1;background:#1a1a1a;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:12px;padding:4px 8px;font-family:var(--font-ui)">',
            '<button id="gs-replace-all" class="btn-sm" style="font-size:11px;padding:3px 8px;white-space:nowrap">Replace All</button>',
          '</div>',
        '</div>',
        '<div id="gs-results" style="flex:1;overflow-y:auto"></div>',
      '</div>',
    ].join('');

    var input    = container.querySelector('#gs-input');
    var regexCb  = container.querySelector('#gs-regex');
    var caseCb   = container.querySelector('#gs-case');
    var wordCb   = container.querySelector('#gs-word');
    var replaceI = container.querySelector('#gs-replace');
    var replaceBtn = container.querySelector('#gs-replace-all');

    function doSearch() {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(function() {
        _search(input.value, { regex: regexCb.checked, caseSensitive: caseCb.checked, wholeWord: wordCb.checked });
      }, 250);
    }

    input.addEventListener('input', doSearch);
    regexCb.addEventListener('change', doSearch);
    caseCb.addEventListener('change', doSearch);
    wordCb.addEventListener('change', doSearch);

    replaceBtn.addEventListener('click', function() {
      var q = input.value, r = replaceI.value;
      if (!q) return;
      var opts = { regex: regexCb.checked, caseSensitive: caseCb.checked, wholeWord: wordCb.checked };
      var count = 0;
      AppState.files.forEach(function(file) {
        if (file.isImage || file.name === '.gitkeep') return;
        var newContent = _replaceInText(file.content || '', q, r, opts);
        if (newContent !== file.content) { file.content = newContent; file.modifiedAt = Date.now(); count++; }
      });
      saveToStorage();
      if (Editor) Editor.loadFile(getActiveFile());
      if (UI) UI.toast('Replaced in ' + count + ' files', 'success');
      doSearch();
    });
  }

  function _search(query, opts) {
    var resultsEl = _panelEl && _panelEl.querySelector('#gs-results');
    var countEl   = _panelEl && _panelEl.querySelector('#gs-count');
    if (!resultsEl) return;
    if (!query) { resultsEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">Type to search across all files</div>'; if(countEl)countEl.textContent=''; return; }

    try { _buildRegex(query, opts); } catch(e) { resultsEl.innerHTML='<div style="color:var(--danger);font-size:11px;padding:10px">Invalid regex: '+e.message+'</div>'; return; }

    _results = [];
    var totalMatches = 0;

    AppState.files.forEach(function(file) {
      if (file.isImage || file.name === '.gitkeep') return;
      var content = file.content || '';
      var lines   = content.split('\n');
      var fileMatches = [];

      lines.forEach(function(line, lineIdx) {
        var re = _buildRegex(query, opts);
        var m;
        while ((m = re.exec(line)) !== null) {
          fileMatches.push({ line: lineIdx + 1, col: m.index + 1, text: line.trim(), match: m[0] });
          totalMatches++;
          if (totalMatches > 1000) return;
        }
      });

      if (fileMatches.length > 0) _results.push({ file: file, matches: fileMatches });
    });

    if (countEl) countEl.textContent = totalMatches > 0 ? totalMatches + ' result' + (totalMatches !== 1 ? 's' : '') + ' in ' + _results.length + ' file' + (_results.length !== 1 ? 's' : '') : 'No results';

    if (_results.length === 0) {
      resultsEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">No results for "' + _escHtml(query) + '"</div>';
      return;
    }

    var html = _results.map(function(r) {
      var ext  = r.file.name.split('.').pop().toLowerCase();
      var icon = typeof Icons !== 'undefined' ? Icons.getFileIcon(ext, '') : '';
      return '<div class="gs-file-group">' +
        '<div class="gs-file-header" data-fileid="' + r.file.id + '">' +
          '<span style="width:14px;height:14px;display:inline-flex;align-items:center">' + icon + '</span>' +
          '<span style="font-size:12px;font-weight:600;color:var(--text)">' + _escHtml(r.file.path||r.file.name) + '</span>' +
          '<span style="font-size:10px;color:var(--text-dim);margin-left:auto">' + r.matches.length + '</span>' +
        '</div>' +
        r.matches.slice(0, 30).map(function(m) {
          var highlighted = _escHtml(m.text).replace(_escHtml(m.match), '<mark style="background:rgba(255,200,0,.3);color:var(--text-bright)">' + _escHtml(m.match) + '</mark>');
          return '<div class="gs-match" data-fileid="' + r.file.id + '" data-line="' + m.line + '">' +
            '<span class="gs-line-num">' + m.line + '</span>' +
            '<span class="gs-match-text">' + highlighted + '</span>' +
          '</div>';
        }).join('') +
        (r.matches.length > 30 ? '<div style="font-size:10px;color:var(--text-dim);padding:3px 10px">+ ' + (r.matches.length-30) + ' more…</div>' : '') +
      '</div>';
    }).join('');

    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.gs-match, .gs-file-header').forEach(function(el) {
      el.addEventListener('click', function() {
        var fileId = el.dataset.fileid;
        var line   = parseInt(el.dataset.line || '1');
        var file   = AppState.files.filter(function(f){ return f.id === fileId; })[0];
        if (!file) return;
        AppState.activeFileId = file.id;
        if (Editor) { Editor.loadFile(file); setTimeout(function(){ Editor.gotoLine(line); }, 50); }
        EventBus.emit(Events.FILE_SWITCHED, { file: file });
      });
    });
  }

  function _buildRegex(query, opts) {
    var flags = 'g' + (opts.caseSensitive ? '' : 'i');
    var pattern = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (opts.wholeWord) pattern = '\\b' + pattern + '\\b';
    return new RegExp(pattern, flags);
  }

  function _replaceInText(text, query, replacement, opts) {
    try { return text.replace(_buildRegex(query, opts), replacement); } catch(e) { return text; }
  }

  function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
