/**
 * ai-memory.js — Persistent AI memory across sessions
 * AI remembers: user preferences, past projects, coding style, errors fixed
 */
var AIMemory = (function() {

  var MEM_KEY  = 'codex:ai-memory';
  var _memory  = { facts:[], projects:[], preferences:{}, lastSeen:null };

  function init() {
    _load();
    _memory.lastSeen = Date.now();
    _save();

    // Extract facts from AI conversations automatically
    EventBus.on('ai:response', function(data) {
      if (data && data.content) _extractFacts(data.content);
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'ai-memory-view',  label:'AI Memory: View What AI Remembers', category:'AI', action: openMemoryPanel });
      CommandPalette.register({ id:'ai-memory-clear', label:'AI Memory: Clear All Memory',        category:'AI', action: clearAll });
    }
  }

  // Build a memory context string to inject into AI system prompt
  function getMemoryContext() {
    var parts = [];
    if (_memory.facts.length > 0) {
      parts.push('== What I remember about you and your projects ==');
      _memory.facts.slice(-15).forEach(function(f) { parts.push('• ' + f.text); });
    }
    if (_memory.preferences && Object.keys(_memory.preferences).length > 0) {
      var prefs = Object.keys(_memory.preferences).map(function(k) { return k + ': ' + _memory.preferences[k]; }).join(', ');
      parts.push('Your preferences: ' + prefs);
    }
    return parts.length > 0 ? parts.join('\n') : '';
  }

  // Remember a fact
  function remember(text, category) {
    _memory.facts.push({ text: text, category: category||'general', ts: Date.now() });
    if (_memory.facts.length > 100) _memory.facts = _memory.facts.slice(-100);
    _save();
  }

  // Set preference
  function setPreference(key, value) {
    _memory.preferences[key] = value;
    _save();
  }

  // Auto-extract facts from AI responses
  function _extractFacts(content) {
    // Note project names mentioned
    var projMatch = content.match(/(?:project|app|website|system)\s+(?:called|named)\s+["']?(\w[\w\s-]+)["']?/i);
    if (projMatch) remember('Working on project: ' + projMatch[1], 'project');

    // Note tech stack
    var techPatterns = [
      { re: /using\s+(React|Vue|Angular|Svelte|Next\.js|Nuxt)/i, label: 'Uses' },
      { re: /(?:prefer|use|using)\s+(TypeScript|JavaScript|Python|Rust|Go)/i, label: 'Codes in' },
    ];
    techPatterns.forEach(function(p) {
      var m = content.match(p.re);
      if (m) remember(p.label + ' ' + m[1], 'tech');
    });
  }

  function openMemoryPanel() {
    var overlay = document.getElementById('modal-overlay');
    var modal   = document.getElementById('modal');
    if (!overlay || !modal) return;

    modal.style.width = 'min(480px,96vw)';
    modal.innerHTML = [
      '<div class="modal-header"><div style="display:flex;align-items:center;gap:8px"><span>🧠</span><span class="modal-title">AI Memory</span></div>',
        '<button id="modal-close-btn" class="modal-close">×</button></div>',
      '<div class="modal-body" style="padding:14px;max-height:65vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px">',

        '<div style="font-size:11px;color:var(--text-dim)">AI remembers this across all sessions. It\'s injected into every conversation.</div>',

        '<div><div class="ai-field-label">Remembered Facts (' + _memory.facts.length + ')</div>',
        '<div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto">',
          (_memory.facts.length === 0
            ? '<div style="color:var(--text-dim);font-size:12px;padding:8px 0">No facts yet — AI will learn from your conversations.</div>'
            : _memory.facts.slice().reverse().map(function(f,i) {
                return '<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 8px;background:rgba(255,255,255,.04);border-radius:4px">' +
                  '<span style="font-size:11px;color:var(--text);flex:1">' + _esc(f.text) + '</span>' +
                  '<button onclick="AIMemory._removeFact(' + (_memory.facts.length-1-i) + ')" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:14px;flex-shrink:0">×</button>' +
                '</div>';
              }).join('')
          ) +
        '</div></div>',

        '<div><div class="ai-field-label">Add Custom Fact</div>',
          '<div style="display:flex;gap:6px">',
            '<input id="mem-new-fact" class="ai-input-field" placeholder="e.g. Always use TypeScript, prefers dark themes…" style="flex:1">',
            '<button id="mem-add-btn" class="btn-sm btn-primary-sm" style="white-space:nowrap">Add</button>',
          '</div>',
        '</div>',

        '<div style="display:flex;gap:8px">',
          '<button id="mem-clear-btn" class="btn-sm btn-danger" style="flex:1">🗑 Clear All Memory</button>',
        '</div>',

      '</div>',
    ].join('');

    overlay.classList.remove('hidden');
    modal.querySelector('#modal-close-btn').onclick = function() { overlay.classList.add('hidden'); };
    modal.querySelector('#mem-add-btn').addEventListener('click', function() {
      var inp = modal.querySelector('#mem-new-fact');
      if (inp && inp.value.trim()) { remember(inp.value.trim(), 'user'); inp.value=''; openMemoryPanel(); }
    });
    modal.querySelector('#mem-clear-btn').addEventListener('click', function() {
      if (confirm('Clear all AI memory?')) { clearAll(); overlay.classList.add('hidden'); }
    });
  }

  function clearAll() {
    _memory = { facts:[], projects:[], preferences:{}, lastSeen:Date.now() };
    _save();
    if (UI) UI.toast('AI memory cleared', 'info');
  }

  function _load() { try { var s=JSON.parse(localStorage.getItem(MEM_KEY)||'null'); if(s)_memory=s; } catch(e) {} }
  function _save() { try { localStorage.setItem(MEM_KEY, JSON.stringify(_memory)); } catch(e) {} }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init, getMemoryContext, remember, setPreference, openMemoryPanel, clearAll,
    _removeFact: function(idx) { _memory.facts.splice(idx,1); _save(); openMemoryPanel(); }
  };
})();
