/**
 * ai-ghost-text.js — Inline Copilot-style ghost text suggestions
 * Shows gray ghost text as you type. Tab to accept.
 */
var AIGhostText = (function() {

  var _enabled      = false;
  var _ghostText    = '';
  var _debounce     = null;
  var _ghostWidget  = null;
  var STORAGE_KEY   = 'codex:ghost-text-enabled';
  var DEBOUNCE_MS   = 800;

  function init() {
    _enabled = localStorage.getItem(STORAGE_KEY) === 'true';
    // Wait for editor to be ready
    EventBus.on(Events.APP_READY, function() {
      setTimeout(_attachToAce, 500);
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'ghost-toggle', label:'AI: Toggle Ghost Text Suggestions', category:'AI', action: toggle });
    }
  }

  function _attachToAce() {
    if (!Editor || !Editor._ace) return;
    var ace = Editor._ace;

    // Intercept Tab key to accept ghost text
    ace.commands.addCommand({
      name: 'acceptGhostText',
      bindKey: { win:'Tab', mac:'Tab' },
      exec: function(editor) {
        if (_ghostText) {
          _acceptGhost(editor);
        } else {
          editor.indent();
        }
      }
    });

    // Dismiss on Escape
    ace.commands.addCommand({
      name: 'dismissGhostText',
      bindKey: { win:'Escape', mac:'Escape' },
      exec: function() { _clearGhost(); }
    });

    // Trigger on change
    ace.on('change', function() {
      if (!_enabled) return;
      _clearGhost();
      clearTimeout(_debounce);
      _debounce = setTimeout(_triggerSuggestion, DEBOUNCE_MS);
    });

    // Clear on cursor move
    ace.selection.on('changeCursor', function() {
      if (_ghostText) _clearGhost();
    });
  }

  function _triggerSuggestion() {
    if (!_enabled || !Editor || !Editor._ace) return;
    var ace = Editor._ace;
    var pos   = ace.getCursorPosition();
    var lines = ace.session.getDocument().getAllLines();
    var before = lines.slice(Math.max(0, pos.row - 15), pos.row + 1).join('\n');
    var after  = lines.slice(pos.row + 1, Math.min(lines.length, pos.row + 6)).join('\n');

    // Don't suggest if line is empty or just whitespace
    var currentLine = lines[pos.row] || '';
    if (!currentLine.trim()) return;

    var cfg  = null; var keys = {};
    try { cfg  = JSON.parse(localStorage.getItem('codex:ai-config')||'null'); } catch(e) {}
    try { keys = JSON.parse(localStorage.getItem('codex:ai-keys')||'{}');    } catch(e) {}
    if (!cfg || (!cfg.apiKey && cfg.provider !== 'ollama' && !keys[cfg&&cfg.provider])) return;
    var apiKey = cfg.apiKey || keys[cfg.provider] || '';

    var ext  = (getActiveFile()||{name:''}).name.split('.').pop().toLowerCase();
    var lang = { js:'JavaScript', ts:'TypeScript', py:'Python', html:'HTML', css:'CSS', jsx:'React JSX' }[ext] || ext;

    var prompt = 'Complete the code. Language: ' + lang + '.\n\nCode before cursor:\n```\n' + before.slice(-800) + '\n```\n\n' +
      (after ? 'Code after cursor:\n```\n' + after.slice(0,200) + '\n```\n\n' : '') +
      'Output ONLY the completion text (what comes immediately after the cursor). Max 3 lines. No explanation. No markdown.';

    var PROVIDERS = {
      groq:       { ep:'https://api.groq.com/openai/v1/chat/completions', h:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};}, b:function(m){return{model:'llama-3.1-8b-instant',max_tokens:80,messages:[{role:'user',content:m}]};}, p:function(d){return d.choices&&d.choices[0]?d.choices[0].message.content:'';} },
      openrouter: { ep:'https://openrouter.ai/api/v1/chat/completions', h:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json','HTTP-Referer':'https://codex-editor.app'};}, b:function(m){return{model:'qwen/qwen-2.5-coder-32b-instruct:free',max_tokens:80,messages:[{role:'user',content:m}]};}, p:function(d){return d.choices&&d.choices[0]?d.choices[0].message.content:'';} },
      claude:     { ep:'https://api.anthropic.com/v1/messages', h:function(k){return{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json'};}, b:function(m){return{model:'claude-haiku-4-5',max_tokens:80,messages:[{role:'user',content:m}]};}, p:function(d){return d.content&&d.content[0]?d.content[0].text:'';} },
      ollama:     { ep:'http://localhost:11434/api/chat', h:function(){return{'Content-Type':'application/json'};}, b:function(m){return{model:'qwen2.5-coder',stream:false,messages:[{role:'user',content:m}]};}, p:function(d){return d.message?d.message.content:'';} },
    };

    var prov = PROVIDERS[cfg.provider] || PROVIDERS.groq;
    fetch(prov.ep, { method:'POST', headers:prov.h(apiKey), body:JSON.stringify(prov.b(prompt)) })
      .then(function(r){ return r.json(); })
      .then(function(data) {
        var suggestion = prov.p(data);
        if (!suggestion || !suggestion.trim()) return;
        // Clean up — remove markdown, quotes, etc.
        suggestion = suggestion.replace(/^```[\w]*\n?|```$/gm,'').trim();
        if (suggestion.length < 3 || suggestion.length > 300) return;
        _showGhost(suggestion);
      })
      .catch(function() {}); // Silent fail — ghost text is optional
  }

  function _showGhost(text) {
    if (!Editor || !Editor._ace) return;
    var ace = Editor._ace;
    _ghostText = text;

    // Remove existing ghost widget
    _clearGhostWidget();

    var pos  = ace.getCursorPosition();
    var dom  = document.createElement('span');
    dom.className   = 'ghost-text-widget';
    dom.textContent = text;
    dom.style.cssText = 'color:rgba(255,255,255,.3);pointer-events:none;font-style:italic;';

    // Use Ace's addWidget if available, else use inline overlay
    try {
      _ghostWidget = ace.renderer.$gutterLayer ? _inlineGhost(ace, pos, text) : null;
    } catch(e) {
      _inlineGhost(ace, pos, text);
    }
  }

  function _inlineGhost(ace, pos, text) {
    // Create overlay element
    var existing = document.getElementById('codex-ghost-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'codex-ghost-overlay';
    overlay.className = 'ghost-text-overlay';
    overlay.textContent = text;

    var coords = ace.renderer.textToScreenCoordinates(pos.row, pos.column);
    overlay.style.left = coords.pageX + 'px';
    overlay.style.top  = coords.pageY + 'px';
    overlay.style.font = ace.getFontSize() + 'px ' + (ace.getOption('fontFamily') || 'monospace');

    document.body.appendChild(overlay);
    _ghostWidget = overlay;

    return overlay;
  }

  function _clearGhostWidget() {
    var el = document.getElementById('codex-ghost-overlay');
    if (el) el.remove();
    _ghostWidget = null;
  }

  function _clearGhost() {
    _ghostText = '';
    _clearGhostWidget();
  }

  function _acceptGhost(editor) {
    if (!_ghostText) return;
    var text = _ghostText;
    _clearGhost();
    editor.insert(text);
  }

  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem(STORAGE_KEY, String(_enabled));
    _clearGhost();
    if (UI) UI.toast('Ghost Text ' + (_enabled ? '✨ ON — AI will suggest as you type' : 'OFF'), _enabled ? 'success' : 'info');
    return _enabled;
  }

  function isEnabled() { return _enabled; }

  return { init, toggle, isEnabled };
})();
