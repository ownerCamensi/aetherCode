/**
 * keybindings.js — Custom keybinding remapper
 */
var Keybindings = (function() {

  var STORAGE_KEY = 'codex:keybindings';
  var _bindings   = {};
  var _panelEl    = null;

  var DEFAULTS = [
    { id:'save',         label:'Save File',            key:'Ctrl+S',       action: function(){ if(FileManager) FileManager.saveActive(); } },
    { id:'run',          label:'Run Preview',           key:'Ctrl+Enter',   action: function(){ if(Runner) Runner.run(); } },
    { id:'find',         label:'Find in File',          key:'Ctrl+F',       action: function(){ if(FindReplace) FindReplace.open('find'); } },
    { id:'palette',      label:'Command Palette',       key:'Ctrl+P',       action: function(){ if(CommandPalette) CommandPalette.open(); } },
    { id:'new-file',     label:'New File',              key:'Ctrl+N',       action: function(){ var b=document.getElementById('btn-new-file'); if(b)b.click(); } },
    { id:'close-tab',    label:'Close Tab',             key:'Ctrl+W',       action: function(){ /* handled in tab-manager */ } },
    { id:'global-search',label:'Global Search',         key:'Ctrl+Shift+F', action: function(){ PanelSystem.show('global-search'); } },
    { id:'export',       label:'Export ZIP',            key:'Ctrl+Shift+E', action: function(){ if(ExportZip) ExportZip.exportZip(); } },
    { id:'split',        label:'Toggle Split Screen',   key:'Ctrl+Shift+\\',action: function(){ if(SplitScreen) SplitScreen.toggle(); } },
    { id:'ai-panel',     label:'Open AI Panel',         key:'Ctrl+Shift+A', action: function(){ PanelSystem.show('ai'); } },
    { id:'fold',         label:'Fold All',              key:'Ctrl+K,Ctrl+0',action: function(){ if(Editor) Editor.foldAll(); } },
    { id:'format',       label:'Format Document',       key:'Alt+Shift+F',  action: function(){ if(Formatter) Formatter.formatActive(); } },
  ];

  function init() {
    _loadCustom();
    _installGlobalListener();

    PanelSystem.register({
      id: 'keybindings', title: 'Keybindings',
      icon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-6 2A.25.25 0 0 1 6.25 10h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-8-2A.25.25 0 0 1 4.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 4 8.75v-.5zM2 8.25A.25.25 0 0 1 2.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 2 8.75v-.5zm1 2A.25.25 0 0 1 3.25 10h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5A.25.25 0 0 1 3 10.75v-.5zM2 6.25A.25.25 0 0 1 2.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 2 6.75v-.5zm2 0A.25.25 0 0 1 4.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 4 6.75v-.5zm2 0A.25.25 0 0 1 6.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 6 6.75v-.5zm2 0A.25.25 0 0 1 8.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 6.75v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'kb-open', label:'Keybindings: Open Keybinding Editor', category:'View', action: function(){ PanelSystem.show('keybindings'); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0">',
          '<div style="font-size:12px;font-weight:600;color:var(--text-bright);margin-bottom:4px">Keybindings</div>',
          '<div style="font-size:11px;color:var(--text-dim)">Click a key combo to remap it</div>',
        '</div>',
        '<div style="flex:1;overflow-y:auto">',
          DEFAULTS.map(function(kb) {
            var custom = _bindings[kb.id];
            var keyStr = custom || kb.key;
            return '<div class="kb-row" data-id="' + kb.id + '">' +
              '<span class="kb-label">' + kb.label + '</span>' +
              '<div class="kb-key-wrap">' +
                '<kbd class="kb-key" data-id="' + kb.id + '">' + _formatKey(keyStr) + '</kbd>' +
                (custom ? '<button class="kb-reset" data-id="' + kb.id + '" title="Reset to default">↩</button>' : '') +
              '</div>' +
            '</div>';
          }).join(''),
          '<div style="padding:12px;border-top:1px solid #1a1a1a;margin-top:8px">',
            '<button id="kb-reset-all" class="btn-sm btn-danger" style="width:100%">Reset All to Defaults</button>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelectorAll('.kb-key').forEach(function(kbd) {
      kbd.addEventListener('click', function() { _captureKey(kbd.dataset.id, kbd, container); });
    });

    container.querySelectorAll('.kb-reset').forEach(function(btn) {
      btn.addEventListener('click', function() { delete _bindings[btn.dataset.id]; _saveCustom(); _render(container); });
    });

    var resetAllBtn = container.querySelector('#kb-reset-all');
    if (resetAllBtn) resetAllBtn.addEventListener('click', function() {
      _bindings = {}; _saveCustom(); _render(container);
      if (UI) UI.toast('Keybindings reset to defaults', 'info');
    });
  }

  function _captureKey(id, kbd, container) {
    kbd.textContent = 'Press keys…';
    kbd.style.background = 'rgba(0,122,204,.2)';
    kbd.style.borderColor = 'var(--accent)';

    function onKey(e) {
      e.preventDefault(); e.stopPropagation();
      var parts = [];
      if (e.ctrlKey||e.metaKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      var key = e.key;
      if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return;
      if (key === 'Escape') { cleanup(); _render(container); return; }
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      var combo = parts.join('+');
      _bindings[id] = combo;
      _saveCustom();
      cleanup();
      _render(container);
      if (UI) UI.toast('Keybinding set: ' + combo, 'success');
    }

    function cleanup() { window.removeEventListener('keydown', onKey, true); }
    window.addEventListener('keydown', onKey, true);
    setTimeout(cleanup, 5000); // timeout after 5s
  }

  function _installGlobalListener() {
    window.addEventListener('keydown', function(e) {
      if (!e.key) return;
      var combo = _buildCombo(e);
      // Check custom bindings first, then defaults
      var binding = DEFAULTS.filter(function(kb) { return (_bindings[kb.id]||kb.key) === combo; })[0];
      if (binding) { e.preventDefault(); try { binding.action(); } catch(err) {} }
    });
  }

  function _buildCombo(e) {
    var parts = [];
    if (e.ctrlKey||e.metaKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    var key = e.key;
    if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }
    return parts.join('+');
  }

  function _formatKey(k) { return k.replace(/\+/g,' + ').replace('Ctrl','⌘ Ctrl'); }
  function _loadCustom() { try { _bindings = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch(e) { _bindings={}; } }
  function _saveCustom() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_bindings)); } catch(e) {} }

  return { init };
})();
