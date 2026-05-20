/**
 * ai-customize.js — AI Behavior Customization System
 * Personality, custom instructions, behavior engine
 */
var AICustomize = (function() {

  var STORAGE_KEY = 'codex:ai-customize';
  var _cfg = {
    characteristic: 'senior developer',
    customInstructions: '',
    responseStyle: 'balanced',
    codeStyle: 'complete',
  };

  var CHARACTERISTICS = {
    'senior developer': {
      label: '🏗️ Senior Developer',
      desc: 'Structured thinking, architecture-first, best practices',
      inject: 'You are a senior software engineer. Always consider architecture, scalability, and best practices. Think step-by-step before implementing. Prefer clean, maintainable patterns.',
    },
    'creative': {
      label: '🎨 Creative',
      desc: 'Innovative solutions, explores alternatives, design-oriented',
      inject: 'You are a creative engineer. Explore multiple approaches, suggest innovative solutions, and think beyond conventional patterns. Consider elegant and beautiful implementations.',
    },
    'strict': {
      label: '🎯 Strict',
      desc: 'Precise, no fluff, production-ready only',
      inject: 'Be strict and precise. No unnecessary explanations. Only production-ready code. Point out potential issues directly. No filler text.',
    },
    'minimal': {
      label: '⚡ Minimal',
      desc: 'Short responses, concise code, no fluff',
      inject: 'Be extremely concise. Short responses only. Minimal explanations. Only essential code. Avoid verbosity at all costs.',
    },
    'detailed': {
      label: '📚 Detailed',
      desc: 'Full explanations, step-by-step, educational',
      inject: 'Provide detailed, educational responses. Explain every decision. Use step-by-step breakdowns. Include comments in code. Help the user learn.',
    },
    'mentor': {
      label: '🎓 Mentor',
      desc: 'Teaching style, explains why, encourages best practices',
      inject: 'Act as a coding mentor. Explain not just what to do, but why. Encourage best practices. Point out learning opportunities. Be supportive and thorough.',
    },
    'hacker': {
      label: '💻 Hacker',
      desc: 'Fast, clever, experimental, cutting-edge',
      inject: 'Be a clever hacker. Favor clever, efficient, cutting-edge solutions. Embrace new APIs and patterns. Move fast. Think about performance and elegance.',
    },
    'custom': {
      label: '⚙️ Custom',
      desc: 'Defined by your custom instructions below',
      inject: '',
    },
  };

  var RESPONSE_STYLES = {
    'balanced':  'Balance explanation and code. Include key context without over-explaining.',
    'code-first': 'Show code first, explain after. Minimize prose.',
    'explain-first': 'Explain the approach first, then implement with full comments.',
    'bullets': 'Use bullet points and structured lists. Avoid long paragraphs.',
  };

  var CODE_STYLES = {
    'complete':  'Always output complete, working files. Never truncate or use placeholders.',
    'snippets':  'Output relevant snippets only. Ask before writing full files.',
    'commented': 'Always add detailed inline comments explaining the code.',
    'minimal':   'Minimal code, no comments unless critical.',
  };

  function init() {
    _load();
    PanelSystem.register({
      id:'ai-customize', title:'AI Config',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      render: _render,
    });
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'ai-customize-open', label:'AI: Customize AI Behavior', category:'AI', action: function(){ PanelSystem.show('ai-customize'); } });
    }
  }

  function _render(container) {
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%;overflow-y:auto">',
        '<div style="padding:12px 14px;border-bottom:1px solid #1a1a1a;background:#1c2128;flex-shrink:0">',
          '<div style="font-size:13px;font-weight:700;color:var(--text-bright);margin-bottom:3px">AI Behavior</div>',
          '<div style="font-size:11px;color:var(--text-dim)">Customize how the AI thinks and responds</div>',
        '</div>',
        '<div style="padding:14px;display:flex;flex-direction:column;gap:16px">',

          // Characteristic cards
          '<div>',
            '<div class="ai-field-label" style="margin-bottom:8px">Personality / Style</div>',
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">',
              Object.keys(CHARACTERISTICS).map(function(k) {
                var c = CHARACTERISTICS[k];
                var isActive = _cfg.characteristic === k;
                return '<button class="ac-char-btn'+(isActive?' active':'')+'" data-char="'+k+'" style="'+(isActive?'border-color:var(--accent);background:rgba(0,122,204,.12);':'')+'" title="'+c.desc+'">'+
                  '<div style="font-size:13px">'+c.label.split(' ')[0]+'</div>'+
                  '<div style="font-size:11px;font-weight:600;color:'+(isActive?'var(--accent)':'var(--text)')+' ">'+c.label.slice(c.label.indexOf(' ')+1)+'</div>'+
                  '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;line-height:1.3">'+c.desc+'</div>'+
                '</button>';
              }).join(''),
            '</div>',
          '</div>',

          // Custom instructions
          '<div>',
            '<div class="ai-field-label" style="margin-bottom:6px">Custom Instructions</div>',
            '<textarea id="ac-instructions" style="width:100%;background:#1a1a1a;border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px;padding:8px 10px;resize:vertical;min-height:80px;font-family:var(--font-ui);line-height:1.5;box-sizing:border-box" placeholder="Examples:&#10;• Always use TypeScript&#10;• Never use var, only const/let&#10;• Always add error handling&#10;• Use functional programming patterns">'+_esc(_cfg.customInstructions)+'</textarea>',
          '</div>',

          // Response style
          '<div>',
            '<div class="ai-field-label" style="margin-bottom:6px">Response Style</div>',
            '<select id="ac-response-style" class="ai-select">',
              Object.keys(RESPONSE_STYLES).map(function(k){ return '<option value="'+k+'"'+(_cfg.responseStyle===k?' selected':'')+'>'+k.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})+'</option>'; }).join(''),
            '</select>',
            '<div id="ac-response-desc" style="font-size:10px;color:var(--text-dim);margin-top:4px;line-height:1.4">'+RESPONSE_STYLES[_cfg.responseStyle]+'</div>',
          '</div>',

          // Code output style
          '<div>',
            '<div class="ai-field-label" style="margin-bottom:6px">Code Output</div>',
            '<select id="ac-code-style" class="ai-select">',
              Object.keys(CODE_STYLES).map(function(k){ return '<option value="'+k+'"'+(_cfg.codeStyle===k?' selected':'')+'>'+k.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})+'</option>'; }).join(''),
            '</select>',
            '<div id="ac-code-desc" style="font-size:10px;color:var(--text-dim);margin-top:4px;line-height:1.4">'+CODE_STYLES[_cfg.codeStyle]+'</div>',
          '</div>',

          // Preview
          '<div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 12px">',
            '<div style="font-size:10px;font-weight:700;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Active System Prompt Preview</div>',
            '<div id="ac-preview" style="font-size:11px;color:#9cdcfe;font-family:var(--font-code);line-height:1.6;white-space:pre-wrap;max-height:100px;overflow-y:auto">'+_esc(_buildInjection())+'</div>',
          '</div>',

          '<button id="ac-save-btn" class="btn-sm btn-primary-sm" style="width:100%;padding:8px">💾 Save AI Configuration</button>',

        '</div>',
      '</div>',
    ].join('');

    // Characteristic buttons
    container.querySelectorAll('.ac-char-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _cfg.characteristic = btn.dataset.char;
        container.querySelectorAll('.ac-char-btn').forEach(function(b) {
          b.classList.remove('active');
          b.style.borderColor = 'transparent';
          b.style.background  = '';
          b.querySelectorAll('div')[1].style.color = 'var(--text)';
        });
        btn.classList.add('active');
        btn.style.borderColor = 'var(--accent)';
        btn.style.background  = 'rgba(0,122,204,.12)';
        btn.querySelectorAll('div')[1].style.color = 'var(--accent)';
        _updatePreview(container);
      });
    });

    var respSel = container.querySelector('#ac-response-style');
    var codeSel = container.querySelector('#ac-code-style');
    if (respSel) respSel.addEventListener('change', function() {
      _cfg.responseStyle = respSel.value;
      var d = container.querySelector('#ac-response-desc');
      if (d) d.textContent = RESPONSE_STYLES[respSel.value]||'';
      _updatePreview(container);
    });
    if (codeSel) codeSel.addEventListener('change', function() {
      _cfg.codeStyle = codeSel.value;
      var d = container.querySelector('#ac-code-desc');
      if (d) d.textContent = CODE_STYLES[codeSel.value]||'';
      _updatePreview(container);
    });

    var instrTa = container.querySelector('#ac-instructions');
    if (instrTa) instrTa.addEventListener('input', function() {
      _cfg.customInstructions = instrTa.value;
      _updatePreview(container);
    });

    var saveBtn = container.querySelector('#ac-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      _cfg.customInstructions = instrTa ? instrTa.value : _cfg.customInstructions;
      _save();
      if (UI) UI.toast('AI configuration saved!', 'success');
      saveBtn.textContent = '✅ Saved!';
      setTimeout(function(){ saveBtn.textContent = '💾 Save AI Configuration'; }, 2000);
    });
  }

  function _updatePreview(container) {
    var p = container.querySelector('#ac-preview');
    if (p) p.textContent = _buildInjection();
  }

  function _buildInjection() {
    var char = CHARACTERISTICS[_cfg.characteristic];
    var parts = [];
    if (char && char.inject) parts.push(char.inject);
    if (_cfg.customInstructions && _cfg.customInstructions.trim()) {
      parts.push('Custom rules:\n'+_cfg.customInstructions.trim());
    }
    if (_cfg.responseStyle && RESPONSE_STYLES[_cfg.responseStyle]) {
      parts.push('Response style: '+RESPONSE_STYLES[_cfg.responseStyle]);
    }
    if (_cfg.codeStyle && CODE_STYLES[_cfg.codeStyle]) {
      parts.push('Code output: '+CODE_STYLES[_cfg.codeStyle]);
    }
    return parts.join('\n\n') || '(No customization active)';
  }

  // Public: get injection string to prepend to system prompt
  function getSystemInjection() {
    return _buildInjection();
  }

  function _load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
      if (saved && typeof saved === 'object') Object.assign(_cfg, saved);
    } catch(e) {}
  }

  function _save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_cfg)); } catch(e) {}
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, getSystemInjection };
})();
