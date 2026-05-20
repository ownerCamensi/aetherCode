/**
 * ui.js — Interface + Plugin Editor (JSON / JS / HTML)
 */
var UI = (function() {

  var els = {};
  var _pluginAce    = null;
  var _pluginFormat = 'json'; // 'json' | 'js' | 'html'

  function _grab() {
    els.sidebar          = document.getElementById('sidebar');
    els.tabBar           = document.getElementById('tab-bar');
    els.statusFile       = document.getElementById('status-file');
    els.statusLang       = document.getElementById('status-lang');
    els.statusCursor     = document.getElementById('status-cursor');
    els.panelExplorer    = document.getElementById('panel-explorer');
    els.panelSearch      = document.getElementById('panel-search');
    els.panelPlugins     = document.getElementById('panel-plugins');
    els.fileList         = document.getElementById('file-list');
    els.searchInput      = document.getElementById('search-input');
    els.searchResults    = document.getElementById('search-results');
    els.pluginSearch     = document.getElementById('plugin-search');
    els.pluginList       = document.getElementById('plugin-list');
    els.installedPlugins = document.getElementById('installed-plugins');
    els.toastContainer   = document.getElementById('toast-container');
    els.modalOverlay     = document.getElementById('modal-overlay');
    els.modal            = document.getElementById('modal');
    els.pluginEditor     = document.getElementById('plugin-editor-overlay');
    els.pluginAceEl      = document.getElementById('plugin-ace-editor');
    els.fontSizeSelect   = document.getElementById('font-size-select');
    els.themeSelect      = document.getElementById('theme-select');
  }

  function init() {
    _grab();
    _bindActivityBar();
    _bindFileActions();
    _bindSearch();
    _bindPluginPanel();
    _bindModalClose();
    _bindSettings();
    _initPluginAce();

    EventBus.on(Events.FILE_CREATED,     _renderAll);
    EventBus.on(Events.FILE_DELETED,     _renderAll);
    EventBus.on(Events.FILE_SWITCHED,    _renderAll);
    EventBus.on(Events.FILE_RENAMED,     _renderAll);
    EventBus.on(Events.PLUGIN_INSTALLED, function(d) { _renderPlugins(); toast('Installed: ' + d.plugin.title, 'success'); });
    EventBus.on(Events.PLUGIN_REMOVED,   function()  { _renderPlugins(); toast('Plugin removed.', 'info'); });
    EventBus.on(Events.UI_REFRESH,       function()  { _renderAll(); _renderPlugins(); });

    _renderAll(); _renderPlugins(); _applySidebarState();
    if (els.fontSizeSelect) els.fontSizeSelect.value = String(AppState.editor.fontSize);
    if (els.themeSelect)    els.themeSelect.value    = AppState.editor.theme;
  }

  function updateStatusCursor(line, col) { if (els.statusCursor) els.statusCursor.textContent = 'Ln ' + line + ', Col ' + col; }
  function updateStatusLang(lang)        { if (els.statusLang)   els.statusLang.textContent   = lang; }

  function _renderAll() {
    _renderTabs(); _renderFileList(); _updateStatusBar();
    setTimeout(function() { if (Editor.resize) Editor.resize(); }, 50);
  }

  // ─── Activity Bar ──────────────────────────────────────────────────────────
  function _bindActivityBar() {
    document.querySelectorAll('.activity-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _switchPanel(btn.dataset.panel, btn); });
    });
    var tog = document.getElementById('btn-toggle-sidebar');
    if (tog) tog.addEventListener('click', function() {
      AppState.sidebarOpen = !AppState.sidebarOpen;
      _applySidebarState(); saveToStorage();
      setTimeout(function() { if (Editor.resize) Editor.resize(); }, 220);
    });
  }

  function _switchPanel(panel, btn) {
    if (AppState.activePanel === panel && AppState.sidebarOpen) {
      AppState.sidebarOpen = false; _applySidebarState(); saveToStorage();
      setTimeout(function() { if (Editor.resize) Editor.resize(); }, 220); return;
    }
    AppState.activePanel = panel; AppState.sidebarOpen = true;
    document.querySelectorAll('.activity-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
    ['panelExplorer','panelSearch','panelPlugins'].forEach(function(k) { if (els[k]) els[k].classList.add('hidden'); });
    var map = { explorer:'panelExplorer', search:'panelSearch', plugins:'panelPlugins' };
    if (els[map[panel]]) els[map[panel]].classList.remove('hidden');
    _applySidebarState(); saveToStorage();
    setTimeout(function() { if (Editor.resize) Editor.resize(); }, 220);
  }

  function _applySidebarState() {
    if (!els.sidebar) return;
    var isCollapsed = !AppState.sidebarOpen;
    els.sidebar.classList.toggle('collapsed', isCollapsed);
    document.querySelectorAll('.activity-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.panel === AppState.activePanel && AppState.sidebarOpen);
    });
    // Update toggle button state
    var tog = document.getElementById('btn-toggle-sidebar');
    if (tog) tog.classList.toggle('active', AppState.sidebarOpen);
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────────
  function _renderTabs() {
    if (!els.tabBar) return;
    var html = '';
    AppState.files.forEach(function(file) {
      var ext    = _ext(file.name);
      var icon   = Icons.getFileIcon(ext, PluginManager.getFileIconSVG(ext));
      var active = file.id === AppState.activeFileId ? 'active' : '';
      html += '<div class="tab ' + active + '" data-id="' + file.id + '">' +
              '<span class="tab-icon">' + icon + '</span>' +
              '<span class="tab-name">' + _esc(file.name) + '</span>' +
              '<button class="tab-close" data-id="' + file.id + '">' + Icons.getUI('close') + '</button>' +
              '</div>';
    });
    els.tabBar.innerHTML = html;
    els.tabBar.querySelectorAll('.tab').forEach(function(t) {
      t.addEventListener('click', function(e) { if (e.target.closest('.tab-close')) return; _switchFile(t.dataset.id); });
    });
    els.tabBar.querySelectorAll('.tab-close').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); _deleteFile(b.dataset.id); });
    });
  }

  // ─── File List ─────────────────────────────────────────────────────────────
  function _renderFileList() {
    if (!els.fileList) return;
    if (!AppState.files.length) { els.fileList.innerHTML = '<p class="empty-hint">No files. Click + to create.</p>'; return; }
    var html = '';
    AppState.files.forEach(function(file) {
      var ext    = _ext(file.name);
      var icon   = Icons.getFileIcon(ext, PluginManager.getFileIconSVG(ext));
      var active = file.id === AppState.activeFileId ? 'active' : '';
      html += '<div class="file-item ' + active + '" data-id="' + file.id + '">' +
              '<span class="file-icon">' + icon + '</span>' +
              '<span class="file-name">' + _esc(file.name) + '</span>' +
              '<span class="file-actions">' +
              '<button class="file-btn file-rename" data-id="' + file.id + '" title="Rename">' + Icons.getUI('rename') + '</button>' +
              '<button class="file-btn file-delete" data-id="' + file.id + '" title="Delete">'  + Icons.getUI('trash')  + '</button>' +
              '</span></div>';
    });
    els.fileList.innerHTML = html;
    els.fileList.querySelectorAll('.file-item').forEach(function(item) {
      item.addEventListener('click', function(e) { if (e.target.closest('.file-btn')) return; _switchFile(item.dataset.id); });
    });
    els.fileList.querySelectorAll('.file-delete').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); _deleteFile(b.dataset.id); }); });
    els.fileList.querySelectorAll('.file-rename').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); _promptRename(b.dataset.id); }); });
  }

  // ─── File Actions ──────────────────────────────────────────────────────────
  function _bindFileActions() {
    var n = document.getElementById('btn-new-file');
    var o = document.getElementById('btn-open-file');
    if (n) n.addEventListener('click', _promptNewFile);
    if (o) o.addEventListener('click', _openFromDisk);
  }

  function _promptNewFile() {
    _showModal('New File', '<input id="modal-input" placeholder="filename.js" autocomplete="off">', function() {
      var name = (document.getElementById('modal-input').value || '').trim(); if (!name) return;
      var file = createFileObject(name, ''); AppState.files.push(file); _switchFile(file.id); saveToStorage();
      EventBus.emit(Events.FILE_CREATED, { file: file });
    });
    setTimeout(function() { var i = document.getElementById('modal-input'); if (i) i.focus(); }, 80);
  }

  function _promptRename(id) {
    var file = AppState.files.filter(function(f) { return f.id === id; })[0]; if (!file) return;
    _showModal('Rename', '<input id="modal-input" value="' + _esc(file.name) + '" autocomplete="off">', function() {
      var name = (document.getElementById('modal-input').value || '').trim(); if (!name) return;
      file.name = name; saveToStorage(); EventBus.emit(Events.FILE_RENAMED, { file: file });
    });
    setTimeout(function() { var i = document.getElementById('modal-input'); if (i) { i.focus(); i.select(); } }, 80);
  }

  function _openFromDisk() {
    var input = document.createElement('input'); input.type = 'file';
    input.accept = '.js,.ts,.jsx,.tsx,.html,.css,.scss,.json,.md,.txt,.py,.java,.c,.cpp,.rs,.go,.sh,.xml,.sql,.php,.rb';
    input.addEventListener('change', function() {
      var f = input.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function(e) {
        var file = createFileObject(f.name, e.target.result);
        AppState.files.push(file); _switchFile(file.id); saveToStorage();
        EventBus.emit(Events.FILE_CREATED, { file: file }); toast('Opened: ' + f.name, 'success');
      };
      r.readAsText(f);
    });
    input.click();
  }

  function _switchFile(id) {
    var file = AppState.files.filter(function(f) { return f.id === id; })[0]; if (!file) return;
    AppState.activeFileId = id; saveToStorage(); Editor.loadFile(file); _renderAll();
    EventBus.emit(Events.FILE_SWITCHED, { file: file });
  }

  function _deleteFile(id) {
    if (AppState.files.length === 1) { toast('Cannot delete the last file.', 'error'); return; }
    AppState.files = AppState.files.filter(function(f) { return f.id !== id; });
    if (AppState.activeFileId === id) { AppState.activeFileId = AppState.files[0].id; Editor.loadFile(AppState.files[0]); }
    saveToStorage(); EventBus.emit(Events.FILE_DELETED, { id: id }); _renderAll();
  }

  // ─── Search ────────────────────────────────────────────────────────────────
  function _bindSearch() {
    if (!els.searchInput) return;
    els.searchInput.addEventListener('input', function() { _renderSearchResults(els.searchInput.value.trim().toLowerCase()); });
  }

  function _renderSearchResults(q) {
    if (!els.searchResults) return;
    if (!q) { els.searchResults.innerHTML = '<p class="empty-hint">Type to search across all files.</p>'; return; }
    var hits = [];
    AppState.files.forEach(function(file) {
      file.content.split('\n').forEach(function(line, i) {
        if (line.toLowerCase().indexOf(q) !== -1) hits.push({ file: file, line: i+1, text: line.trim() });
      });
    });
    if (!hits.length) { els.searchResults.innerHTML = '<p class="empty-hint">No results.</p>'; return; }
    var html = hits.slice(0,100).map(function(h) {
      var hi = _esc(h.text).replace(new RegExp('(' + _escRe(q) + ')','gi'),'<mark>$1</mark>');
      return '<div class="search-hit" data-fileid="' + h.file.id + '"><div class="hit-file">' + _esc(h.file.name) + ':' + h.line + '</div><div class="hit-text">' + hi + '</div></div>';
    }).join('');
    els.searchResults.innerHTML = html;
    els.searchResults.querySelectorAll('.search-hit').forEach(function(el) { el.addEventListener('click', function() { _switchFile(el.dataset.fileid); }); });
  }

  // ─── Plugin Panel ──────────────────────────────────────────────────────────
  function _bindPluginPanel() {
    if (els.pluginSearch) els.pluginSearch.addEventListener('input', function() { _renderPlugins(); });
    var btnNew    = document.getElementById('btn-new-plugin');
    var btnUpload = document.getElementById('btn-upload-plugin');
    if (btnNew)    btnNew.addEventListener('click',    function() { openPluginEditor(null, 'json'); });
    if (btnUpload) btnUpload.addEventListener('click', function() { PluginManager.installFromFilePicker(); });
  }

  // Track collapsible open states
  var _sectionOpen = { marketplace: true, installed: true, settings: true };

  function _collapsibleSection(id, title, contentHtml, open) {
    var arrowSvg = Icons.getUI('chevronD');
    return '<div class="collapsible-section" id="col-wrap-' + id + '">' +
           '<div class="collapsible-header' + (open ? '' : ' collapsed') + '" data-section="' + id + '">' +
           '<span class="ch-arrow">' + arrowSvg + '</span>' +
           '<span>' + title + '</span>' +
           '</div>' +
           '<div class="collapsible-body' + (open ? '' : ' hidden') + '" id="col-body-' + id + '">' +
           contentHtml +
           '</div>' +
           '</div>';
  }

  function _renderPlugins() {
    var container = document.getElementById('plugins-scroll-body');
    if (!container) return;

    var q = els.pluginSearch ? els.pluginSearch.value.trim().toLowerCase() : '';

    // ── Marketplace section ──────────────────────────────────────────────────
    var builtins = PluginManager.getBuiltinPlugins();
    if (q) builtins = builtins.filter(function(p) { return (p.title+p.description+p.author).toLowerCase().indexOf(q) !== -1; });

    var marketplaceHtml = builtins.map(function(p) {
      var installed = AppState.plugins[p.type] && AppState.plugins[p.type].title === p.title;
      var logo = p.logo
        ? '<img class="plugin-logo-large" src="' + p.logo + '" alt="">'
        : '<div class="plugin-logo-large-placeholder">' + p.title[0] + '</div>';
      var verifiedBadge = p.trusted
        ? '<span class="badge-verified-pro" title="Verified by CodeX"><svg viewBox="0 0 16 16" fill="#fff" width="9" height="9"><path d="M6.5 11.5L3 8l1-1 2.5 2.5 5.5-5.5 1 1z"/></svg></span>'
        : '';
      var installBtn = installed
        ? '<span class="plugin-installed-indicator">✓ Installed</span>'
        : '<button class="plugin-install-btn-inline" data-plugin=\'' + JSON.stringify(p).replace(/'/g,"&#39;") + '\'>Install</button>';

      return '<div class="plugin-card-row" data-plugin=\'' + JSON.stringify(p).replace(/'/g,"&#39;") + '\'>' +
             '<div class="pcr-logo">' + logo + '</div>' +
             '<div class="pcr-info">' +
             '<div class="pcr-title">' + _esc(p.title) + verifiedBadge + '</div>' +
             '<div class="pcr-author">by ' + _esc(p.author) + '</div>' +
             '<div class="pcr-desc">' + _esc(p.description) + '</div>' +
             '</div>' +
             '<div class="pcr-action">' + installBtn + '</div>' +
             '</div>';
    }).join('') || '<p class="empty-hint">No plugins found.</p>';

    // ── Installed section ────────────────────────────────────────────────────
    var installedHtml = '';
    var hasInstalled  = false;
    Object.keys(AppState.plugins).forEach(function(key) {
      var p = AppState.plugins[key]; if (!p) return;
      hasInstalled = true;
      var fmt = p._format || 'json';
      installedHtml += '<div class="installed-item">' +
              '<span class="installed-dot"></span>' +
              '<span class="installed-name">' + _esc(p.title || key) + '</span>' +
              '<span class="installed-type">' + fmt + '</span>' +
              '<button class="installed-edit"   data-key="' + key + '" title="Edit">'   + Icons.getUI('rename') + '</button>' +
              '<button class="installed-remove" data-key="' + key + '" title="Remove">' + Icons.getUI('close')  + '</button>' +
              '</div>';
    });
    if (!hasInstalled) installedHtml = '<p class="empty-hint">No plugins installed.</p>';

    // ── Settings section ─────────────────────────────────────────────────────
    var fontFamilies = [
      { val:'',                           label:'Geist Mono (Default)' },
      { val:'JetBrains Mono',             label:'JetBrains Mono' },
      { val:'Fira Code',                  label:'Fira Code' },
      { val:'Cascadia Code',              label:'Cascadia Code' },
      { val:'Consolas',                   label:'Consolas' },
      { val:'Source Code Pro',            label:'Source Code Pro' },
      { val:'IBM Plex Mono',              label:'IBM Plex Mono' },
      { val:'Courier New',                label:'Courier New' },
    ];
    var settingsHtml =
      '<div class="settings-group">' +

        // Editor appearance
        '<div class="settings-section-label">Editor</div>' +

        '<div class="settings-row"><span class="settings-label">Theme</span>' +
        '<select id="theme-select" class="settings-select">' +
          '<option value="monokai">Monokai</option><option value="dracula">Dracula</option>' +
          '<option value="solarized">Solarized Dark</option><option value="nord">Nord Dark</option>' +
          '<option value="twilight">Twilight</option><option value="tomorrow">Tomorrow Night</option>' +
          '<option value="cobalt">Cobalt</option><option value="ambiance">Ambiance</option>' +
          '<option value="one_dark">One Dark</option><option value="gruvbox">Gruvbox</option>' +
          '<option value="chrome">Chrome (Light)</option><option value="github">GitHub (Light)</option>' +
        '</select></div>' +

        '<div class="settings-row"><span class="settings-label">Font Size</span>' +
        '<select id="font-size-select" class="settings-select">' +
          '<option value="11">11px</option><option value="12">12px</option><option value="13">13px</option>' +
          '<option value="14">14px</option><option value="15">15px</option><option value="16">16px</option>' +
          '<option value="18">18px</option><option value="20">20px</option><option value="22">22px</option>' +
        '</select></div>' +

        '<div class="settings-row"><span class="settings-label">Font Family</span>' +
        '<select id="font-family-select" class="settings-select">' +
          fontFamilies.map(function(f) { return '<option value="' + f.val + '">' + f.label + '</option>'; }).join('') +
        '</select></div>' +

        '<div class="settings-row"><span class="settings-label">Tab Size</span>' +
        '<select id="tab-size-select" class="settings-select">' +
          '<option value="2">2 spaces</option><option value="4">4 spaces</option><option value="8">8 spaces</option>' +
        '</select></div>' +

        '<div class="settings-row"><span class="settings-label">Word Wrap</span>' +
        '<button id="toggle-word-wrap" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">Line Numbers</span>' +
        '<button id="toggle-line-numbers" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">Show Invisibles</span>' +
        '<button id="toggle-invisibles" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">Bracket Matching</span>' +
        '<button id="toggle-bracket" class="settings-toggle on" disabled title="Always on"></button></div>' +

        // AI
        '<div class="settings-section-label" style="margin-top:8px">AI</div>' +

        '<div class="settings-row"><span class="settings-label">AI Suggestions<br><span style="font-size:10px;color:var(--text-dim)">Live completions while typing</span></span>' +
        '<button id="toggle-ai-suggest" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">AI Provider</span>' +
        '<button id="btn-ai-configure" class="btn-sm" style="font-size:11px;padding:3px 10px">Configure</button></div>' +

        // Format
        '<div class="settings-section-label" style="margin-top:8px">Format</div>' +

        '<div class="settings-row"><span class="settings-label">Auto Format on Save</span>' +
        '<button id="toggle-auto-format" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">Icon Theme</span>' +
        '<select id="icon-theme-select" class="settings-select">' +
          '<option value="vscode">VSCode Seti</option>' +
          '<option value="jetbrains">JetBrains</option>' +
        '</select></div>' +

        // Background
        '<div class="settings-section-label" style="margin-top:8px">Background</div>' +

        '<div class="settings-row"><span class="settings-label"><div>Image Background</div><div style="font-size:10px;color:var(--text-dim)">Use any image as editor background</div></span>' +
        '<button id="btn-imgbg-set" class="btn-sm" style="font-size:11px;padding:3px 10px">Set Image</button></div>' +

        '<div class="settings-row"><span class="settings-label">Remove Background</span>' +
        '<button id="btn-imgbg-clear" class="btn-sm" style="font-size:11px;padding:3px 10px">Remove</button></div>' +

        // Fun
        '<div class="settings-section-label" style="margin-top:8px">Fun</div>' +

        '<div class="settings-row"><span class="settings-label"><div>Power Mode 🔥</div><div style="font-size:10px;color:var(--text-dim)">Fire particles while typing</div></span>' +
        '<button id="toggle-power-mode" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label"><div>Hot Reload 🔄</div><div style="font-size:10px;color:var(--text-dim)">Preview updates as you type</div></span>' +
        '<button id="toggle-hot-reload" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label"><div>Ghost Text ✨</div><div style="font-size:10px;color:var(--text-dim)">Copilot-style AI suggestions</div></span>' +
        '<button id="toggle-ghost-text" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label"><div>ESLint 🔍</div><div style="font-size:10px;color:var(--text-dim)">Real-time error squiggles</div></span>' +
        '<button id="toggle-eslint" class="settings-toggle"></button></div>' +

        '<div class="settings-row"><span class="settings-label">ESLint Rules</span>' +
        '<button id="btn-eslint-config" class="btn-sm" style="font-size:11px;padding:3px 10px">Configure</button></div>' +

        // Performance
        '<div class="settings-section-label" style="margin-top:8px">⚡ Performance</div>' +
        '<div style="font-size:10px;color:var(--text-dim);padding:0 12px 6px;line-height:1.5">Like video game graphics settings</div>' +
        '<div class="settings-row"><span class="settings-label">Mode</span>' +
        '<div style="display:flex;gap:4px">' +
          '<button class="perf-mode-btn" data-mode="ultra"    style="font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:none;color:var(--text-dim)">🚀 Ultra</button>' +
          '<button class="perf-mode-btn" data-mode="balanced" style="font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:none;color:var(--text-dim)">⚡ Balanced</button>' +
          '<button class="perf-mode-btn" data-mode="low"      style="font-size:10px;padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid var(--border);background:none;color:var(--text-dim)">🔋 Low</button>' +
        '</div></div>' +

        // Mobile Features — only shown on mobile
        '<div id="mob-features-section" style="display:none">' +
          '<div class="settings-section-label" style="margin-top:8px">📱 Mobile Features</div>' +
          '<div style="font-size:10px;color:var(--text-dim);padding:0 12px 6px;line-height:1.5">Toggle which panels appear in the bottom navigation bar</div>' +

          '<div class="settings-row"><span class="settings-label"><div>AI Assistant</div><div style="font-size:10px;color:var(--text-dim)">Show AI tab in bottom nav</div></span>' +
          '<button id="mob-toggle-ai" class="settings-toggle"></button></div>' +

          '<div class="settings-row"><span class="settings-label"><div>Output / Console</div><div style="font-size:10px;color:var(--text-dim)">Access output via Run tab</div></span>' +
          '<button id="mob-toggle-output" class="settings-toggle"></button></div>' +

          '<div class="settings-row"><span class="settings-label"><div>Git Panel</div><div style="font-size:10px;color:var(--text-dim)">GitHub integration</div></span>' +
          '<button id="mob-toggle-git" class="settings-toggle"></button></div>' +

          '<div class="settings-row"><span class="settings-label"><div>Analytics</div><div style="font-size:10px;color:var(--text-dim)">Code stats panel</div></span>' +
          '<button id="mob-toggle-analytics" class="settings-toggle"></button></div>' +
        '</div>' +

        // Export
        '<div class="settings-section-label" style="margin-top:8px">Project</div>' +

        '<div class="settings-row"><span class="settings-label">Export ZIP</span>' +
        '<button id="btn-export-zip" class="btn-sm" style="font-size:11px;padding:3px 10px">Export</button></div>' +

        '<div class="settings-row"><span class="settings-label">Import ZIP</span>' +
        '<button id="btn-import-zip-s" class="btn-sm" style="font-size:11px;padding:3px 10px">Import</button></div>' +

      '</div>';

    // Render: marketplace first, then installed, then settings
    container.innerHTML =
      _collapsibleSection('marketplace', 'Marketplace', marketplaceHtml, _sectionOpen.marketplace) +
      _collapsibleSection('installed',   'Installed',   installedHtml,   _sectionOpen.installed)   +
      _collapsibleSection('settings',    'Editor Settings', settingsHtml, _sectionOpen.settings);

    // Bind collapsible toggles
    container.querySelectorAll('.collapsible-header').forEach(function(hdr) {
      hdr.addEventListener('click', function() {
        var id   = hdr.dataset.section;
        var body = document.getElementById('col-body-' + id);
        var isCollapsed = hdr.classList.contains('collapsed');
        hdr.classList.toggle('collapsed', !isCollapsed);
        if (body) body.classList.toggle('hidden', !isCollapsed);
        _sectionOpen[id] = isCollapsed;
      });
    });

    // Plugin card row click → detail page (click on row, not install btn)
    container.querySelectorAll('.plugin-card-row').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.plugin-install-btn-inline')) return; // let install btn handle
        try { _openPluginDetail(JSON.parse(card.dataset.plugin)); } catch(e2) {}
      });
    });

    // Inline install buttons
    container.querySelectorAll('.plugin-install-btn-inline').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        try {
          var result = PluginManager.installObject(JSON.parse(btn.dataset.plugin));
          if (result.ok) { _renderPlugins(); }
          else toast(result.errors[0], 'error');
        } catch(er) { toast('Install failed', 'error'); }
      });
    });

    // Installed buttons
    container.querySelectorAll('.installed-remove').forEach(function(b) {
      b.addEventListener('click', function(e) { e.stopPropagation(); PluginManager.remove(b.dataset.key); _renderPlugins(); });
    });
    container.querySelectorAll('.installed-edit').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        var p = AppState.plugins[b.dataset.key];
        if (p) openPluginEditor(p, p._format || 'json');
      });
    });

    // Settings controls
    var ts = document.getElementById('theme-select');
    var fs = document.getElementById('font-size-select');
    var ff = document.getElementById('font-family-select');
    var tb = document.getElementById('tab-size-select');
    var iconTheme = document.getElementById('icon-theme-select');

    if (ts) { ts.value = AppState.editor.theme || 'monokai'; ts.addEventListener('change', function() { Editor.setTheme(ts.value); AppState.editor.theme = ts.value; saveToStorage(); }); }
    if (fs) { fs.value = String(AppState.editor.fontSize || 14); fs.addEventListener('change', function() { var v = parseInt(fs.value); AppState.editor.fontSize = v; Editor.setFontSize(v); saveToStorage(); }); }
    if (ff) {
      ff.value = AppState.editor.fontFamily || '';
      ff.addEventListener('change', function() {
        AppState.editor.fontFamily = ff.value;
        if (Editor && Editor._ace) {
          var fam = ff.value ? ff.value + ',JetBrains Mono,monospace' : "JetBrains Mono,Fira Code,monospace";
          Editor._ace.setOption('fontFamily', fam);
        }
        saveToStorage();
      });
    }
    if (tb) {
      tb.value = String(AppState.editor.tabSize || 4);
      tb.addEventListener('change', function() {
        AppState.editor.tabSize = parseInt(tb.value);
        if (Editor && Editor._ace) Editor._ace.setOption('tabSize', AppState.editor.tabSize);
        saveToStorage();
      });
    }
    if (iconTheme) {
      iconTheme.value = (typeof Icons !== 'undefined' ? Icons.getTheme() : 'vscode');
      iconTheme.addEventListener('change', function() {
        if (typeof Icons !== 'undefined') Icons.setTheme(iconTheme.value);
        EventBus.emit(Events.UI_REFRESH, {});
        saveToStorage();
      });
    }

    // Toggle buttons helper
    function _bindToggle(id, getter, setter) {
      var btn = document.getElementById(id);
      if (!btn) return;
      btn.classList.toggle('on', !!getter());
      btn.addEventListener('click', function() {
        var newVal = !getter();
        setter(newVal);
        btn.classList.toggle('on', newVal);
        saveToStorage();
      });
    }

    // Word wrap
    _bindToggle('toggle-word-wrap',
      function() { return AppState.editor.wordWrap; },
      function(v) {
        AppState.editor.wordWrap = v;
        if (Editor && Editor._ace) {
          Editor._ace.session.setUseWrapMode(v);
          Editor._ace.setOption('wrap', v ? 80 : false);
        }
      }
    );

    // Line numbers
    _bindToggle('toggle-line-numbers',
      function() { return AppState.editor.lineNumbers !== false; },
      function(v) {
        AppState.editor.lineNumbers = v;
        if (Editor && Editor._ace) Editor._ace.setOption('showGutter', v);
      }
    );

    // Show invisibles
    _bindToggle('toggle-invisibles',
      function() { return AppState.editor.showInvisibles; },
      function(v) {
        AppState.editor.showInvisibles = v;
        if (Editor && Editor._ace) Editor._ace.setOption('showInvisibles', v);
      }
    );

    // AI Suggestions
    _bindToggle('toggle-ai-suggest',
      function() { return AppState.editor.aiSuggest; },
      function(v) {
        AppState.editor.aiSuggest = v;
        if (typeof AISuggest !== 'undefined') AISuggest.setEnabled(v);
      }
    );

    // Auto format
    _bindToggle('toggle-auto-format',
      function() { return AppState.editor.autoFormat; },
      function(v) {
        AppState.editor.autoFormat = v;
        if (typeof AutoFormatter !== 'undefined') AutoFormatter.setEnabled(v);
      }
    );

    // AI configure button
    var aiCfgBtn = document.getElementById('btn-ai-configure');
    if (aiCfgBtn) aiCfgBtn.addEventListener('click', function() {
      if (typeof AIAssistant !== 'undefined') AIAssistant.openConfigModal();
    });

    // Export ZIP
    var expBtn = document.getElementById('btn-export-zip');
    if (expBtn) expBtn.addEventListener('click', function() { if (ExportZip) ExportZip.exportZip(); });

    // Import ZIP
    var impBtn = document.getElementById('btn-import-zip-s');
    if (impBtn) impBtn.addEventListener('click', function() { if (ExportZip) ExportZip.importZip(); });

    // Image Background
    var imgBgBtn   = document.getElementById('btn-imgbg-set');
    var imgBgClear = document.getElementById('btn-imgbg-clear');
    if (imgBgBtn)   imgBgBtn.addEventListener('click',   function() { if (typeof ImgBG !== 'undefined') ImgBG.openPicker(); });
    if (imgBgClear) imgBgClear.addEventListener('click', function() { if (typeof ImgBG !== 'undefined') ImgBG.clear(); });

    // Power Mode toggle
    _bindToggle('toggle-power-mode',
      function() { return typeof PowerMode !== 'undefined' && PowerMode.isEnabled(); },
      function(v) { if (typeof PowerMode !== 'undefined') PowerMode.toggle(); }
    );

    // Hot Reload toggle
    _bindToggle('toggle-hot-reload',
      function() { return typeof Runner !== 'undefined' && Runner.isHotReload && Runner.isHotReload(); },
      function(v) { if (typeof Runner !== 'undefined' && Runner.toggleHotReload) Runner.toggleHotReload(); }
    );

    // Ghost Text toggle
    _bindToggle('toggle-ghost-text',
      function() { return typeof AIGhostText !== 'undefined' && AIGhostText.isEnabled(); },
      function(v) { if (typeof AIGhostText !== 'undefined') AIGhostText.toggle(); }
    );

    // ESLint toggle
    _bindToggle('toggle-eslint',
      function() { return typeof ESLintLinter !== 'undefined' && ESLintLinter.isEnabled(); },
      function(v) { if (typeof ESLintLinter !== 'undefined') ESLintLinter.toggle(); }
    );
    var eslintCfgBtn = document.getElementById('btn-eslint-config');
    if (eslintCfgBtn) eslintCfgBtn.addEventListener('click', function() {
      if (typeof ESLintLinter !== 'undefined') ESLintLinter.openConfig();
    });

    // Performance mode buttons
    function _updatePerfBtns() {
      var cur = (typeof Performance !== 'undefined') ? Performance.getMode() : 'balanced';
      document.querySelectorAll('.perf-mode-btn').forEach(function(btn) {
        var active = btn.dataset.mode === cur;
        btn.style.background     = active ? 'var(--accent)'    : 'none';
        btn.style.color          = active ? '#fff'             : 'var(--text-dim)';
        btn.style.borderColor    = active ? 'var(--accent)'    : 'var(--border)';
      });
    }
    document.querySelectorAll('.perf-mode-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        if (typeof Performance !== 'undefined') Performance.setMode(btn.dataset.mode);
        _updatePerfBtns();
      });
    });
    _updatePerfBtns();

    // Mobile features section — show only on mobile
    var mobSection = document.getElementById('mob-features-section');
    if (mobSection) mobSection.style.display = window.innerWidth <= 768 ? '' : 'none';

    // Mobile feature toggles
    function _bindMobFeatureToggle(id, feat) {
      var btn = document.getElementById(id); if (!btn) return;
      var feats = (typeof window._getMobFeatures === 'function') ? window._getMobFeatures() : {};
      btn.classList.toggle('on', !!feats[feat]);
      btn.addEventListener('click', function() {
        var f = (typeof window._getMobFeatures === 'function') ? window._getMobFeatures() : {};
        var newVal = !f[feat];
        if (typeof window._mobToggleFeature === 'function') window._mobToggleFeature(feat, newVal);
        btn.classList.toggle('on', newVal);
        if (UI) UI.toast((newVal ? '✅ ' : '⭕ ') + feat + ' ' + (newVal ? 'enabled' : 'disabled'), 'info');
      });
    }
    _bindMobFeatureToggle('mob-toggle-ai',        'ai');
    _bindMobFeatureToggle('mob-toggle-output',    'output');
    _bindMobFeatureToggle('mob-toggle-git',       'git');
    _bindMobFeatureToggle('mob-toggle-analytics', 'analytics');
  }

  // ─── Plugin Detail Page ────────────────────────────────────────────────────

  function _openPluginDetail(plugin) {
    var detail = document.getElementById('plugin-detail');
    if (!detail) return;

    var installed = AppState.plugins[plugin.type] && AppState.plugins[plugin.type].title === plugin.title;
    var logo = plugin.logo
      ? '<img src="' + plugin.logo + '" alt="' + _esc(plugin.title) + '">'
      : '<div class="pd-logo">' + plugin.title[0] + '</div>';

    var installBtn = installed
      ? '<button class="pd-install-btn installed" id="pd-installed-indicator">✓ Installed</button>' +
        '<button class="pd-remove-btn" id="pd-remove-btn">Uninstall</button>'
      : '<button class="pd-install-btn" id="pd-install-btn">Install</button>';

    document.getElementById('pd-title-text').textContent = plugin.title;

    var body = document.getElementById('pd-body');
    body.innerHTML =
      '<div class="pd-hero">' +
        '<div class="pd-logo">' + (plugin.logo ? '<img src="' + _esc(plugin.logo) + '" alt="">' : plugin.title[0]) + '</div>' +
        '<div class="pd-info">' +
          '<div class="pd-name">' + _esc(plugin.title) + (plugin.trusted ? ' <span style="color:var(--success);font-size:12px">✓</span>' : '') + '</div>' +
          '<div class="pd-author-line">by ' + _esc(plugin.author) + '</div>' +
          '<div class="pd-actions">' + installBtn + '<span class="pd-type-badge">' + plugin.type + '</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="pd-section-label">Description</div>' +
      '<div class="pd-description">' + _esc(plugin.description || 'No description provided.') + '</div>' +

      '<div class="pd-section-label">Preview</div>' +
      (plugin.screenshot
        ? '<img class="pd-screenshot" src="' + _esc(plugin.screenshot) + '" alt="Screenshot">'
        : '<div class="pd-no-screenshot">No screenshot provided</div>') +

      '<div class="pd-meta-row">' +
        '<div class="pd-meta-item">Type: <span>' + plugin.type + '</span></div>' +
        '<div class="pd-meta-item">Format: <span>' + (plugin._format || 'json') + '</span></div>' +
        (plugin.version ? '<div class="pd-meta-item">Version: <span>' + _esc(plugin.version) + '</span></div>' : '') +
      '</div>';

    detail.classList.remove('hidden');

    // Bind buttons
    var installBtn = document.getElementById('pd-install-btn');
    var removeBtn  = document.getElementById('pd-remove-btn');

    if (installBtn) {
      installBtn.addEventListener('click', function() {
        var result = PluginManager.installObject(plugin);
        if (result.ok) { _openPluginDetail(plugin); _renderPlugins(); }
        else toast(result.errors[0], 'error');
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        PluginManager.remove(plugin.type);
        _openPluginDetail(plugin);
        _renderPlugins();
      });
    }
  }

  function _closePluginDetail() {
    var detail = document.getElementById('plugin-detail');
    if (detail) detail.classList.add('hidden');
  }

  // ─── Plugin Editor Overlay ─────────────────────────────────────────────────
  function openPluginEditor(existing, format) {
    if (!els.pluginEditor) return;
    _pluginFormat = format || 'json';
    var title = existing ? 'Edit: ' + (existing.title || existing._id) : 'New Plugin';
    document.getElementById('plugin-editor-title').textContent = title;

    var content;
    if (existing) {
      if (_pluginFormat === 'json') content = JSON.stringify(existing, null, 2);
      else if (_pluginFormat === 'js')   content = existing.code || PluginManager.getTemplate('js');
      else if (_pluginFormat === 'html') content = existing.html || PluginManager.getTemplate('html');
    } else {
      content = PluginManager.getTemplate(_pluginFormat);
    }

    els.pluginEditor.classList.remove('hidden');
    _setPluginEditorFormat(_pluginFormat);

    if (_pluginAce) {
      _pluginAce.setValue(content, -1);
      _pluginAce.focus();
    }

    // Format tabs
    document.querySelectorAll('.pef-tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.fmt === _pluginFormat);
      tab.addEventListener('click', function() {
        _pluginFormat = tab.dataset.fmt;
        _setPluginEditorFormat(_pluginFormat);
        if (_pluginAce) _pluginAce.setValue(PluginManager.getTemplate(_pluginFormat), -1);
        document.querySelectorAll('.pef-tab').forEach(function(t) { t.classList.toggle('active', t === tab); });
      });
    });

    // Install button
    var btnInstall = document.getElementById('btn-plugin-editor-install');
    var newBtn = btnInstall.cloneNode(true);
    btnInstall.parentNode.replaceChild(newBtn, btnInstall);
    newBtn.addEventListener('click', function() {
      var code = _pluginAce ? _pluginAce.getValue() : '';
      var result;
      if (_pluginFormat === 'json')       result = PluginManager.installFromJSON(code);
      else if (_pluginFormat === 'js')    result = PluginManager.installScript('plugin-' + Date.now(), code);
      else if (_pluginFormat === 'html')  result = PluginManager.installHTMLPanel('panel-' + Date.now(), code);
      if (result && result.ok) { closePluginEditor(); }
      else if (result) { _showPluginError(result.errors); }
    });

    document.getElementById('btn-plugin-editor-cancel').onclick = closePluginEditor;
  }

  function _setPluginEditorFormat(fmt) {
    if (!_pluginAce) return;
    var modeMap = { json:'ace/mode/json', js:'ace/mode/javascript', html:'ace/mode/html' };
    _pluginAce.session.setMode(modeMap[fmt] || 'ace/mode/text');
    var hint = document.getElementById('plugin-editor-hint');
    var hints = {
      json: 'JSON — simple config (themes, icons)',
      js:   'JS — full API access, add panels & status items',
      html: 'HTML — iframe panel with postMessage bridge',
    };
    if (hint) hint.textContent = hints[fmt] || '';
  }

  function closePluginEditor() {
    if (els.pluginEditor) els.pluginEditor.classList.add('hidden');
    var el = document.getElementById('plugin-editor-errors'); if (el) el.classList.add('hidden');
    _renderPlugins();
  }

  function _showPluginError(errors) {
    var el = document.getElementById('plugin-editor-errors');
    if (el) { el.textContent = errors.join('\n'); el.classList.remove('hidden'); }
  }

  function _initPluginAce() {
    var container = document.getElementById('plugin-ace-editor'); if (!container) return;
    try {
      ace.config.set('basePath', 'ace/');
      _pluginAce = ace.edit('plugin-ace-editor');
      _pluginAce.setOptions({
        mode:'ace/mode/json', theme:'ace/theme/monokai', fontSize:'14px',
        tabSize:2, useSoftTabs:true, showPrintMargin:false,
        enableBasicAutocompletion:true, enableLiveAutocompletion:true, enableSnippets:true,
        highlightActiveLine:true, fontFamily:"'JetBrains Mono','Fira Code','Consolas',monospace",
      });
      _pluginAce.renderer.setPadding(12);
    } catch(e) { console.warn('[UI] Plugin Ace init failed:', e); }
  }

  // ─── Settings ──────────────────────────────────────────────────────────────
  function _bindSettings() {
    if (els.fontSizeSelect) els.fontSizeSelect.addEventListener('change', function() { Editor.setFontSize(parseInt(els.fontSizeSelect.value)); });
    if (els.themeSelect)    els.themeSelect.addEventListener('change',    function() { Editor.setTheme(els.themeSelect.value); });
  }

  function _updateStatusBar() {
    var file = getActiveFile();
    if (els.statusFile) els.statusFile.textContent = file ? file.name : 'No file';
  }

  // ─── Modal ─────────────────────────────────────────────────────────────────
  function _showModal(title, bodyHtml, onConfirm) {
    if (!els.modal || !els.modalOverlay) return;
    els.modal.innerHTML = '<div class="modal-header"><span class="modal-title">'+title+'</span><button id="modal-close-btn" class="modal-close">'+Icons.getUI('close')+'</button></div><div class="modal-body">'+bodyHtml+'</div><div class="modal-footer"><button id="modal-cancel" class="btn-sm">Cancel</button><button id="modal-confirm" class="btn-sm btn-primary-sm">OK</button></div>';
    els.modalOverlay.classList.remove('hidden');
    document.getElementById('modal-confirm').onclick    = function() { onConfirm(); _closeModal(); };
    document.getElementById('modal-cancel').onclick     = _closeModal;
    document.getElementById('modal-close-btn').onclick  = _closeModal;
    var inp = els.modal.querySelector('input');
    if (inp) inp.addEventListener('keydown', function(e) { if (e.key==='Enter'){onConfirm();_closeModal();} if(e.key==='Escape')_closeModal(); });
  }

  function _closeModal() { if (els.modalOverlay) els.modalOverlay.classList.add('hidden'); }
  function _bindModalClose() { if (els.modalOverlay) els.modalOverlay.addEventListener('click', function(e) { if (e.target===els.modalOverlay) _closeModal(); }); }

  // ─── Toast ─────────────────────────────────────────────────────────────────
  function toast(msg, type) {
    type = type || 'info';
    if (!els.toastContainer) return;
    var t = document.createElement('div');
    t.className = 'toast toast-' + type; t.textContent = msg;
    els.toastContainer.appendChild(t);
    requestAnimationFrame(function() { t.classList.add('visible'); });
    setTimeout(function() { t.classList.remove('visible'); setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 3000);
  }

  function _esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function _escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function _ext(name) { var p=(name||'').split('.'); return p.length>1?p[p.length-1].toLowerCase():''; }

  // Public: switch sidebar to a named panel
  function switchSidebarPanel(panelName) {
    // panelName: 'explorer' | 'search' | 'plugins'
    var map = { explorer:'panelExplorer', search:'panelSearch', plugins:'panelPlugins' };
    var activityMap = { explorer:'explorer', search:'search', plugins:'plugins' };

    if (!map[panelName]) panelName = 'plugins'; // default to plugins for settings

    // Show the right sidebar panel
    ['panelExplorer','panelSearch','panelPlugins'].forEach(function(k) {
      if (els[k]) els[k].classList.add('hidden');
    });
    if (els[map[panelName]]) els[map[panelName]].classList.remove('hidden');

    AppState.activePanel = activityMap[panelName] || panelName;

    // Update activity buttons
    document.querySelectorAll('.activity-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.panel === AppState.activePanel);
    });

    // Make sure sidebar is open
    AppState.sidebarOpen = true;
    if (els.sidebar) els.sidebar.classList.remove('collapsed');
    saveToStorage();
    setTimeout(function() { if (Editor && Editor.resize) Editor.resize(); }, 220);
  }

  function updateStatusFile(name) {
    var el = document.getElementById('status-file');
    if (el) el.textContent = name || 'No file';
  }

  return { init, toast, openPluginEditor, closePluginEditor, updateStatusCursor, updateStatusLang, updateStatusFile, switchSidebarPanel };

})();
