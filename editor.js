/**
 * editor.js — Ace Editor wrapper v3
 *
 * OFFLINE-FIRST: Uses local ace/ folder.
 * If local files missing → falls back to CDN automatically.
 *
 * ACE FEATURES ENABLED:
 *   ✅ Language tools      — autocomplete, snippets
 *   ✅ Emmet               — HTML/CSS abbreviation expansion
 *   ✅ Search box          — built-in Ctrl+F overlay
 *   ✅ Fold/Unfold         — code folding
 *   ✅ Multi-cursor        — Ctrl+click for multiple cursors
 *   ✅ Live autocomplete   — triggers as you type
 *   ✅ Bracket matching    — highlights matching brackets
 *   ✅ Indent guides       — vertical indent lines
 *   ✅ Scrollpast end      — scroll past last line
 *   ✅ Custom keybindings  — Emmet tab expand
 *   ✅ Word wrap           — session.setUseWrapMode()
 *   ✅ Syntax workers OFF  — no CORS errors for local files
 */

var Editor = (function() {

  var _ace          = null;
  var _ignoreChange = false;
  var _emmetReady   = false;

  // CDN fallback (only used if local ace/ folder is empty)
  var ACE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.0/';

  var MODES = {
    js:'ace/mode/javascript', ts:'ace/mode/typescript', jsx:'ace/mode/jsx',
    tsx:'ace/mode/tsx', html:'ace/mode/html', css:'ace/mode/css',
    scss:'ace/mode/scss', less:'ace/mode/less', json:'ace/mode/json',
    md:'ace/mode/markdown', py:'ace/mode/python', java:'ace/mode/java',
    c:'ace/mode/c_cpp', cpp:'ace/mode/c_cpp', rs:'ace/mode/rust',
    go:'ace/mode/golang', sh:'ace/mode/sh', bash:'ace/mode/sh',
    xml:'ace/mode/xml', sql:'ace/mode/sql', php:'ace/mode/php',
    rb:'ace/mode/ruby', txt:'ace/mode/text', yaml:'ace/mode/yaml',
    yml:'ace/mode/yaml', toml:'ace/mode/toml', vue:'ace/mode/html',
    svelte:'ace/mode/html', kt:'ace/mode/kotlin', swift:'ace/mode/swift',
    dart:'ace/mode/dart', r:'ace/mode/r', lua:'ace/mode/lua',
    dockerfile:'ace/mode/dockerfile', graphql:'ace/mode/graphqlschema',
    cs:'ace/mode/csharp', coffee:'ace/mode/coffee', perl:'ace/mode/perl',
    haskell:'ace/mode/haskell', elixir:'ace/mode/elixir',
  };

  var THEMES = {
    monokai:      'ace/theme/monokai',
    dracula:      'ace/theme/dracula',
    solarized:    'ace/theme/solarized_dark',
    nord:         'ace/theme/nord_dark',
    github:       'ace/theme/github',
    chrome:       'ace/theme/chrome',
    twilight:     'ace/theme/twilight',
    tomorrow:     'ace/theme/tomorrow_night',
    cobalt:       'ace/theme/cobalt',
    ambiance:     'ace/theme/ambiance',
    one_dark:     'ace/theme/one_dark',
    gruvbox:      'ace/theme/gruvbox',
    tomorrow_night_eighties: 'ace/theme/tomorrow_night_eighties',
    cloud9_day:   'ace/theme/cloud9_day',
    cloud9_night: 'ace/theme/cloud9_night',
    terminal:     'ace/theme/terminal',
    eclipse:      'ace/theme/eclipse',
    xcode:        'ace/theme/xcode',
  };

  function init() {
    // On HTTPS/production always use CDN basePath so Ace can load modes/themes
    // On localhost use local ace/ folder if available
    var isHttps = location.protocol === 'https:';
    if (isHttps) {
      ace.config.set('basePath', ACE_CDN);
    } else {
      ace.config.set('basePath', 'ace/');
    }

    _ace = ace.edit('ace-editor');
    Editor._ace = _ace;

    var savedTheme  = AppState.editor.theme  || 'monokai';
    var savedFS     = AppState.editor.fontSize  || 14;
    var savedWrap   = AppState.editor.wordWrap  === true;
    var savedGutter = AppState.editor.lineNumbers !== false;
    var savedTab    = AppState.editor.tabSize   || 4;
    var savedInvis  = AppState.editor.showInvisibles || false;

    _ace.setOptions({
      theme:                       THEMES[savedTheme] || THEMES.monokai,
      fontSize:                    savedFS + 'px',
      fontFamily:                  _getFontFamily(),
      tabSize:                     savedTab,
      useSoftTabs:                 true,
      showPrintMargin:             false,
      displayIndentGuides:         true,
      // Language tools — autocomplete + snippets
      enableBasicAutocompletion:   true,
      enableLiveAutocompletion:    true,
      enableSnippets:              true,
      // enableEmmet set AFTER emmet-core loads to avoid warning
      // Editing features
      wrap:                        savedWrap,
      highlightActiveLine:         true,
      highlightSelectedWord:       true,
      animatedScroll:              true,
      scrollPastEnd:               0.5,         // scroll half a screen past end
      showFoldWidgets:             true,
      fadeFoldWidgets:             true,
      showGutter:                  savedGutter,
      showInvisibles:              savedInvis,
      behavioursEnabled:           true,         // auto-pair brackets/quotes
      wrapBehavioursEnabled:       true,         // auto-indent on wrap
      mergeUndoDeltas:             'always',
      // Cursor
      cursorStyle:                 'ace',        // 'ace'|'slim'|'smooth'|'wide'
      // Accessibility
      enableMultiselect:           true,         // Ctrl+click multi-cursor
      // Scroll
      vScrollBarAlwaysVisible:     false,
      hScrollBarAlwaysVisible:     false,
    });

    _ace.renderer.setScrollMargin(8, 8, 0, 0);
    _ace.renderer.setPadding(12);

    // Set word wrap via session API (more reliable than setOption)
    _ace.session.setUseWrapMode(savedWrap);

    // Load Emmet async after Ace is ready
    _loadEmmet();

    // Cursor → status bar
    _ace.selection.on('changeCursor', function() {
      var pos = _ace.getCursorPosition();
      if (UI && UI.updateStatusCursor) UI.updateStatusCursor(pos.row + 1, pos.column + 1);
    });

    // Content change → save + notify
    _ace.on('change', function() {
      if (_ignoreChange) return;
      updateActiveFileContent(_ace.getValue());
      saveToStorage();
      if (typeof EventBus !== 'undefined') EventBus.emit('editor:change', {});
    });

    // Tab → expand Emmet abbreviation if available, else indent
    _ace.commands.addCommand({
      name:    'emmetOrIndent',
      bindKey: { win: 'Tab', mac: 'Tab' },
      exec:    function(editor) {
        if (_emmetReady) {
          try {
            var emmetExt = ace.require('ace/ext/emmet');
            if (emmetExt && emmetExt.expandAbbreviation) {
              var expanded = emmetExt.expandAbbreviation(editor);
              if (expanded) return;
            }
          } catch(e) {}
        }
        // Fallback: try built-in expander then indent
        if (!_expandBuiltin()) editor.indent();
      },
    });

    EventBus.on(Events.FILE_SWITCHED, function(data) { _loadFile(data.file); });
  }

  function _getFontFamily() {
    var ff = AppState.editor.fontFamily;
    if (ff) return '"' + ff + '","JetBrains Mono","Fira Code",monospace';
    return '"JetBrains Mono","Fira Code","Cascadia Code","Consolas",monospace';
  }

  // ─── Emmet loading (correct sequence, no warning) ──────────────────────────
  function _loadEmmet() {
    // Load emmet core from jsDelivr (reliable)
    var s1 = document.createElement('script');
    s1.src = 'https://cdn.jsdelivr.net/npm/emmet@2.4.7/dist/emmet.min.js';
    s1.onload = function() {
      // Then load Ace's emmet bridge
      var s2 = document.createElement('script');
      // Try local first
      s2.src = 'ace/ext-emmet.js';
      s2.onerror = function() {
        // Local not found → try CDN
        var s3 = document.createElement('script');
        s3.src = ACE_CDN + 'ext-emmet.js';
        s3.onload = _initEmmetBridge;
        s3.onerror = function() { console.log('[Emmet] CDN not available — using built-in fallback'); };
        document.head.appendChild(s3);
      };
      s2.onload = _initEmmetBridge;
      document.head.appendChild(s2);
    };
    s1.onerror = function() {
      console.log('[Emmet] Core not loaded (offline?) — using built-in fallback');
    };
    document.head.appendChild(s1);
  }

  function _initEmmetBridge() {
    try {
      var emmetExt  = ace.require('ace/ext/emmet');
      var emmetCore = window.emmet;
      if (emmetExt && emmetCore) {
        if (emmetExt.setCore) emmetExt.setCore(emmetCore);
        if (_ace) _ace.setOption('enableEmmet', true);
        _emmetReady = true;
        console.log('[Emmet] Ready ✓');
      }
    } catch(e) {
      console.log('[Emmet] Bridge failed (non-critical):', e.message);
    }
  }

  // Built-in abbreviation expander (works offline without Emmet)
  function _expandBuiltin() {
    if (!_ace) return false;
    var cursor = _ace.getCursorPosition();
    var line   = _ace.session.getLine(cursor.row);
    var before = line.slice(0, cursor.column);
    var match  = before.match(/([\w#.*>+\[\]{}:^~-]+)$/);
    if (!match || match[1].length < 2) return false;
    var abbr     = match[1];
    var expanded = _parseAbbr(abbr);
    if (!expanded) return false;
    var Range  = ace.require('ace/range').Range;
    var start  = { row: cursor.row, column: cursor.column - abbr.length };
    _ace.session.replace(new Range(start.row, start.column, cursor.row, cursor.column), expanded);
    _ace.focus();
    return true;
  }

  function _parseAbbr(abbr) {
    var shortcuts = {
      '!':     '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>Document</title>\n</head>\n<body>\n\t\n</body>\n</html>',
      'html5': '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>Document</title>\n</head>\n<body>\n\t\n</body>\n</html>',
    };
    if (shortcuts[abbr]) return shortcuts[abbr];
    try { return _buildTag(abbr); } catch(e) { return null; }
  }

  function _buildTag(abbr) {
    if (abbr.indexOf('>') !== -1) {
      var parts = abbr.split('>'), inner = _buildTag(parts.slice(1).join('>'));
      return _wrap(parts[0], inner);
    }
    var star = abbr.indexOf('*');
    if (star !== -1) {
      var count = parseInt(abbr.slice(star + 1)) || 1, base = abbr.slice(0, star);
      var out = ''; for (var i = 0; i < count; i++) out += _single(base) + '\n';
      return out.trimRight();
    }
    return _single(abbr);
  }

  function _single(abbr) {
    var tag = 'div', cls = [], id = '', rest = abbr;
    var tm = rest.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (tm) { tag = tm[1]; rest = rest.slice(tag.length); }
    rest.split(/(?=[#.])/).forEach(function(p) {
      if (p.startsWith('#')) id = p.slice(1);
      else if (p.startsWith('.')) cls.push(p.slice(1));
    });
    var attrs = (id ? ' id="' + id + '"' : '') + (cls.length ? ' class="' + cls.join(' ') + '"' : '');
    var self = ['br','hr','img','input','meta','link','area','base','col','embed','param','source','track','wbr'];
    if (self.indexOf(tag) !== -1) return '<' + tag + attrs + '>';
    return '<' + tag + attrs + '></' + tag + '>';
  }

  function _wrap(abbr, inner) {
    var single = _single(abbr);
    var close = single.lastIndexOf('</');
    if (close === -1) return single;
    return single.slice(0, close) + inner + single.slice(close);
  }

  function expandEmmet() {
    if (!_ace) return false;
    if (_emmetReady) {
      try {
        var emmetExt = ace.require('ace/ext/emmet');
        if (emmetExt && emmetExt.expandAbbreviation) {
          if (emmetExt.expandAbbreviation(_ace)) return true;
        }
      } catch(e) {}
    }
    return _expandBuiltin();
  }

  // ─── File loading ─────────────────────────────────────────────────────────
  function loadFile(file) { _loadFile(file); }

  function _loadFile(file) {
    if (!file || !_ace) return;
    _ignoreChange = true;
    _ace.setValue(file.content || '', -1);
    _setMode(file.name);
    _ace.session.setUseWorker(false); // prevent CORS worker errors
    _ace.clearSelection();
    _ignoreChange = false;
    _ace.focus();
    if (UI && UI.updateStatusFile) UI.updateStatusFile(file.name);
  }

  function _setMode(name) {
    var ext  = _ext(name);
    var mode = MODES[ext] || 'ace/mode/text';
    _ace.session.setMode(mode);
    AppState.editor.language = ext;
    if (UI && UI.updateStatusLang) UI.updateStatusLang(_langLabel(ext));
  }

  // ─── Public setters ───────────────────────────────────────────────────────
  function setTheme(key) {
    var t = THEMES[key] || ('ace/theme/' + key);
    if (_ace) _ace.setTheme(t);
    AppState.editor.theme = key;
    saveToStorage();
    // Apply theme class to body for CSS icon color overrides
    document.body.className = document.body.className.replace(/\btheme-\S+/g, '').trim();
    document.body.classList.add('theme-' + key);
    document.body.setAttribute('data-theme', key);
    // Twilight: set purple accent CSS var
    if (key === 'twilight' || key === 'tomorrow' || key === 'cobalt') {
      document.documentElement.style.setProperty('--accent', '#6e40c9');
      document.documentElement.style.setProperty('--accent-hover', '#7c52d6');
    } else {
      document.documentElement.style.removeProperty('--accent');
      document.documentElement.style.removeProperty('--accent-hover');
    }
    if (typeof EventBus !== 'undefined') EventBus.emit('theme:changed', { theme: key });
  }

  function setFontSize(n) {
    if (_ace) _ace.setFontSize(n + 'px');
    AppState.editor.fontSize = n;
    saveToStorage();
  }

  function setOption(key, val) {
    if (!_ace) return;
    if (key === 'wrap') {
      _ace.session.setUseWrapMode(val === true || val === 80 || val === '80');
      _ace.setOption('wrap', val);
    } else {
      _ace.setOption(key, val);
    }
  }

  function getValue()   { return _ace ? _ace.getValue() : ''; }
  function resize()     { if (_ace) { _ace.resize(true); } }
  function focus()      { if (_ace) _ace.focus(); }
  function foldAll()    { if (_ace) _ace.execCommand('foldall'); }
  function unfoldAll()  { if (_ace) _ace.execCommand('unfoldall'); }
  function gotoLine(n)  { if (_ace) _ace.gotoLine(n, 0, true); }

  function _ext(name)  { var p = (name||'').split('.'); return p.length > 1 ? p[p.length-1].toLowerCase() : ''; }
  function _langLabel(ext) {
    var m = { js:'JavaScript', ts:'TypeScript', jsx:'JSX', tsx:'TSX', html:'HTML', css:'CSS',
              scss:'SCSS', less:'Less', json:'JSON', md:'Markdown', py:'Python', java:'Java',
              c:'C', cpp:'C++', rs:'Rust', go:'Go', sh:'Shell', xml:'XML', sql:'SQL',
              php:'PHP', rb:'Ruby', yaml:'YAML', vue:'Vue', kt:'Kotlin', swift:'Swift',
              cs:'C#', dart:'Dart', lua:'Lua', r:'R', graphql:'GraphQL' };
    return m[ext] || 'Plain Text';
  }

  return {
    init, loadFile, setTheme, setFontSize, setOption,
    getValue, resize, focus, expandEmmet,
    foldAll, unfoldAll, gotoLine,
    get _ace() { return _ace; },
    THEMES, MODES,
  };
})();
