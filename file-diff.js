/**
 * file-diff.js — Side-by-side file diff viewer
 * Compares two files line by line using Myers diff algorithm.
 * Shows added (green), removed (red), unchanged (dim) lines.
 */
var FileDiff = (function() {

  var _panelEl = null;
  var _fileA   = null;
  var _fileB   = null;

  function init() {
    PanelSystem.register({
      id:'diff', title:'Diff',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.5 3.5a.5.5 0 0 0-1 0v8.793l-1.146-1.147a.5.5 0 0 0-.708.708l2 1.999.007.007a.497.497 0 0 0 .7-.006l2-2a.5.5 0 0 0-.707-.708L3.5 12.293V3.5zm4 .5a.5.5 0 0 1 0-1h1a.5.5 0 0 1 0 1h-1zm0 3a.5.5 0 0 1 0-1h3a.5.5 0 0 1 0 1h-3zm0 3a.5.5 0 0 1 0-1h5a.5.5 0 0 1 0 1h-5zM7 12.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 0-1h-7a.5.5 0 0 0-.5.5z"/></svg>',
      render: _renderPanel,
      onShow: function(el) { _panelEl = el; },
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'diff-open', label:'Diff: Compare Two Files', category:'View', action: function() { PanelSystem.show('diff'); } });
    }
  }

  function _renderPanel(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div class="diff-panel">',
      '<div class="diff-controls">',
        '<div class="diff-select-wrap">',
          '<label class="diff-select-label">File A</label>',
          '<select id="diff-file-a" class="diff-select">',
            _fileOptions(_fileA),
          '</select>',
        '</div>',
        '<div class="diff-select-wrap">',
          '<label class="diff-select-label">File B</label>',
          '<select id="diff-file-b" class="diff-select">',
            _fileOptions(_fileB),
          '</select>',
        '</div>',
        '<button class="btn-sm btn-primary-sm" id="diff-run-btn">Compare</button>',
        '<span class="diff-stats" id="diff-stats"></span>',
      '</div>',
      '<div class="diff-body" id="diff-body">',
        '<div class="diff-placeholder">Select two files and click Compare.</div>',
      '</div>',
      '</div>',
    ].join('');

    var selA = container.querySelector('#diff-file-a');
    var selB = container.querySelector('#diff-file-b');
    var btn  = container.querySelector('#diff-run-btn');

    // Auto select first two files
    if (AppState.files.length >= 2) {
      if (selA) selA.value = AppState.files[0].id;
      if (selB) selB.value = AppState.files[1].id;
    }

    if (btn) btn.addEventListener('click', function() {
      _fileA = selA ? selA.value : null;
      _fileB = selB ? selB.value : null;
      _runDiff(_fileA, _fileB, container);
    });
  }

  function _fileOptions(selectedId) {
    return AppState.files.map(function(f) {
      return '<option value="' + f.id + '"' + (f.id === selectedId ? ' selected' : '') + '>' + _esc(f.name) + '</option>';
    }).join('');
  }

  function _runDiff(idA, idB, container) {
    var fa = AppState.files.filter(function(f) { return f.id === idA; })[0];
    var fb = AppState.files.filter(function(f) { return f.id === idB; })[0];
    if (!fa || !fb) { if (UI) UI.toast('Select two files first.', 'error'); return; }

    var linesA = fa.content.split('\n');
    var linesB = fb.content.split('\n');
    var ops    = _diff(linesA, linesB);

    var added   = ops.filter(function(o) { return o.type === 'add'; }).length;
    var removed = ops.filter(function(o) { return o.type === 'del'; }).length;

    var statsEl = container.querySelector('#diff-stats');
    if (statsEl) statsEl.innerHTML = '<span style="color:#3fb950">+' + added + '</span>  <span style="color:#f48771">-' + removed + '</span>';

    var bodyEl = container.querySelector('#diff-body');
    if (!bodyEl) return;

    var html = '<div class="diff-header"><div class="diff-col-label">' + _esc(fa.name) + '</div><div class="diff-col-label">' + _esc(fb.name) + '</div></div>' +
               '<div class="diff-cols">' +
               '<div class="diff-col" id="diff-col-a">' + _renderSide(ops, 'a') + '</div>' +
               '<div class="diff-col" id="diff-col-b">' + _renderSide(ops, 'b') + '</div>' +
               '</div>';
    bodyEl.innerHTML = html;

    // Sync scroll between columns
    var colA = bodyEl.querySelector('#diff-col-a');
    var colB = bodyEl.querySelector('#diff-col-b');
    if (colA && colB) {
      colA.addEventListener('scroll', function() { colB.scrollTop = colA.scrollTop; });
      colB.addEventListener('scroll', function() { colA.scrollTop = colB.scrollTop; });
    }
  }

  function _renderSide(ops, side) {
    return ops.map(function(op) {
      var text = _esc(side === 'a' ? (op.lineA || '') : (op.lineB || ''));
      if (op.type === 'same') return '<div class="diff-line diff-same">' + (text || ' ') + '</div>';
      if (side === 'a' && op.type === 'del') return '<div class="diff-line diff-del">' + (text || ' ') + '</div>';
      if (side === 'b' && op.type === 'add') return '<div class="diff-line diff-add">' + (text || ' ') + '</div>';
      if (side === 'a' && op.type === 'add') return '<div class="diff-line diff-empty"> </div>';
      if (side === 'b' && op.type === 'del') return '<div class="diff-line diff-empty"> </div>';
      return '<div class="diff-line"> </div>';
    }).join('');
  }

  // Simple LCS-based diff (Myers simplified)
  function _diff(a, b) {
    var ops = [];
    var m = a.length, n = b.length;
    var dp = [];
    for (var i = 0; i <= m; i++) { dp[i] = []; for (var j = 0; j <= n; j++) dp[i][j] = 0; }
    for (var i = 1; i <= m; i++) for (var j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    }
    var i = m, j = n;
    var raw = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i-1] === b[j-1]) { raw.unshift({ type:'same', lineA:a[i-1], lineB:b[j-1] }); i--; j--; }
      else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { raw.unshift({ type:'add', lineA:'', lineB:b[j-1] }); j--; }
      else { raw.unshift({ type:'del', lineA:a[i-1], lineB:'' }); i--; }
    }
    return raw;
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  return { init: init };
})();
