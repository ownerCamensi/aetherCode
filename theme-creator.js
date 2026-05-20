/**
 * theme-creator.js — Visual CSS variable editor
 * Build themes with color pickers, preview live, export as plugin JSON.
 */
var ThemeCreator = (function() {

  var VARS = [
    { key:'--bg-app',       label:'App Background',    group:'Background' },
    { key:'--bg-sidebar',   label:'Sidebar',           group:'Background' },
    { key:'--bg-tab',       label:'Tab Bar',           group:'Background' },
    { key:'--bg-tab-active',label:'Active Tab',        group:'Background' },
    { key:'--bg-activity',  label:'Activity Bar',      group:'Background' },
    { key:'--bg-input',     label:'Input Fields',      group:'Background' },
    { key:'--bg-hover',     label:'Hover',             group:'Background' },
    { key:'--bg-active',    label:'Selection/Active',  group:'Background' },
    { key:'--bg-statusbar', label:'Status Bar',        group:'Accent' },
    { key:'--accent',       label:'Accent (links/focus)', group:'Accent' },
    { key:'--accent-hover', label:'Accent Hover',      group:'Accent' },
    { key:'--text',         label:'Primary Text',      group:'Text' },
    { key:'--text-dim',     label:'Dimmed Text',       group:'Text' },
    { key:'--text-bright',  label:'Bright Text',       group:'Text' },
    { key:'--border',       label:'Border',            group:'Text' },
    { key:'--danger',       label:'Error/Danger',      group:'Status' },
    { key:'--success',      label:'Success',           group:'Status' },
    { key:'--warning',      label:'Warning',           group:'Status' },
  ];

  var ACE_THEMES = [
    'monokai','dracula','solarized_dark','nord_dark','twilight',
    'tomorrow_night','cobalt','ambiance','github','chrome',
  ];

  var _current = {}; // varName → value
  var _panelEl = null;
  var _themeName = 'My Theme';

  function init() {
    PanelSystem.register({
      id:'theme-creator', title:'Theme Creator',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm4 3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5.354 9.854l-2-2a.5.5 0 0 0-.708 0l-1 1a.5.5 0 0 0 0 .708l5 5a.5.5 0 0 0 .708 0l5-5a.5.5 0 0 0 0-.708l-1-1a.5.5 0 0 0-.708 0L8 11.5 5.354 9.854z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; _readCurrentVars(); },
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'theme-creator-open', label:'Theme: Open Theme Creator', category:'Theme', action: function() { PanelSystem.show('theme-creator'); } });
    }
  }

  function _readCurrentVars() {
    var root = document.documentElement;
    VARS.forEach(function(v) {
      _current[v.key] = getComputedStyle(root).getPropertyValue(v.key).trim();
    });
  }

  function _render(container) {
    _panelEl = container;
    _readCurrentVars();

    var groups = {};
    VARS.forEach(function(v) {
      if (!groups[v.group]) groups[v.group] = [];
      groups[v.group].push(v);
    });

    var html = '<div class="tc-panel">';
    html += '<div class="tc-header">';
    html += '<input class="tc-name-input" id="tc-name" value="' + _esc(_themeName) + '" placeholder="Theme name…">';
    html += '<select class="tc-ace-select" id="tc-ace-theme">';
    ACE_THEMES.forEach(function(t) { html += '<option value="' + t + '"' + (AppState.editor.theme === t ? ' selected' : '') + '>' + t + '</option>'; });
    html += '</select>';
    html += '</div>';

    Object.keys(groups).forEach(function(groupName) {
      html += '<div class="tc-group-label">' + groupName + '</div>';
      groups[groupName].forEach(function(v) {
        var val = _current[v.key] || '#1e1e1e';
        // Normalize to hex for color input
        var hex = _toHex(val);
        html += '<div class="tc-row">' +
                '<label class="tc-label">' + v.label + '</label>' +
                '<div class="tc-color-wrap">' +
                '<input type="color" class="tc-color" data-var="' + v.key + '" value="' + hex + '">' +
                '<input type="text" class="tc-hex" data-var="' + v.key + '" value="' + hex + '">' +
                '</div></div>';
      });
    });

    html += '<div class="tc-actions">';
    html += '<button class="btn-sm" id="tc-reset">Reset</button>';
    html += '<button class="btn-sm btn-primary-sm" id="tc-export">Export Plugin</button>';
    html += '</div></div>';

    container.innerHTML = html;
    _bindEvents(container);
  }

  function _bindEvents(container) {
    // Live preview on color change
    container.querySelectorAll('.tc-color').forEach(function(input) {
      input.addEventListener('input', function() {
        var val = input.value;
        document.documentElement.style.setProperty(input.dataset.var, val);
        _current[input.dataset.var] = val;
        var hexInput = container.querySelector('.tc-hex[data-var="' + input.dataset.var + '"]');
        if (hexInput) hexInput.value = val;
      });
    });

    container.querySelectorAll('.tc-hex').forEach(function(input) {
      input.addEventListener('change', function() {
        var val = input.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        document.documentElement.style.setProperty(input.dataset.var, val);
        _current[input.dataset.var] = val;
        var colorInput = container.querySelector('.tc-color[data-var="' + input.dataset.var + '"]');
        if (colorInput && _toHex(val)) colorInput.value = _toHex(val);
      });
    });

    var aceSelect = container.querySelector('#tc-ace-theme');
    if (aceSelect) aceSelect.addEventListener('change', function() { if (Editor) Editor.setTheme(aceSelect.value); });

    var nameInput = container.querySelector('#tc-name');
    if (nameInput) nameInput.addEventListener('input', function() { _themeName = nameInput.value; });

    var resetBtn = container.querySelector('#tc-reset');
    if (resetBtn) resetBtn.addEventListener('click', function() {
      // Remove all custom properties — restores CSS defaults
      VARS.forEach(function(v) { document.documentElement.style.removeProperty(v.key); });
      _readCurrentVars();
      if (_panelEl) _render(_panelEl);
      if (UI) UI.toast('Theme reset to default', 'info');
    });

    var exportBtn = container.querySelector('#tc-export');
    if (exportBtn) exportBtn.addEventListener('click', _exportPlugin);
  }

  function _exportPlugin() {
    var name = _themeName || 'My Theme';
    var cfg  = {};
    VARS.forEach(function(v) {
      if (_current[v.key]) cfg[v.key] = _current[v.key];
    });
    var aceSelect = document.getElementById('tc-ace-theme');
    if (aceSelect) cfg.aceTheme = aceSelect.value;
    cfg.editorTitle = 'CodeX · ' + name;

    var plugin = {
      title:       name,
      description: 'Custom theme created with CodeX Theme Creator',
      author:      'Me',
      logo:        '',
      type:        'appProperties',
      trusted:     false,
      config:      cfg,
      _cssVars:    cfg,
    };

    var json = JSON.stringify(plugin, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = name.replace(/\s+/g,'-').toLowerCase() + '-theme.json';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    if (UI) UI.toast('Theme exported: ' + a.download, 'success');
  }

  function _toHex(color) {
    if (!color) return '#1e1e1e';
    color = color.trim();
    if (color.startsWith('#') && (color.length === 4 || color.length === 7)) return color;
    // Try parsing rgb()
    var m = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (m) {
      return '#' + [m[1],m[2],m[3]].map(function(n) {
        return parseInt(n).toString(16).padStart(2,'0');
      }).join('');
    }
    return color.startsWith('#') ? color : '#1e1e1e';
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init: init };
})();
