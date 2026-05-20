/**
 * command-palette.js — VSCode-style command palette with real SVG icons
 * Supports files, commands, and symbols. No emoji icons.
 */
var CommandPalette = (function() {

  var _commands = [];
  var _isOpen   = false;

  // Professional SVG icons for each command category
  var CATEGORY_ICONS = {
    'File':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9.5 2z"/><polyline points="9 2 9 6 13 6"/></svg>',
    'Edit':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13 2 14l1-3L11.5 2.5z"/></svg>',
    'View':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="2"/><path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z"/></svg>',
    'Code':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polyline points="5 4 1 8 5 12"/><polyline points="11 4 15 8 11 12"/></svg>',
    'Python': '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C5.5 0 5 1.2 5 2.2v1.1h3v.4H3.8C2.7 3.7 2 4.7 2 6.2c0 1.5.7 2 1.7 2h.8V7c0-.9.5-1.6 1.6-1.6H9c1 0 1.4-.6 1.4-1.4V2.2C10.4 1 9.5 0 8 0zm-.9.7a.6.6 0 1 1 0 1.2.6.6 0 0 1 0-1.2z" fill="#3572a5"/><path d="M8 16c2.5 0 3-.9 3-2v-1.1h-3v-.4h4.2c1.1 0 1.8-1 1.8-2.5 0-1.5-.7-2-1.7-2H11V9c0 .9-.5 1.6-1.6 1.6H6.5c-1 0-1.4.6-1.4 1.4V14c0 1.2.9 2 2.9 2zm.9-.7a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2z" fill="#ffd343"/></svg>',
    'AI':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1a2 2 0 0 1 2 2c0 .6-.3 1.1-.8 1.4V6h.8A5 5 0 0 1 15 11h.6a.5.5 0 0 1 .4.5v1.5a.5.5 0 0 1-.5.5H15v.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V13h-.5A.5.5 0 0 1 0 12.5v-1.5A.5.5 0 0 1 .5 10.5H1A5 5 0 0 1 6 6h.8V4.4C6.3 4.1 6 3.6 6 3a2 2 0 0 1 2-2z"/></svg>',
    'Git':    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M15.7 7.3l-7-7a1 1 0 0 0-1.4 0l-1.4 1.4 1.7 1.7a1.2 1.2 0 0 1 1.5 1.5l1.7 1.7a1.2 1.2 0 1 1-.7.7L8.4 5.6v4.2a1.2 1.2 0 1 1-1 0V5.5a1.2 1.2 0 0 1-.7-1.6L5 2.2l-4.7 4.7a1 1 0 0 0 0 1.4l7 7a1 1 0 0 0 1.4 0l7-7a1 1 0 0 0 0-1.4z"/></svg>',
    'Theme':  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="5"/><path d="M8 3v5l3 3"/></svg>',
    'Format': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><line x1="13" y1="5" x2="3" y2="5"/><line x1="13" y1="8" x2="3" y2="8"/><line x1="8" y1="11" x2="3" y2="11"/></svg>',
    'Search': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="6.5" cy="6.5" r="4.5"/><line x1="14" y1="14" x2="10.5" y2="10.5"/></svg>',
    'Run':    '<svg viewBox="0 0 16 16" fill="currentColor"><polygon points="3 2 13 8 3 14"/></svg>',
    'Panel':  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="1" y="1" width="14" height="14" rx="1"/><line x1="1" y1="10" x2="15" y2="10"/></svg>',
  };

  // File icon by extension (for file switching entries)
  function _fileIcon(ext) {
    if (typeof Icons !== 'undefined' && Icons.getFileIcon) return Icons.getFileIcon(ext);
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M10 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L10 1z"/><polyline points="10 1 10 5 14 5"/></svg>';
  }

  function init() {
    _registerBuiltins();
    _bindKeys();
    _bindOverlayClick();
  }

  function register(cmd) {
    if (!cmd || !cmd.id) return;
    _commands = _commands.filter(function(c) { return c.id !== cmd.id; });
    _commands.push(cmd);
  }

  function unregister(id) {
    _commands = _commands.filter(function(c) { return c.id !== id; });
  }

  function open() {
    var overlay = document.getElementById('command-palette-overlay');
    var input   = document.getElementById('cp-input');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    _isOpen = true;
    if (input) { input.value = ''; input.focus(); _renderList(''); }
    if (input) input.addEventListener('input', function() { _renderList(input.value); });
    if (input) input.addEventListener('keydown', _handleKey);
  }

  function close() {
    var overlay = document.getElementById('command-palette-overlay');
    if (overlay) overlay.classList.add('hidden');
    _isOpen = false;
  }

  function _handleKey(e) {
    var list      = document.getElementById('cp-list');
    var items     = list ? list.querySelectorAll('.cp-item') : [];
    var selected  = list ? list.querySelector('.cp-item.selected') : null;
    var selectedIdx = -1;
    items.forEach(function(el, i) { if (el === selected) selectedIdx = i; });

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = selectedIdx + 1 < items.length ? items[selectedIdx + 1] : items[0];
      if (selected) selected.classList.remove('selected');
      if (next) { next.classList.add('selected'); next.scrollIntoView({ block:'nearest' }); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = selectedIdx > 0 ? items[selectedIdx - 1] : items[items.length - 1];
      if (selected) selected.classList.remove('selected');
      if (prev) { prev.classList.add('selected'); prev.scrollIntoView({ block:'nearest' }); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      var toRun = selected || (items.length ? items[0] : null);
      if (toRun) toRun.click();
    } else if (e.key === 'Escape') {
      close();
    }
  }

  function _bindKeys() {
    window.addEventListener('keydown', function(e) {
      var ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'p') { e.preventDefault(); _isOpen ? close() : open(); }
      if (ctrl && e.shiftKey && e.key === 'P') { e.preventDefault(); _isOpen ? close() : open(); }
      if (e.key === 'Escape' && _isOpen) close();
    });
  }

  function _bindOverlayClick() {
    var overlay = document.getElementById('command-palette-overlay');
    if (!overlay) return;
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  }

  function _renderList(query) {
    var list = document.getElementById('cp-list');
    if (!list) return;

    var q = (query || '').trim().toLowerCase();

    // Collect results: file matches + command matches
    var results = [];

    // Files first
    if (AppState && AppState.files) {
      AppState.files.forEach(function(file) {
        if (file.name === '.gitkeep') return;
        if (!q || file.name.toLowerCase().indexOf(q) !== -1) {
          var ext = file.name.split('.').pop().toLowerCase();
          results.push({
            type:     'file',
            id:       'file-' + file.id,
            label:    file.name,
            detail:   file.path || '',
            icon:     _fileIcon(ext),
            score:    file.name.toLowerCase().startsWith(q) ? 2 : 1,
            action:   function() { _switchFile(file); },
          });
        }
      });
    }

    // Commands
    _commands.forEach(function(cmd) {
      if (!q ||
          (cmd.label || '').toLowerCase().indexOf(q) !== -1 ||
          (cmd.category || '').toLowerCase().indexOf(q) !== -1) {
        results.push({
          type:   'command',
          id:     cmd.id,
          label:  cmd.label,
          detail: cmd.category || '',
          icon:   cmd.icon || CATEGORY_ICONS[cmd.category] || CATEGORY_ICONS['Code'],
          score:  (cmd.label||'').toLowerCase().startsWith(q) ? 2 : 1,
          action: function() { close(); if (cmd.action) cmd.action(); },
        });
      }
    });

    // Sort: files first if no query, else by score
    results.sort(function(a, b) {
      if (!q) return a.type === 'file' ? -1 : 1;
      return b.score - a.score;
    });

    if (results.length === 0) {
      list.innerHTML = '<div class="cp-empty">No results for "' + _esc(q) + '"</div>';
      return;
    }

    // Group by type if no query
    var html = '';
    var lastType = '';
    results.slice(0, 40).forEach(function(item, idx) {
      if (item.type !== lastType && !q) {
        html += '<div class="cp-group-label">' + (item.type === 'file' ? 'Files' : 'Commands') + '</div>';
        lastType = item.type;
      }
      // Highlight match
      var labelHtml = _esc(item.label);
      if (q) {
        var qi = labelHtml.toLowerCase().indexOf(q);
        if (qi !== -1) labelHtml = labelHtml.slice(0,qi) + '<mark>' + labelHtml.slice(qi, qi+q.length) + '</mark>' + labelHtml.slice(qi+q.length);
      }
      html +=
        '<div class="cp-item' + (idx === 0 ? ' selected' : '') + '">' +
          '<div class="cp-icon">' + (item.icon || '') + '</div>' +
          '<div class="cp-text-group">' +
            '<div class="cp-label">' + labelHtml + '</div>' +
            (item.detail ? '<div class="cp-detail">' + _esc(item.detail) + '</div>' : '') +
          '</div>' +
        '</div>';
    });

    list.innerHTML = html;
    list.querySelectorAll('.cp-item').forEach(function(el, i) {
      el.addEventListener('click', function() { results[i].action(); });
      el.addEventListener('mouseenter', function() {
        list.querySelectorAll('.cp-item.selected').forEach(function(s){ s.classList.remove('selected'); });
        el.classList.add('selected');
      });
    });
  }

  function _switchFile(file) {
    close();
    AppState.activeFileId = file.id;
    if (Editor) Editor.loadFile(file);
    EventBus.emit(Events.FILE_SWITCHED, { file: file });
  }

  function _registerBuiltins() {
    var cmds = [
      // File
      { id:'new-file',     label:'New File',              category:'File',   icon:CATEGORY_ICONS.File,   action: function() { document.getElementById('btn-new-file') && document.getElementById('btn-new-file').click(); } },
      { id:'open-file',    label:'Open File',             category:'File',   icon:CATEGORY_ICONS.File,   action: function() { if(FileManager) FileManager.openFile && FileManager.openFile(); } },
      { id:'open-folder',  label:'Open Folder',           category:'File',   icon:CATEGORY_ICONS.File,   action: function() { if(FileManager) FileManager.openFolder(); } },
      { id:'save-file',    label:'Save File (Ctrl+S)',    category:'File',   icon:CATEGORY_ICONS.File,   action: function() { if(FileManager) FileManager.saveActive(); } },
      { id:'export-zip',   label:'Export Project as ZIP', category:'File',   icon:CATEGORY_ICONS.File,   action: function() { if(ExportZip) ExportZip.exportZip(); } },
      { id:'import-image', label:'Import Image',          category:'File',   icon:CATEGORY_ICONS.View,   action: function() { if(ImageImport) ImageImport.openPicker(); } },
      // Edit
      { id:'find',         label:'Find in File',          category:'Edit',   icon:CATEGORY_ICONS.Search, action: function() { if(FindReplace) FindReplace.open('find'); } },
      { id:'replace',      label:'Find & Replace',        category:'Edit',   icon:CATEGORY_ICONS.Search, action: function() { if(FindReplace) FindReplace.open('replace'); } },
      { id:'fold-all',     label:'Fold All Regions',      category:'Edit',   icon:CATEGORY_ICONS.Code,   action: function() { if(Editor) Editor.foldAll(); } },
      { id:'unfold-all',   label:'Unfold All Regions',    category:'Edit',   icon:CATEGORY_ICONS.Code,   action: function() { if(Editor) Editor.unfoldAll(); } },
      { id:'emmet-expand', label:'Emmet: Expand Abbreviation', category:'Edit', icon:CATEGORY_ICONS.Code, action: function() { if(Editor) Editor.expandEmmet(); } },
      { id:'format-doc',   label:'Format Document',       category:'Format', icon:CATEGORY_ICONS.Format, action: function() { if(Formatter) Formatter.formatActive(); } },
      // View
      { id:'toggle-sidebar',label:'Toggle Sidebar',       category:'View',   icon:CATEGORY_ICONS.View,   action: function() { document.getElementById('btn-toggle-sidebar') && document.getElementById('btn-toggle-sidebar').click(); } },
      { id:'toggle-panel',  label:'Toggle Bottom Panel',  category:'View',   icon:CATEGORY_ICONS.Panel,  action: function() { if(PanelSystem) PanelSystem.toggleById(PanelSystem.getActive()||'output'); } },
      { id:'toggle-preview',label:'Toggle Preview',       category:'View',   icon:CATEGORY_ICONS.View,   action: function() { document.getElementById('btn-run') && document.getElementById('btn-run').click(); } },
      { id:'toggle-split',  label:'Toggle Split Screen',  category:'View',   icon:CATEGORY_ICONS.View,   action: function() { if(SplitScreen){ SplitScreen.toggle(); if(UI) UI.toast('Split '+(SplitScreen.isEnabled()?'on':'off'),'info'); } } },
      // Run
      { id:'run-preview',  label:'Run Preview',           category:'Run',    icon:CATEGORY_ICONS.Run,    action: function() { if(Runner) Runner.run(); } },
      { id:'run-python',   label:'Run Python File',       category:'Python', icon:CATEGORY_ICONS.Python, action: function() { if(LangRunner) LangRunner.runPython(); } },
      // AI
      { id:'ai-open',      label:'AI: Open Assistant',    category:'AI',     icon:CATEGORY_ICONS.AI,     action: function() { if(PanelSystem) PanelSystem.show('ai'); } },
      { id:'ai-explain',   label:'AI: Explain Code',      category:'AI',     icon:CATEGORY_ICONS.AI,     action: function() { PanelSystem.show('ai'); setTimeout(function(){AIAssistant._sendMsg&&AIAssistant._sendMsg('Explain this code step by step.');},300); } },
      { id:'ai-fix',       label:'AI: Fix Bugs',          category:'AI',     icon:CATEGORY_ICONS.AI,     action: function() { PanelSystem.show('ai'); setTimeout(function(){AIAssistant._sendMsg&&AIAssistant._sendMsg('Find and fix all bugs.');},300); } },
      { id:'ai-build',     label:'AI: Build Project',     category:'AI',     icon:CATEGORY_ICONS.AI,     action: function() { PanelSystem.show('ai'); setTimeout(function(){AIAssistant._sendMsg&&AIAssistant._sendMsg('Build this project: create all necessary files with FILENAME: name.ext before each code block.');},300); } },
      { id:'ai-config',    label:'AI: Configure Provider',category:'AI',     icon:CATEGORY_ICONS.AI,     action: function() { if(AIAssistant) AIAssistant.openConfigModal(); } },
      // Git
      { id:'git-open',     label:'Open Git Panel',        category:'Git',    icon:CATEGORY_ICONS.Git,    action: function() { if(PanelSystem) PanelSystem.show('git'); } },
      // Theme
      { id:'theme-open',   label:'Open Theme Creator',    category:'Theme',  icon:CATEGORY_ICONS.Theme,  action: function() { if(PanelSystem) PanelSystem.show('theme-creator'); } },
    ];
    cmds.forEach(function(c) { register(c); });
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, open, close, register, unregister };
})();
