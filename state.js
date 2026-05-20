/**
 * state.js — Single Source of Truth
 */

var WELCOME_CONTENT = [
  '/**',
  ' * Welcome to CodeX Editor v12.4 🚀',
  ' * Ace-powered. VSCode-inspired. Mobile-first.',
  ' *',
  ' * Quick start:',
  ' *   - Ctrl+P        → Command Palette',
  ' *   - Ctrl+F        → Find & Replace',
  ' *   - Ctrl+Shift+E  → Export as ZIP',
  ' *   - AI Panel      → Ask Claude/Groq/Gemini to build anything',
  ' */',
  '',
  'function greet(name) {',
  '  const msg = `Hello, ${name}! CodeX is ready.`;',
  '  console.log(msg);',
  '  return msg;',
  '}',
  '',
  'greet("Developer");',
].join('\n');

var STORAGE_KEYS = {
  files:       'codex:files',
  activeFile:  'codex:activeFile',
  plugins:     'codex:plugins',
  sidebar:     'codex:sidebar',
  panel:       'codex:panel',
  editorPrefs: 'codex:editor',
  previewOpen: 'codex:preview',
  changelog:   'codex:changelog',
};

var AppState = {
  activeFileId:  null,
  files:         [],
  sidebarOpen:   true,
  activePanel:   'explorer',
  previewOpen:   false,
  consoleOpen:   false,

  plugins: {
    appProperties: null,
    fileIcons:     null,
    uiIcons:       null,
  },

  editor: {
    fontSize:       14,
    tabSize:        4,
    theme:          'monokai',
    language:       'javascript',
    wordWrap:       false,
    lineNumbers:    true,
    minimap:        false,
    fontFamily:     '',
    showInvisibles: false,
    autoFormat:     false,
    aiSuggest:      false,
  },

  _runtime: {
    cursorLine: 1,
    cursorCol:  1,
  },
};

function createFileObject(name, content) {
  return {
    id:         'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name:       name || 'untitled.js',
    content:    content !== undefined ? content : '',
    createdAt:  Date.now(),
    modifiedAt: Date.now(),
    path:       name || 'untitled.js',
  };
}

function getActiveFile() {
  for (var i = 0; i < AppState.files.length; i++) {
    if (AppState.files[i].id === AppState.activeFileId) return AppState.files[i];
  }
  return null;
}

function updateActiveFileContent(content) {
  var file = getActiveFile();
  if (!file) return;
  file.content    = content;
  file.modifiedAt = Date.now();
}

var _saveTimer = null;
function saveToStorage() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    try {
      localStorage.setItem(STORAGE_KEYS.files,       JSON.stringify(AppState.files));
      localStorage.setItem(STORAGE_KEYS.activeFile,  AppState.activeFileId || '');
      localStorage.setItem(STORAGE_KEYS.plugins,     JSON.stringify(AppState.plugins));
      localStorage.setItem(STORAGE_KEYS.sidebar,     String(AppState.sidebarOpen));
      localStorage.setItem(STORAGE_KEYS.panel,       AppState.activePanel);
      localStorage.setItem(STORAGE_KEYS.editorPrefs, JSON.stringify(AppState.editor));
      localStorage.setItem(STORAGE_KEYS.previewOpen, String(AppState.previewOpen));
    } catch (e) { console.warn('[State] Save failed:', e); }
  }, 400);
}

function loadFromStorage() {
  try {
    var files = JSON.parse(localStorage.getItem(STORAGE_KEYS.files));
    AppState.files = (Array.isArray(files) && files.length > 0)
      ? files
      : [createFileObject('welcome.js', WELCOME_CONTENT)];

    var activeId = localStorage.getItem(STORAGE_KEYS.activeFile);
    var found    = AppState.files.filter(function(f) { return f.id === activeId; })[0];
    AppState.activeFileId = found ? activeId : AppState.files[0].id;

    var plugins = JSON.parse(localStorage.getItem(STORAGE_KEYS.plugins));
    if (plugins && typeof plugins === 'object') Object.assign(AppState.plugins, plugins);

    var sidebar = localStorage.getItem(STORAGE_KEYS.sidebar);
    if (sidebar !== null) AppState.sidebarOpen = sidebar === 'true';

    var panel = localStorage.getItem(STORAGE_KEYS.panel);
    if (panel) AppState.activePanel = panel;

    // Load editor prefs — merge so new keys get defaults
    var ed = JSON.parse(localStorage.getItem(STORAGE_KEYS.editorPrefs));
    if (ed && typeof ed === 'object') {
      Object.keys(ed).forEach(function(k) { AppState.editor[k] = ed[k]; });
    }

  } catch (e) {
    console.warn('[State] Restore failed:', e);
    AppState.files        = [createFileObject('welcome.js', WELCOME_CONTENT)];
    AppState.activeFileId = AppState.files[0].id;
  }
}
