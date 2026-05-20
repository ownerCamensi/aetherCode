/**
 * formatter.js — Code Formatter via Prettier CDN
 * Loads Prettier lazily on first use (~300KB total).
 * Supports: JS, TS, JSX, HTML, CSS, SCSS, JSON, Markdown.
 */
var Formatter = (function() {

  var _loaded  = false;
  var _loading = false;

  var CDN = 'https://unpkg.com/prettier@3.3.3';

  // Which Prettier plugin handles which extensions
  var EXT_PLUGINS = {
    js:   ['babel'],
    jsx:  ['babel'],
    ts:   ['typescript'],
    tsx:  ['typescript'],
    html: ['html'],
    css:  ['postcss'],
    scss: ['postcss'],
    json: ['babel'],
    md:   ['markdown'],
  };

  var PARSERS = {
    js:'babel', jsx:'babel', ts:'typescript', tsx:'typescript',
    html:'html', css:'css', scss:'scss', json:'json', md:'markdown',
  };

  // ─── Load Prettier ────────────────────────────────────────────────────────

  function _load(cb) {
    if (_loaded) { cb(null); return; }
    if (_loading) { setTimeout(function(){ _load(cb); }, 200); return; }
    _loading = true;
    if (UI) UI.toast('Loading formatter…', 'info');

    var scripts = [
      CDN + '/standalone.js',
      CDN + '/plugins/babel.js',
      CDN + '/plugins/html.js',
      CDN + '/plugins/postcss.js',
      CDN + '/plugins/markdown.js',
      CDN + '/plugins/typescript.js',
    ];

    var loaded = 0;
    var failed = false;

    function loadNext(i) {
      if (i >= scripts.length) {
        _loaded  = true;
        _loading = false;
        cb(null);
        return;
      }
      var s     = document.createElement('script');
      s.src     = scripts[i];
      s.onload  = function() { loaded++; loadNext(i + 1); };
      s.onerror = function() {
        if (!failed) {
          failed   = true;
          _loading = false;
          cb('Prettier load failed. Check internet connection.');
        }
      };
      document.head.appendChild(s);
    }
    loadNext(0);
  }

  // ─── Format ───────────────────────────────────────────────────────────────

  function formatActive() {
    var file = getActiveFile();
    if (!file) { if (UI) UI.toast('No active file.', 'error'); return; }

    var ext    = file.name.split('.').pop().toLowerCase();
    var parser = PARSERS[ext];
    if (!parser) { if (UI) UI.toast('No formatter for .' + ext + ' files.', 'info'); return; }

    _load(function(err) {
      if (err) { if (UI) UI.toast(err, 'error'); return; }
      _format(file, parser, ext);
    });
  }

  function _format(file, parser, ext) {
    try {
      var plugins = [];
      var pluginNames = EXT_PLUGINS[ext] || [];

      // Prettier 3.x attaches plugins to the global scope with names like prettierPlugins.babel
      if (window.prettierPlugins) {
        pluginNames.forEach(function(name) {
          if (window.prettierPlugins[name]) plugins.push(window.prettierPlugins[name]);
        });
      }

      var content  = Editor && Editor.getValue ? Editor.getValue() : file.content;
      var options  = {
        parser:       parser,
        plugins:      plugins,
        semi:         true,
        singleQuote:  true,
        tabWidth:     AppState.editor.tabSize || 2,
        printWidth:   80,
        trailingComma:'es5',
      };

      // Prettier 3.x is async
      if (window.prettier && typeof window.prettier.format === 'function') {
        var result = window.prettier.format(content, options);

        // Handle both sync and async (Promise) return
        if (result && typeof result.then === 'function') {
          result.then(function(formatted) {
            _applyFormatted(file, formatted);
          }).catch(function(e) {
            if (UI) UI.toast('Format error: ' + e.message, 'error');
          });
        } else {
          _applyFormatted(file, result);
        }
      } else {
        if (UI) UI.toast('Prettier not ready.', 'error');
      }
    } catch(e) {
      if (UI) UI.toast('Format error: ' + e.message, 'error');
      console.error('[Formatter]', e);
    }
  }

  function _applyFormatted(file, formatted) {
    if (typeof formatted !== 'string') return;
    // Apply via Ace so undo works
    if (Editor && Editor._ace) {
      Editor._ace.setValue(formatted, -1);
    } else if (Editor && Editor.setValue) {
      Editor.setValue(formatted);
    }
    file.content = formatted;
    saveToStorage();
    if (UI) UI.toast('Formatted ✓', 'success');
  }

  return { formatActive:formatActive };
})();

// ─── Auto-format on save ──────────────────────────────────────────────────────
var AutoFormatter = (function() {
  var _enabled = localStorage.getItem('codex:auto-format') === 'true';

  function init() {
    EventBus.on('file:saved', function() {
      if (!_enabled) return;
      Formatter.formatActive();
    });
    // Bind Ctrl+S → emit file:saved before actual save
    window.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        EventBus.emit('file:saved', { id: AppState.activeFileId });
      }
    }, true); // capture phase — fires before FileManager's handler
  }

  function setEnabled(val) {
    _enabled = val;
    localStorage.setItem('codex:auto-format', String(val));
  }

  function isEnabled() { return _enabled; }

  return { init: init, setEnabled: setEnabled, isEnabled: isEnabled };
})();
