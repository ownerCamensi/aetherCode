/**
 * ai-code-review.js — AI reviews entire project with score + suggestions
 */
var AICodeReview = (function() {

  var _panelEl = null;
  var _loading = false;

  function init() {
    PanelSystem.register({
      id: 'ai-review', title: 'AI Review',
      icon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'review-project', label:'AI: Review Project Code', category:'AI', action: function(){ PanelSystem.show('ai-review'); startReview(); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0">',
          '<div style="font-size:13px;font-weight:600;color:var(--text-bright);margin-bottom:6px">AI Code Review</div>',
          '<div style="font-size:11px;color:var(--text-dim);margin-bottom:10px">AI analyzes your entire project and gives a score + suggestions</div>',
          '<button id="review-start-btn" class="btn-sm btn-primary-sm" style="width:100%">🔍 Review My Project</button>',
        '</div>',
        '<div id="review-results" style="flex:1;overflow-y:auto;padding:12px">',
          '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px">Click "Review My Project" to get an AI code review with scores and suggestions.</div>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelector('#review-start-btn').addEventListener('click', startReview);
  }

  function startReview() {
    if (_loading) return;
    PanelSystem.show('ai-review');

    // Need AI config
    var cfg  = null;
    var keys = {};
    try { cfg  = JSON.parse(localStorage.getItem('codex:ai-config')||'null'); } catch(e){}
    try { keys = JSON.parse(localStorage.getItem('codex:ai-keys')||'{}'); } catch(e){}
    if (!cfg || (!cfg.apiKey && cfg.provider!=='ollama' && !keys[cfg.provider])) {
      if (UI) UI.toast('Configure AI provider first', 'warn');
      if (typeof AIAssistant !== 'undefined') AIAssistant.openConfigModal();
      return;
    }
    var apiKey = cfg.apiKey || keys[cfg.provider] || '';

    var files = AppState.files.filter(function(f){ return f.name!=='.gitkeep'&&!f.isImage; });
    if (files.length === 0) { if(UI) UI.toast('No files to review', 'warn'); return; }

    _loading = true;
    var resultsEl = document.getElementById('review-results');
    if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--text-dim);font-size:12px;text-align:center;padding:20px"><div class="ai-dots"><span></span><span></span><span></span></div><div style="margin-top:10px">AI is reviewing your code…</div></div>';

    var code = '';
    files.forEach(function(f){ code += '\n\n=== ' + (f.path||f.name) + ' ===\n' + (f.content||'').slice(0,2000); });

    var prompt = 'You are a senior code reviewer. Review this project and provide:\n\n1. OVERALL SCORE: X/10\n2. CODE QUALITY: X/10 (with explanation)\n3. SECURITY: X/10 (vulnerabilities found?)\n4. PERFORMANCE: X/10 (bottlenecks?)\n5. READABILITY: X/10 (naming, structure)\n6. TOP 5 ISSUES (specific, actionable)\n7. TOP 3 QUICK WINS (easy improvements)\n8. RECOMMENDED NEXT STEPS\n\nBe specific. Reference actual code. Format with headers.\n\nProject code:\n' + code.slice(0, 10000);

    var PROVIDERS_MAP = {
      gemini:   { endpoint: function(k,m){ return 'https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+k; }, buildHeaders: function(){return{'Content-Type':'application/json'};}, buildBody: function(msg,m){return{contents:[{role:'user',parts:[{text:msg}]}],generationConfig:{maxOutputTokens:3000}};}, parse: function(d){return d.candidates&&d.candidates[0]&&d.candidates[0].content?d.candidates[0].content.parts[0].text:'';} },
      groq:     { endpoint:'https://api.groq.com/openai/v1/chat/completions', buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};}, buildBody:function(msg,m){return{model:m,max_tokens:3000,messages:[{role:'user',content:msg}]};}, parse:function(d){return d.choices&&d.choices[0]?d.choices[0].message.content:'';} },
      chatgpt:  { endpoint:'https://api.openai.com/v1/chat/completions', buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};}, buildBody:function(msg,m){return{model:m,max_tokens:3000,messages:[{role:'user',content:msg}]};}, parse:function(d){return d.choices&&d.choices[0]?d.choices[0].message.content:'';} },
      claude:   { endpoint:'https://api.anthropic.com/v1/messages', buildHeaders:function(k){return{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json'};}, buildBody:function(msg,m){return{model:m,max_tokens:3000,messages:[{role:'user',content:msg}]};}, parse:function(d){return d.content&&d.content[0]?d.content[0].text:'';} },
    };

    var prov = PROVIDERS_MAP[cfg.provider] || PROVIDERS_MAP.groq;
    var ep   = typeof prov.endpoint==='function' ? prov.endpoint(apiKey, cfg.model) : prov.endpoint;

    fetch(ep, { method:'POST', headers: prov.buildHeaders(apiKey), body: JSON.stringify(prov.buildBody(prompt, cfg.model)) })
      .then(function(r){ return r.json(); })
      .then(function(data) {
        _loading = false;
        var text = prov.parse(data);
        if (!text) throw new Error('No response');

        // Parse scores from text
        var overallMatch = text.match(/OVERALL SCORE[:\s]+(\d+)/i);
        var overall = overallMatch ? parseInt(overallMatch[1]) : null;

        var scoreColor = overall >= 8 ? 'var(--success)' : overall >= 6 ? 'var(--warning)' : 'var(--danger)';

        var html = '<div style="margin-bottom:16px">';
        if (overall !== null) {
          html += '<div style="text-align:center;padding:16px;background:rgba(255,255,255,.04);border-radius:8px;border:1px solid #1a1a1a;margin-bottom:12px">' +
            '<div style="font-size:40px;font-weight:800;color:'+scoreColor+'">'+overall+'/10</div>' +
            '<div style="font-size:12px;color:var(--text-dim);margin-top:4px">Overall Score</div>' +
          '</div>';
        }
        html += '<div class="ai-msg-text">' + _formatMd(text) + '</div></div>';

        if (resultsEl) resultsEl.innerHTML = html;
      })
      .catch(function(e) {
        _loading = false;
        if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--danger);padding:12px;font-size:12px">Review failed: ' + e.message + '</div>';
      });
  }

  function _formatMd(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/^### (.+)$/gm,'<h3 style="color:var(--accent);font-size:13px;margin:14px 0 6px">$1</h3>')
      .replace(/^## (.+)$/gm,'<h2 style="color:var(--accent);font-size:14px;margin:16px 0 6px;border-bottom:1px solid #1a1a1a;padding-bottom:4px">$1</h2>')
      .replace(/^# (.+)$/gm,'<h1 style="color:var(--text-bright);font-size:15px;margin:16px 0 8px">$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong style="color:var(--text-bright)">$1</strong>')
      .replace(/`([^`]+)`/g,'<code style="background:#161b22;padding:1px 5px;border-radius:3px;font-family:monospace;color:#ce9178;font-size:11px">$1</code>')
      .replace(/^[•\-\*] (.+)$/gm,'<li style="margin:3px 0;color:var(--text)">$1</li>')
      .replace(/^\d+\. (.+)$/gm,'<li style="margin:3px 0;color:var(--text)">$1</li>')
      .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  }

  return { init, startReview };
})();
