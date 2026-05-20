/**
 * plugin-api.js — Advanced Plugin API v2
 *
 * New in v10:
 *   api.editor.onType(cb)          — fires on every keystroke with typed char + full value
 *   api.editor.onCursorMove(cb)    — fires when cursor moves
 *   api.editor.insertAt(pos, text) — insert text at a specific row/col
 *   api.editor.getSelection()      — get selected text
 *   api.editor.replaceSelection(s) — replace current selection
 *   api.editor.addDecoration(...)  — highlight a range (gutter icon, line color)
 *   api.editor.clearDecorations()  — remove all decorations added by this plugin
 *   api.editor.getLanguage()       — current file language
 *   api.workspace.getAll()         — all open files
 *   api.workspace.create(name,content) — programmatically create a file
 *   api.workspace.read(id)         — read file content
 *   api.workspace.write(id,content)— write to a file
 *   api.ui.showNotification(...)   — persistent notification (not just toast)
 *   api.ui.addMenuItem(...)        — add item to command palette
 *   api.theme.getVar(name)         — read a CSS variable
 *   api.theme.setVar(name,val)     — set a CSS variable
 *   api.net.fetch(url,opts)        — fetch from network (wrapper)
 *   api.storage.getAll(pluginId)   — get all stored keys for a plugin
 *   api.hooks.onSave(cb)           — called when user saves (Ctrl+S)
 *   api.hooks.onFileOpen(cb)       — called when a file is opened
 *   api.hooks.onRun(cb)            — called when Run button pressed
 */

var PluginAPI = (function() {

  var _registeredPanels = {};
  var _registeredStatus = {};
  var _decorations      = {}; // pluginId → [marker ids]

  // ─── Editor API ────────────────────────────────────────────────────────────

  var editor = {
    getValue:    function()  { return Editor && Editor._ace ? Editor._ace.getValue() : ''; },
    setValue:    function(v) { if (Editor && Editor._ace) Editor._ace.setValue(v, -1); },
    getLanguage: function()  { return AppState.editor.language || 'text'; },
    getTheme:    function()  { return AppState.editor.theme || 'monokai'; },
    setTheme:    function(t) { if (Editor) Editor.setTheme(t); },
    setFontSize: function(s) { if (Editor) Editor.setFontSize(s); },
    focus:       function()  { if (Editor) Editor.focus(); },
    resize:      function()  { if (Editor && Editor.resize) Editor.resize(); },

    getCursor: function() {
      if (!Editor || !Editor._ace) return { row:0, col:0, line:1, column:1 };
      var pos = Editor._ace.getCursorPosition();
      return { row: pos.row, col: pos.column, line: pos.row+1, column: pos.column+1 };
    },

    getSelection: function() {
      if (!Editor || !Editor._ace) return '';
      return Editor._ace.getSelectedText();
    },

    replaceSelection: function(text) {
      if (!Editor || !Editor._ace) return;
      Editor._ace.insert(text);
    },

    insertAt: function(row, col, text) {
      if (!Editor || !Editor._ace) return;
      Editor._ace.session.insert({ row: row, column: col }, text);
    },

    // Listen to every keystroke — cb(char, fullValue, cursor)
    onType: function(cb) {
      if (!Editor || !Editor._ace) return function(){};
      var handler = function() {
        var val    = Editor._ace.getValue();
        var cursor = Editor._ace.getCursorPosition();
        cb(null, val, cursor);
      };
      Editor._ace.on('change', handler);
      return function() { Editor._ace && Editor._ace.off('change', handler); };
    },

    onCursorMove: function(cb) {
      if (!Editor || !Editor._ace) return function(){};
      var handler = function() {
        cb(Editor._ace.getCursorPosition());
      };
      Editor._ace.selection.on('changeCursor', handler);
      return function() { Editor._ace && Editor._ace.selection.off('changeCursor', handler); };
    },

    // Add a line decoration (highlight a line or add a gutter icon)
    addDecoration: function(pluginId, row, cssClass, type) {
      if (!Editor || !Editor._ace) return;
      type = type || 'line'; // 'line' | 'text' | 'gutter'
      var markerId = Editor._ace.session.addMarker(
        new (ace.require('ace/range').Range)(row, 0, row, Infinity),
        cssClass,
        type
      );
      if (!_decorations[pluginId]) _decorations[pluginId] = [];
      _decorations[pluginId].push(markerId);
      return markerId;
    },

    clearDecorations: function(pluginId) {
      if (!Editor || !Editor._ace) return;
      (_decorations[pluginId] || []).forEach(function(id) {
        Editor._ace.session.removeMarker(id);
      });
      _decorations[pluginId] = [];
    },

    // Set squiggly annotations
    setAnnotations: function(annotations) {
      // annotations: [{ row, column, text, type: 'error'|'warning'|'info' }]
      if (!Editor || !Editor._ace) return;
      Editor._ace.session.setAnnotations(annotations);
    },

    clearAnnotations: function() {
      if (!Editor || !Editor._ace) return;
      Editor._ace.session.clearAnnotations();
    },
  };

  // ─── Workspace (all files) ─────────────────────────────────────────────────

  var workspace = {
    getAll:    function() { return AppState.files.slice(); },
    getActive: function() { return getActiveFile(); },

    create: function(name, content) {
      var f = createFileObject(name, content || '');
      AppState.files.push(f);
      AppState.activeFileId = f.id;
      if (Editor) Editor.loadFile(f);
      saveToStorage();
      EventBus.emit(Events.FILE_CREATED, { file: f });
      return f;
    },

    read: function(id) {
      var f = AppState.files.filter(function(x) { return x.id === id; })[0];
      return f ? f.content : null;
    },

    write: function(id, content) {
      var f = AppState.files.filter(function(x) { return x.id === id; })[0];
      if (!f) return false;
      f.content    = content;
      f.modifiedAt = Date.now();
      // If it's the active file, update Ace too
      if (id === AppState.activeFileId && Editor && Editor._ace) {
        Editor._ace.setValue(content, -1);
      }
      saveToStorage();
      return true;
    },

    delete: function(id) {
      AppState.files = AppState.files.filter(function(f) { return f.id !== id; });
      saveToStorage();
      EventBus.emit(Events.FILE_DELETED, { id: id });
    },
  };

  // ─── Hooks ─────────────────────────────────────────────────────────────────

  var hooks = {
    onSave:     function(cb) { return EventBus.on('file:saved',         cb); },
    onFileOpen: function(cb) { return EventBus.on(Events.FILE_SWITCHED, cb); },
    onRun:      function(cb) { return EventBus.on('runner:before-run',  cb); },
    onPluginInstalled: function(cb) { return EventBus.on(Events.PLUGIN_INSTALLED, cb); },
    onThemeChange:     function(cb) { return EventBus.on('theme:changed',         cb); },
  };

  // ─── Panels ────────────────────────────────────────────────────────────────

  var panels = {
    add: function(config) {
      if (!config || !config.id || !config.render) return;
      _registeredPanels[config.id] = config;
      if (typeof PanelSystem !== 'undefined') PanelSystem.register(config);
      return config.id;
    },
    remove:    function(id) { delete _registeredPanels[id]; if (typeof PanelSystem !== 'undefined') PanelSystem.unregister(id); },
    show:      function(id) { if (typeof PanelSystem !== 'undefined') PanelSystem.show(id); },
    hide:      function(id) { if (typeof PanelSystem !== 'undefined') PanelSystem.hide(id); },
    getActive: function()   { return typeof PanelSystem !== 'undefined' ? PanelSystem.getActive() : null; },
    toggle:    function(id) { if (typeof PanelSystem !== 'undefined') PanelSystem.toggle(id); },
  };

  // ─── Status Bar ────────────────────────────────────────────────────────────

  var statusBar = {
    add: function(cfg) {
      if (!cfg || !cfg.id) return;
      _registeredStatus[cfg.id] = cfg;
      _renderStatusItem(cfg);
    },
    remove: function(id) {
      delete _registeredStatus[id];
      var el = document.getElementById('status-plugin-' + id);
      if (el) el.remove();
    },
    update: function(id, updates) {
      if (!_registeredStatus[id]) return;
      Object.assign(_registeredStatus[id], updates);
      var el = document.getElementById('status-plugin-' + id);
      if (!el) return;
      if (updates.text !== undefined) { var tx = el.querySelector('.si-text'); if (tx) tx.textContent = updates.text; }
    },
  };

  function _renderStatusItem(cfg) {
    var bar = document.getElementById('status-bar');
    if (!bar) return;
    var el   = document.createElement('span');
    el.id    = 'status-plugin-' + cfg.id;
    el.className = 'status-item status-plugin-item' + (cfg.position === 'right' ? ' si-right' : '');
    el.title = cfg.tooltip || '';
    if (cfg.onClick) { el.style.cursor = 'pointer'; el.addEventListener('click', cfg.onClick); }
    if (cfg.icon) { var ic = document.createElement('span'); ic.className = 'si-icon'; ic.innerHTML = cfg.icon; el.appendChild(ic); }
    if (cfg.text) { var tx = document.createElement('span'); tx.className = 'si-text'; tx.textContent = cfg.text; el.appendChild(tx); }
    var anchor = bar.querySelector('.status-plugin-anchor');
    if (anchor) bar.insertBefore(el, anchor); else bar.appendChild(el);
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  var ui = {
    toast: function(msg, type) { if (UI && UI.toast) UI.toast(msg, type || 'info'); },

    showNotification: function(config) {
      // config: { id, title, message, type, actions: [{label, onClick}] }
      NotificationCenter && NotificationCenter.show(config);
    },

    addMenuItem: function(cmd) {
      if (typeof CommandPalette !== 'undefined') CommandPalette.register(cmd);
    },

    openModal: function(config) {
      var overlay = document.getElementById('modal-overlay');
      var modal   = document.getElementById('modal');
      if (!overlay || !modal) return;
      modal.innerHTML =
        '<div class="modal-header"><span class="modal-title">' + (config.title||'') + '</span>' +
        '<button id="modal-close-btn" class="modal-close">' + Icons.getUI('close') + '</button></div>' +
        '<div class="modal-body">' + (config.body||'') + '</div>' +
        '<div class="modal-footer">' +
        '<button id="modal-cancel" class="btn-sm">Cancel</button>' +
        '<button id="modal-confirm" class="btn-sm btn-primary-sm">' + (config.confirmLabel||'OK') + '</button></div>';
      overlay.classList.remove('hidden');
      document.getElementById('modal-confirm').onclick = function() { overlay.classList.add('hidden'); if (config.onConfirm) config.onConfirm(modal); };
      document.getElementById('modal-cancel').onclick  = function() { overlay.classList.add('hidden'); if (config.onCancel) config.onCancel(); };
      document.getElementById('modal-close-btn').onclick = function() { overlay.classList.add('hidden'); };
    },
  };

  // ─── Theme ─────────────────────────────────────────────────────────────────

  var theme = {
    getVar: function(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); },
    setVar: function(name, val) { document.documentElement.style.setProperty(name, val); },
    setAce: function(key) { if (Editor) Editor.setTheme(key); },
    reset:  function(name) { document.documentElement.style.removeProperty(name); },
  };

  // ─── Settings ──────────────────────────────────────────────────────────────

  var settings = {
    register: function(cfg) { EventBus.emit('settings:registered', { config: cfg }); },
    get:  function(pluginId, key) {
      try { var v = JSON.parse(localStorage.getItem('codex:setting:' + pluginId + ':' + key)); return v !== null ? v : undefined; } catch(e) { return undefined; }
    },
    set:  function(pluginId, key, val) {
      localStorage.setItem('codex:setting:' + pluginId + ':' + key, JSON.stringify(val));
    },
  };

  // ─── Storage ───────────────────────────────────────────────────────────────

  var storage = {
    get:    function(pluginId, key)      { try { return JSON.parse(localStorage.getItem('codex:plugin:' + pluginId + ':' + key)); } catch(e){ return null; } },
    set:    function(pluginId, key, val) { try { localStorage.setItem('codex:plugin:' + pluginId + ':' + key, JSON.stringify(val)); } catch(e){} },
    remove: function(pluginId, key)      { localStorage.removeItem('codex:plugin:' + pluginId + ':' + key); },
    getAll: function(pluginId) {
      var result = {};
      var prefix = 'codex:plugin:' + pluginId + ':';
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          try { result[k.slice(prefix.length)] = JSON.parse(localStorage.getItem(k)); } catch(e){}
        }
      }
      return result;
    },
  };

  // ─── Network ───────────────────────────────────────────────────────────────

  var net = {
    fetch: function(url, opts) { return window.fetch(url, opts || {}); },
  };

  // ─── Create scoped API per plugin ──────────────────────────────────────────

  function createFor(pluginId) {
    return {
      id:        pluginId,
      editor:    editor,
      workspace: workspace,
      hooks:     hooks,
      panels:    panels,
      statusBar: statusBar,
      ui:        ui,
      theme:     theme,
      settings: {
        register: function(cfg) { cfg.pluginId = pluginId; settings.register(cfg); },
        get:      function(k)   { return settings.get(pluginId, k); },
        set:      function(k,v) { settings.set(pluginId, k, v); },
      },
      storage: {
        get:    function(k)   { return storage.get(pluginId, k); },
        set:    function(k,v) { storage.set(pluginId, k, v); },
        remove: function(k)   { storage.remove(pluginId, k); },
        getAll: function()    { return storage.getAll(pluginId); },
      },
      net:    net,
      on:     function(e, cb) { return EventBus.on(e, cb); },
      off:    function(e, cb) { EventBus.off(e, cb); },
      emit:   function(e, d)  { EventBus.emit(e, d); },
      Events: Events,
      // Convenience: ace Range class for decorations
      Range:  function(r1,c1,r2,c2) { return new (ace.require('ace/range').Range)(r1,c1,r2,c2); },
    };
  }

  return {
    createFor: createFor,
    panels: panels, statusBar: statusBar, editor: editor,
    workspace: workspace, ui: ui, theme: theme,
    settings: settings, storage: storage, hooks: hooks, net: net,
    on: function(e,cb) { return EventBus.on(e,cb); },
    off: function(e,cb) { EventBus.off(e,cb); },
  };

})();
