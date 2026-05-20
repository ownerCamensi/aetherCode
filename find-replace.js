/**
 * find-replace.js — Find & Replace bar (VSCode-style inline bar)
 * Appears just below the tab bar, above the editor.
 * Uses Ace's built-in search session for accuracy.
 */
var FindReplace = (function() {

  var _bar      = null;
  var _open     = false;
  var _mode     = 'find'; // 'find' | 'replace'

  function init() {
    _bar = document.getElementById('find-replace-bar');
    if (!_bar) return;

    // Keyboard shortcuts — attach to window so they work anywhere
    window.addEventListener('keydown', function(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'f') { e.preventDefault(); open('find'); }
      if (ctrl && e.key === 'h') { e.preventDefault(); open('replace'); }
      if (e.key === 'Escape' && _open) { close(); }
    });

    _bindBarEvents();
  }

  function open(mode) {
    _mode = mode || 'find';
    _open = true;
    _bar.classList.remove('hidden');
    _bar.classList.toggle('show-replace', _mode === 'replace');

    // Pre-fill with selected text
    if (Editor && Editor._ace) {
      var sel = Editor._ace.getSelectedText();
      if (sel) document.getElementById('fr-find-input').value = sel;
    }

    document.getElementById('fr-find-input').focus();
    document.getElementById('fr-find-input').select();
    if (Editor && Editor.resize) Editor.resize();
  }

  function close() {
    _open = false;
    _bar.classList.add('hidden');
    if (Editor) {
      // Clear Ace search highlights
      try { Editor._ace.session.highlight(null); } catch(e){}
      Editor.focus();
    }
    if (Editor && Editor.resize) Editor.resize();
  }

  function _bindBarEvents() {
    var findInput    = document.getElementById('fr-find-input');
    var replaceInput = document.getElementById('fr-replace-input');
    var btnNext      = document.getElementById('fr-btn-next');
    var btnPrev      = document.getElementById('fr-btn-prev');
    var btnReplace   = document.getElementById('fr-btn-replace');
    var btnReplaceAll= document.getElementById('fr-btn-replace-all');
    var btnClose     = document.getElementById('fr-btn-close');
    var btnToggle    = document.getElementById('fr-btn-toggle-replace');
    var cbCase       = document.getElementById('fr-cb-case');
    var cbWord       = document.getElementById('fr-cb-word');
    var cbRegex      = document.getElementById('fr-cb-regex');
    var matchInfo    = document.getElementById('fr-match-info');

    function _getOpts() {
      return {
        needle:          findInput ? findInput.value : '',
        caseSensitive:   cbCase  ? cbCase.checked  : false,
        wholeWord:       cbWord  ? cbWord.checked  : false,
        regExp:          cbRegex ? cbRegex.checked : false,
        wrap:            true,
        backwards:       false,
        skipCurrent:     false,
      };
    }

    function _updateMatchInfo() {
      if (!matchInfo || !Editor || !Editor._ace) return;
      var needle = findInput ? findInput.value : '';
      if (!needle) { matchInfo.textContent = ''; return; }
      try {
        var all = Editor._ace.findAll(needle, _getOpts());
        matchInfo.textContent = all ? all + ' match' + (all === 1 ? '' : 'es') : 'No matches';
        matchInfo.style.color = all ? '' : 'var(--danger)';
      } catch(e) { matchInfo.textContent = ''; }
    }

    if (findInput) {
      findInput.addEventListener('input',   _updateMatchInfo);
      findInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.shiftKey ? _prev() : _next(); }
        if (e.key === 'Escape') close();
      });
    }
    if (replaceInput) {
      replaceInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') _replaceOne();
        if (e.key === 'Escape') close();
      });
    }

    function _next() {
      if (!Editor || !Editor._ace) return;
      var opts = _getOpts();
      Editor._ace.find(opts.needle, opts);
    }
    function _prev() {
      if (!Editor || !Editor._ace) return;
      var opts = Object.assign(_getOpts(), { backwards: true });
      Editor._ace.find(opts.needle, opts);
    }
    function _replaceOne() {
      if (!Editor || !Editor._ace) return;
      var needle  = findInput   ? findInput.value   : '';
      var replace = replaceInput? replaceInput.value : '';
      Editor._ace.replace(replace, _getOpts());
      Editor._ace.findNext(_getOpts());
      _updateMatchInfo();
    }
    function _replaceAll() {
      if (!Editor || !Editor._ace) return;
      var needle  = findInput   ? findInput.value   : '';
      var replace = replaceInput? replaceInput.value : '';
      var count   = Editor._ace.replaceAll(replace, Object.assign(_getOpts(), { needle: needle }));
      if (UI) UI.toast('Replaced ' + (count || 0) + ' occurrence(s)', 'success');
      _updateMatchInfo();
    }

    if (btnNext)       btnNext.addEventListener('click',       _next);
    if (btnPrev)       btnPrev.addEventListener('click',       _prev);
    if (btnReplace)    btnReplace.addEventListener('click',    _replaceOne);
    if (btnReplaceAll) btnReplaceAll.addEventListener('click', _replaceAll);
    if (btnClose)      btnClose.addEventListener('click',      close);
    if (btnToggle)     btnToggle.addEventListener('click', function() {
      _mode = _mode === 'find' ? 'replace' : 'find';
      _bar.classList.toggle('show-replace', _mode === 'replace');
      if (Editor && Editor.resize) Editor.resize();
    });
    if (cbCase || cbWord || cbRegex) {
      [cbCase, cbWord, cbRegex].forEach(function(cb) { if (cb) cb.addEventListener('change', _updateMatchInfo); });
    }
  }

  return { init:init, open:open, close:close };
})();
