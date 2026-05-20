/**
 * ai-suggest.js v2 — Upgraded autocomplete system
 * - Ace built-in language_tools (snippets + keywords) always on
 * - Project-aware completions (function names, variables, file names from project)
 * - CSS property completions with value hints
 * - HTML tag/attribute completions
 * - Path completions for import statements
 */
var AISuggest = (function() {

  var _enabled = true;
  var STORAGE_KEY = 'codex:suggest-enabled';

  function init() {
    _enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
    EventBus.on(Events.APP_READY, function() { setTimeout(_setup, 800); });
    EventBus.on(Events.FILE_SWITCHED, _updateCompleter);
  }

  function _setup() {
    if (!Editor || !Editor._ace) return;
    var ace    = Editor._ace;
    var langTools = window.ace && window.ace.require && window.ace.require('ace/ext/language_tools');
    if (!langTools) return;

    // Enable built-in completers
    ace.setOptions({
      enableBasicAutocompletion:     true,
      enableSnippets:                true,
      enableLiveAutocompletion:      _enabled,
    });

    // Add our custom project-aware completer
    langTools.addCompleter(_makeProjectCompleter());
    langTools.addCompleter(_makePathCompleter());
    langTools.addCompleter(_makeCSSCompleter());
  }

  function _updateCompleter() {
    if (!Editor || !Editor._ace) return;
    Editor._ace.setOptions({
      enableLiveAutocompletion: _enabled,
    });
  }

  // Project-aware: scans all files for identifiers
  function _makeProjectCompleter() {
    return {
      getCompletions: function(editor, session, pos, prefix, callback) {
        if (!_enabled || prefix.length < 2) return callback(null, []);
        var completions = [];
        var seen = {};

        AppState.files.forEach(function(f) {
          if (f.isImage) return;
          var content = f.content || '';
          // Extract: function names, const/let/var names, class names
          var patterns = [
            /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
            /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
            /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
            /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]\s*function/g,
            /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(/g,
          ];
          patterns.forEach(function(re) {
            var m;
            while ((m = re.exec(content)) !== null) {
              var name = m[1];
              if (name && name.length > 1 && !seen[name] && name !== prefix) {
                seen[name] = true;
                completions.push({
                  caption:  name,
                  value:    name,
                  meta:     f.name,
                  score:    name.startsWith(prefix) ? 1200 : 800,
                });
              }
            }
          });
        });

        // Filter to prefix match
        completions = completions.filter(function(c) {
          return c.caption.toLowerCase().startsWith(prefix.toLowerCase());
        }).slice(0, 30);

        callback(null, completions);
      }
    };
  }

  // Path completer: triggers on import/require with ./
  function _makePathCompleter() {
    return {
      getCompletions: function(editor, session, pos, prefix, callback) {
        if (!_enabled) return callback(null, []);
        var line = session.getLine(pos.row);
        if (!/(?:import|require|from|src=|href=)/.test(line)) return callback(null, []);

        var completions = AppState.files
          .filter(function(f) { return !f.isImage && f.name !== '.gitkeep'; })
          .map(function(f) {
            return {
              caption:  './' + f.name,
              value:    './' + f.name,
              meta:     'file',
              score:    900,
            };
          })
          .filter(function(c) { return prefix.length < 1 || c.caption.includes(prefix); })
          .slice(0, 20);

        callback(null, completions);
      }
    };
  }

  // CSS completions with value hints
  function _makeCSSCompleter() {
    var CSS_PROPS = [
      { p:'display', v:['flex','grid','block','inline','inline-flex','none','contents'] },
      { p:'position', v:['relative','absolute','fixed','sticky','static'] },
      { p:'flex-direction', v:['row','column','row-reverse','column-reverse'] },
      { p:'align-items', v:['center','flex-start','flex-end','stretch','baseline'] },
      { p:'justify-content', v:['center','flex-start','flex-end','space-between','space-around','space-evenly'] },
      { p:'overflow', v:['hidden','auto','scroll','visible','clip'] },
      { p:'cursor', v:['pointer','default','text','grab','move','not-allowed'] },
      { p:'border-radius', v:['0','4px','6px','8px','12px','50%','9999px'] },
      { p:'font-weight', v:['400','500','600','700','800','bold','normal'] },
      { p:'text-align', v:['left','center','right','justify'] },
      { p:'background-color', v:['transparent','#fff','#000','rgba(0,0,0,0)'] },
      { p:'transition', v:['all .2s ease','opacity .2s','transform .2s','color .15s'] },
      { p:'animation', v:['none'] },
      { p:'opacity', v:['0','0.5','1'] },
      { p:'visibility', v:['visible','hidden','collapse'] },
      { p:'z-index', v:['0','1','10','100','999','9999'] },
      { p:'gap', v:['4px','8px','12px','16px','24px','32px'] },
      { p:'padding', v:['0','4px','8px','12px','16px','24px'] },
      { p:'margin', v:['0','auto','4px','8px','16px'] },
      { p:'width', v:['100%','100vw','auto','fit-content','max-content','min-content'] },
      { p:'height', v:['100%','100vh','auto','fit-content'] },
      { p:'color', v:['inherit','currentColor','transparent'] },
      { p:'font-size', v:['10px','12px','13px','14px','16px','18px','24px','1rem','1.5rem'] },
    ];

    var allCompletions = [];
    CSS_PROPS.forEach(function(item) {
      allCompletions.push({ caption: item.p, value: item.p + ': ', meta: 'CSS', score: 700 });
      item.v.forEach(function(val) {
        allCompletions.push({ caption: item.p + ': ' + val, value: val, meta: 'CSS value', score: 600 });
      });
    });

    return {
      getCompletions: function(editor, session, pos, prefix, callback) {
        if (!_enabled) return callback(null, []);
        var mode = session.getMode().$id || '';
        if (mode.indexOf('css') === -1 && mode.indexOf('scss') === -1) return callback(null, []);
        var matches = allCompletions.filter(function(c) {
          return prefix.length < 1 || c.caption.toLowerCase().startsWith(prefix.toLowerCase());
        }).slice(0, 25);
        callback(null, matches);
      }
    };
  }

  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem(STORAGE_KEY, String(_enabled));
    _updateCompleter();
    if (UI) UI.toast('Autocomplete ' + (_enabled ? '✨ ON' : 'OFF'), _enabled ? 'success' : 'info');
    return _enabled;
  }

  function isEnabled() { return _enabled; }

  return { init, toggle, isEnabled };
})();
