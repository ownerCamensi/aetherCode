/**
 * split-screen.js — 3-pane split editor (HTML | CSS | JS)
 * Properly rewritten: each pane is a real Ace instance, persists, works.
 */
var SplitScreen = (function() {

  var KEY       = 'codex:splitscreen';
  var ASMT_KEY  = 'codex:split-assignments'; // which file is in which pane
  var _enabled  = false;
  var _panes    = {}; // type → { ace, el }
  var _container = null;

  var SLOTS = [
    { type:'html', label:'HTML', color:'#e34c26', mode:'ace/mode/html',       extMatch:['html','htm'] },
    { type:'css',  label:'CSS',  color:'#264de4', mode:'ace/mode/css',        extMatch:['css','scss','less'] },
    { type:'js',   label:'JS',   color:'#f7df1e', mode:'ace/mode/javascript', extMatch:['js','ts','jsx','tsx'] },
  ];

  function init() {
    _enabled = localStorage.getItem(KEY) === 'true';
    if (typeof EventBus !== 'undefined') {
      EventBus.on(Events.APP_READY,      function() { if (_enabled) _buildSplit(); });
      EventBus.on(Events.FILE_CREATED,   function() { if (_enabled) _syncSelectors(); });
      EventBus.on(Events.FILE_SWITCHED,  function() { if (_enabled) _syncSelectors(); });
      // Update all pane themes when editor theme changes
      EventBus.on('theme:changed', function() {
        var theme = Editor.THEMES[AppState.editor.theme] || 'ace/theme/monokai';
        Object.values(_panes).forEach(function(p) { if (p.ace) p.ace.setTheme(theme); });
      });
    }
  }

  // ─── Toggle ────────────────────────────────────────────────────────────

  function toggle(enable) {
    _enabled = (enable !== undefined) ? enable : !_enabled;
    localStorage.setItem(KEY, String(_enabled));
    _enabled ? _buildSplit() : _destroySplit();
    return _enabled;
  }

  function isEnabled() { return _enabled; }

  // ─── Build ─────────────────────────────────────────────────────────────

  function _buildSplit() {
    var workspace = document.getElementById('workspace');
    var mainPanel = document.getElementById('editor-panel');
    if (!workspace || !mainPanel) return;

    // Hide main editor
    mainPanel.style.display = 'none';

    // Remove existing split container
    var old = document.getElementById('split-container');
    if (old) old.remove();

    _container = document.createElement('div');
    _container.id = 'split-container';
    _container.style.cssText = 'display:flex;flex:1;overflow:hidden;position:relative;';
    workspace.insertBefore(_container, mainPanel);

    // Close split button (always visible)
    var closeBtn = document.createElement('button');
    closeBtn.id = 'split-close-btn';
    closeBtn.title = 'Close Split Screen';
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close Split';
    closeBtn.style.cssText = 'position:absolute;top:4px;right:8px;z-index:200;background:rgba(244,135,113,.15);border:1px solid rgba(244,135,113,.4);color:#f48771;font-size:11px;padding:3px 10px;border-radius:3px;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:var(--font-ui)';
    closeBtn.addEventListener('click', function() { toggle(false); });
    _container.appendChild(closeBtn);

    _panes = {};

    // Load saved assignments
    var savedAssignments = {};
    try { savedAssignments = JSON.parse(localStorage.getItem(ASMT_KEY) || '{}'); } catch(e) {}

    SLOTS.forEach(function(slot, slotIdx) {
      var pane = document.createElement('div');
      pane.className = 'split-pane';
      pane.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;border-right:' + (slotIdx < SLOTS.length-1 ? '1px solid #1a1a1a' : 'none') + ';position:relative;min-width:80px;';

      // Header
      var header = document.createElement('div');
      header.className = 'split-header';
      header.innerHTML =
        '<span class="split-label"><span class="split-label-bar" style="background:' + slot.color + '"></span>' + slot.label + '</span>' +
        '<div style="display:flex;align-items:center;gap:4px">' +
          '<select class="split-file-select" data-type="' + slot.type + '"></select>' +
          '<button class="split-run-btn" data-type="' + slot.type + '" title="Run this pane">▶</button>' +
        '</div>';

      // Editor container
      var editorDiv = document.createElement('div');
      editorDiv.className = 'split-editor';
      editorDiv.id = 'split-ace-' + slot.type;
      editorDiv.style.cssText = 'flex:1;width:100%;overflow:hidden;';

      pane.appendChild(header);
      pane.appendChild(editorDiv);

      // Resize handle (not on last pane)
      if (slotIdx < SLOTS.length - 1) {
        var handle = document.createElement('div');
        handle.className = 'split-resize-handle';
        pane.appendChild(handle);
        _bindPaneResize(handle, pane);
      }

      _container.appendChild(pane);

      // Init Ace
      ace.config.set('basePath', 'ace/');
      var aceInst = ace.edit(editorDiv);
      aceInst.setOptions({
        theme: Editor.THEMES[AppState.editor.theme] || Editor.THEMES.monokai || 'ace/theme/monokai',
        mode:                      slot.mode,
        fontSize:                  (AppState.editor.fontSize || 14) + 'px',
        showPrintMargin:           false,
        enableBasicAutocompletion: true,
        enableLiveAutocompletion:  true,
        enableSnippets:            true,
        highlightActiveLine:       true,
        fontFamily:                'JetBrains Mono, Fira Code, Consolas, monospace',
        tabSize:                   AppState.editor.tabSize || 4,
        useSoftTabs:               true,
        showGutter:                true,
        wrap:                      AppState.editor.wordWrap || false,
      });
      aceInst.session.setUseWorker(false);

      // Sync changes back to file
      aceInst.on('change', function() {
        var sel    = pane.querySelector('.split-file-select');
        var fileId = sel ? sel.value : '';
        var file   = fileId ? AppState.files.filter(function(f) { return f.id === fileId; })[0] : null;
        if (file) { file.content = aceInst.getValue(); file.modifiedAt = Date.now(); }
      });

      _panes[slot.type] = { ace: aceInst, slot: slot };

      // Populate selector & auto-select
      _populateSelect(pane.querySelector('.split-file-select'), slot, aceInst, savedAssignments[slot.type]);

      // Run button
      var runBtn = header.querySelector('.split-run-btn');
      if (runBtn) runBtn.addEventListener('click', function() { _runPane(slot.type); });
    });
  }

  function _populateSelect(select, slot, aceInst, savedFileId) {
    if (!select) return;
    select.innerHTML = '<option value="">— none —</option>';
    AppState.files.forEach(function(file) {
      if (file.isImage || file.name === '.gitkeep') return;
      var opt = document.createElement('option');
      opt.value = file.id;
      opt.textContent = file.name;
      // Auto-match by extension
      var ext = file.name.split('.').pop().toLowerCase();
      if (!savedFileId && slot.extMatch.indexOf(ext) !== -1) savedFileId = file.id;
      select.appendChild(opt);
    });
    if (savedFileId) select.value = savedFileId;
    _loadPaneFile(select.value, aceInst, slot);

    select.onchange = function() {
      _loadPaneFile(select.value, aceInst, slot);
      // Save assignment
      var assignments = {};
      try { assignments = JSON.parse(localStorage.getItem(ASMT_KEY) || '{}'); } catch(e) {}
      assignments[slot.type] = select.value;
      localStorage.setItem(ASMT_KEY, JSON.stringify(assignments));
    };
  }

  function _loadPaneFile(fileId, aceInst, slot) {
    var file = fileId ? AppState.files.filter(function(f) { return f.id === fileId; })[0] : null;
    if (!file) { aceInst.setValue('', -1); return; }
    aceInst.setValue(file.content || '', -1);
    var modeMap = {
      html:'ace/mode/html', htm:'ace/mode/html',
      css:'ace/mode/css', scss:'ace/mode/scss', less:'ace/mode/less',
      js:'ace/mode/javascript', ts:'ace/mode/typescript',
      jsx:'ace/mode/jsx', tsx:'ace/mode/tsx',
    };
    var ext = file.name.split('.').pop().toLowerCase();
    aceInst.session.setMode(modeMap[ext] || slot.mode);
  }

  function _syncSelectors() {
    if (!_container) return;
    SLOTS.forEach(function(slot) {
      var pane = document.getElementById('split-ace-' + slot.type);
      if (!pane) return;
      var parentPane = pane.parentElement;
      if (!parentPane) return;
      var select = parentPane.querySelector('.split-file-select');
      var saved  = {};
      try { saved = JSON.parse(localStorage.getItem(ASMT_KEY) || '{}'); } catch(e) {}
      if (select && _panes[slot.type]) {
        _populateSelect(select, slot, _panes[slot.type].ace, saved[slot.type]);
      }
    });
  }

  function _runPane(type) {
    // Merge all 3 panes and run
    var html = '', css = '', js = '';
    SLOTS.forEach(function(slot) {
      if (!_panes[slot.type]) return;
      var content = _panes[slot.type].ace.getValue();
      if (slot.type === 'html') html = content;
      if (slot.type === 'css')  css  = content;
      if (slot.type === 'js')   js   = content;
    });
    if (!html) { if (UI) UI.toast('No HTML pane content to preview.', 'warn'); return; }
    var merged = html
      .replace('</head>', '<style>\n' + css + '\n</style>\n</head>')
      .replace('</body>', '<script>\n' + js + '\n<\/script>\n</body>');
    if (typeof Runner !== 'undefined') Runner.runContent(merged);
  }

  function _bindPaneResize(handle, pane) {
    var _active = false, _startX = 0, _startW = 0;
    handle.addEventListener('mousedown', function(e) {
      _active = true; _startX = e.clientX; _startW = pane.offsetWidth;
      handle.classList.add('resizing');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!_active) return;
      var newW = Math.max(80, _startW + (e.clientX - _startX));
      pane.style.flex  = 'none';
      pane.style.width = newW + 'px';
      Object.values(_panes).forEach(function(p) { if (p.ace) p.ace.resize(); });
    });
    document.addEventListener('mouseup', function() {
      if (!_active) return;
      _active = false; handle.classList.remove('resizing');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
    });
  }

  // ─── Destroy ───────────────────────────────────────────────────────────

  function _destroySplit() {
    if (_container) { _container.remove(); _container = null; }
    Object.keys(_panes).forEach(function(type) {
      try { if (_panes[type].ace) _panes[type].ace.destroy(); } catch(e) {}
    });
    _panes = {};
    var mainPanel = document.getElementById('editor-panel');
    if (mainPanel) mainPanel.style.display = '';
    setTimeout(function() { if (Editor && Editor.resize) Editor.resize(); }, 50);
  }

  // ─── Merge content for runner ──────────────────────────────────────────

  function getContent() {
    if (!_enabled || !Object.keys(_panes).length) return null;
    var html = '', css = '', js = '';
    if (_panes.html && _panes.html.ace) html = _panes.html.ace.getValue();
    if (_panes.css  && _panes.css.ace)  css  = _panes.css.ace.getValue();
    if (_panes.js   && _panes.js.ace)   js   = _panes.js.ace.getValue();
    if (!html) return null;
    return html
      .replace('</head>', '<style>' + css + '</style></head>')
      .replace('</body>', '<script>' + js + '<\/script></body>');
  }

  return { init, toggle, isEnabled, getContent };
})();
