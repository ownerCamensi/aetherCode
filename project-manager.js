/**
 * project-manager.js — Multi-project support
 * Each project has its own files, settings, and localStorage slot.
 */
var ProjectManager = (function() {

  var PROJECTS_KEY = 'codex:projects';
  var ACTIVE_KEY   = 'codex:active-project';
  var _projects    = [];
  var _activeId    = null;
  var _panelEl     = null;

  function init() {
    _load();
    // Register "current" project if none exist
    if (_projects.length === 0) {
      var defaultProject = {
        id:        'project_' + Date.now(),
        name:      'My Project',
        created:   Date.now(),
        modified:  Date.now(),
        fileCount: AppState.files.length,
        color:     '#007acc',
      };
      _projects.push(defaultProject);
      _activeId = defaultProject.id;
      _save();
    }

    PanelSystem.register({
      id: 'projects', title: 'Projects',
      icon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M.54 3.87L.5 3a2 2 0 0 1 2-2h3.19a2 2 0 0 1 1.45.63l.29.32H14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-1.49l.54-4.44v-1zm.62 4.48L.98 12.6a.5.5 0 0 0 .5.6h13a.5.5 0 0 0 .5-.5V5a.5.5 0 0 0-.5-.5H9.17a2 2 0 0 1-1.45-.63l-.29-.32H2.5a2 2 0 0 0-2 1.8z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; _syncCurrentProject(); },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'pm-open',   label:'Projects: Open Project Manager', category:'File', action: function(){ PanelSystem.show('projects'); } });
      CommandPalette.register({ id:'pm-new',    label:'Projects: New Project',          category:'File', action: _newProject });
      CommandPalette.register({ id:'pm-switch', label:'Projects: Switch Project',        category:'File', action: _showSwitcher });
    }
  }

  function _render(container) {
    _panelEl = container;
    _syncCurrentProject();

    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:10px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;display:flex;gap:6px;align-items:center;flex-shrink:0">',
          '<span style="font-size:12px;font-weight:600;color:var(--text-bright);flex:1">Projects</span>',
          '<button class="btn-sm btn-primary-sm" id="pm-new-btn" style="font-size:11px;padding:3px 10px">+ New</button>',
        '</div>',
        '<div style="flex:1;overflow-y:auto;padding:8px">',
          _projects.map(function(p) {
            var isActive = p.id === _activeId;
            return '<div class="pm-card' + (isActive ? ' pm-card-active' : '') + '" data-id="' + p.id + '">' +
              '<div class="pm-color" style="background:' + (p.color||'#007acc') + '"></div>' +
              '<div class="pm-info">' +
                '<div class="pm-name">' + _esc(p.name) + (isActive ? ' <span class="pm-active-badge">Active</span>' : '') + '</div>' +
                '<div class="pm-meta">' + (p.fileCount||0) + ' files · ' + _timeAgo(p.modified) + '</div>' +
              '</div>' +
              '<div class="pm-actions">' +
                (!isActive ? '<button class="pm-open-btn" data-id="' + p.id + '">Open</button>' : '') +
                '<button class="pm-rename-btn" data-id="' + p.id + '" title="Rename">✏️</button>' +
                (!isActive ? '<button class="pm-delete-btn" data-id="' + p.id + '" title="Delete">🗑</button>' : '') +
              '</div>' +
            '</div>';
          }).join('') ||
          '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">No projects yet.</div>',
        '</div>',
        '<div style="padding:8px 12px;border-top:1px solid #1a1a1a;font-size:11px;color:var(--text-dim)">',
          'Active: <strong style="color:var(--text)">' + _esc((_projects.filter(function(p){return p.id===_activeId;})[0]||{}).name||'None') + '</strong>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelector('#pm-new-btn').addEventListener('click', _newProject);

    container.querySelectorAll('.pm-open-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _switchTo(btn.dataset.id); });
    });
    container.querySelectorAll('.pm-rename-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _renameProject(btn.dataset.id); });
    });
    container.querySelectorAll('.pm-delete-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteProject(btn.dataset.id); });
    });
  }

  function _syncCurrentProject() {
    var active = _projects.filter(function(p){ return p.id === _activeId; })[0];
    if (active) { active.fileCount = AppState.files.length; active.modified = Date.now(); _save(); }
  }

  function _newProject() {
    var name = prompt('Project name:', 'New Project');
    if (!name) return;
    // Save current project first
    _saveCurrentProjectFiles();
    var p = { id:'project_'+Date.now(), name:name.trim(), created:Date.now(), modified:Date.now(), fileCount:1, color:_randomColor() };
    _projects.push(p);
    _switchTo(p.id, true);
  }

  function _switchTo(id, isNew) {
    if (id === _activeId && !isNew) return;
    // Save current project
    _saveCurrentProjectFiles();
    _activeId = id;
    // Load new project's files
    var filesKey = 'codex:project-files:' + id;
    try {
      var saved = JSON.parse(localStorage.getItem(filesKey) || 'null');
      if (saved && saved.length > 0) {
        AppState.files = saved;
      } else {
        AppState.files = [createFileObject('index.html', '<!DOCTYPE html>\n<html>\n<head><title>' + (_projects.filter(function(p){return p.id===id;})[0]||{}).name + '</title></head>\n<body>\n\n</body>\n</html>')];
      }
      AppState.activeFileId = AppState.files[0].id;
      saveToStorage(); // also saves to main slot
    } catch(e) {}
    _save();
    if (Editor) Editor.loadFile(AppState.files[0]);
    if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
    if (typeof TabManager !== 'undefined') TabManager.render();
    if (UI) UI.toast('Switched to: ' + ((_projects.filter(function(p){return p.id===id;})[0])||{}).name, 'success');
    if (_panelEl) _render(_panelEl);
  }

  function _saveCurrentProjectFiles() {
    if (!_activeId) return;
    try { localStorage.setItem('codex:project-files:' + _activeId, JSON.stringify(AppState.files)); } catch(e) {}
  }

  function _renameProject(id) {
    var p = _projects.filter(function(x){ return x.id === id; })[0]; if (!p) return;
    var name = prompt('Rename project:', p.name);
    if (name && name.trim()) { p.name = name.trim(); _save(); if (_panelEl) _render(_panelEl); }
  }

  function _deleteProject(id) {
    if (!confirm('Delete this project and all its files?')) return;
    _projects = _projects.filter(function(p){ return p.id !== id; });
    try { localStorage.removeItem('codex:project-files:' + id); } catch(e) {}
    _save();
    if (_panelEl) _render(_panelEl);
  }

  function _showSwitcher() {
    PanelSystem.show('projects');
  }

  function _randomColor() {
    var colors = ['#007acc','#e94560','#3fb950','#cca700','#7c3aed','#ff7000','#20b2aa'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function _load()  { try { _projects = JSON.parse(localStorage.getItem(PROJECTS_KEY)||'[]'); _activeId = localStorage.getItem(ACTIVE_KEY)||null; } catch(e) { _projects=[]; } }
  function _save()  { try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(_projects)); localStorage.setItem(ACTIVE_KEY, _activeId||''); } catch(e) {} }
  function _timeAgo(ts) { var s=Math.floor((Date.now()-ts)/1000); if(s<60)return'just now'; if(s<3600)return Math.floor(s/60)+'m ago'; if(s<86400)return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
