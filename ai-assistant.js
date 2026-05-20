/**
 * ai-assistant.js v7 — Step-Based Chunked AI System
 *
 * CHUNKING ENGINE:
 *   - Large projects split into ordered steps (1-2 files per step)
 *   - File priority: index.html → css → js → modules
 *   - Large files split into parts (Part 1/N)
 *   - Step memory: tracks completed, skips regeneration
 *   - Auto-continue or manual "continue" trigger
 *   - Hard 80-line output limit per file chunk
 *
 * PROVIDERS: OpenRouter, Gemini, Groq, Claude, ChatGPT, DeepSeek,
 *            Mistral, Together, Cohere, Ollama, Perplexity, xAI, HuggingFace
 */
var AIAssistant = (function() {

  // ─── State ─────────────────────────────────────────────────────────────────
  var _history     = [];
  var _panelEl     = null;
  var _loading     = false;
  var _abortCtrl   = null;
  var _mode        = 'normal';
  var _recognition = null;
  var _listening   = false;

  // Step engine state
  var _stepSession = null; // { steps:[], current:0, projectDesc:'', completed:[], paused:false }

  var HIST_KEY  = 'codex:ai-history';
  var KEYS_KEY  = 'codex:ai-keys';
  var CFG_KEY   = 'codex:ai-config';
  var STEP_KEY  = 'codex:ai-steps';

  var _savedKeys = {};
  var _config    = null;

  // Chunking constants
  var MAX_LINES_PER_CHUNK  = 80;   // lines per file part
  var MAX_FILES_PER_STEP   = 2;    // files per step
  var LONG_PROMPT_THRESHOLD = 400; // chars

  var FILE_PRIORITY_ORDER = [
    'index.html', 'index.htm',
    'style.css', 'styles.css', 'main.css', 'app.css',
    'index.js', 'app.js', 'main.js', 'script.js', 'index.ts', 'app.ts',
    'package.json', 'config.js', 'config.ts', 'README.md',
  ];

  // ─── Providers ─────────────────────────────────────────────────────────────
  var PROVIDERS = {
    openrouter: {
      name:'OpenRouter', badge:'🌐', color:'#6e40c9',
      note:'openrouter.ai — ONE key, ALL top models. FREE tier available!',
      models:['anthropic/claude-opus-4-5','anthropic/claude-sonnet-4-5',
              'deepseek/deepseek-coder','qwen/qwen-2.5-coder-32b-instruct:free',
              'google/gemini-2.0-flash-001','openai/gpt-4o','openai/gpt-4o-mini',
              'mistralai/codestral-2501','meta-llama/llama-3.3-70b-instruct','openrouter/auto'],
      thinkModel:'anthropic/claude-sonnet-4-5',
      endpoint:'https://openrouter.ai/api/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json','HTTP-Referer':'https://codex-editor.app','X-Title':'CodeX Editor'};},
      buildBody:function(msgs,m,sys,stream){return{model:m,max_tokens:2048,stream:!!stream,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:true,
    },
    gemini: {
      name:'Gemini', badge:'🔵', color:'#4285f4',
      note:'aistudio.google.com — FREE tier, no billing needed',
      models:['gemini-2.0-flash','gemini-1.5-flash','gemini-1.5-pro'],
      thinkModel:'gemini-2.0-flash-thinking-exp',
      endpoint:function(k,m){return'https://generativelanguage.googleapis.com/v1beta/models/'+m+':generateContent?key='+k;},
      buildHeaders:function(){return{'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{contents:msgs.map(function(msg){return{role:msg.role==='assistant'?'model':'user',parts:[{text:msg.content}]};}),systemInstruction:{parts:[{text:sys}]},generationConfig:{maxOutputTokens:2048}};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));return d.candidates&&d.candidates[0]&&d.candidates[0].content?d.candidates[0].content.parts.map(function(p){return p.text||'';}).join(''):'';},
      supportsStream:false,
    },
    groq: {
      name:'Groq', badge:'⚡', color:'#f55036',
      note:'console.groq.com — FREE, 700+ tok/sec (Llama/DeepSeek)',
      models:['llama-3.3-70b-versatile','deepseek-r1-distill-llama-70b','llama-3.1-8b-instant','mixtral-8x7b-32768'],
      thinkModel:'deepseek-r1-distill-llama-70b',
      endpoint:'https://api.groq.com/openai/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys,stream){return{model:m,max_tokens:2048,stream:!!stream,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:true,
    },
    claude: {
      name:'Claude', badge:'🟣', color:'#7c3aed',
      note:'console.anthropic.com — best quality, $5 free credits',
      models:['claude-sonnet-4-5','claude-haiku-4-5','claude-opus-4-5'],
      thinkModel:'claude-sonnet-4-5',
      endpoint:'https://api.anthropic.com/v1/messages',
      buildHeaders:function(k){return{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json'};},
      buildBody:function(msgs,m,sys,stream,thinkBudget){var b={model:m,max_tokens:2048,system:sys,stream:!!stream,messages:msgs.map(function(msg){return{role:msg.role,content:msg.content};})};if(thinkBudget){b.thinking={type:'enabled',budget_tokens:thinkBudget};b.max_tokens=Math.max(2048,thinkBudget+500);}return b;},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));return d.content&&d.content.map?d.content.filter(function(b){return b.type==='text';}).map(function(b){return b.text;}).join(''):'';},
      supportsStream:true,
    },
    chatgpt: {
      name:'ChatGPT', badge:'🟢', color:'#10a37f',
      note:'platform.openai.com — requires billing',
      models:['gpt-4o-mini','gpt-4o','gpt-3.5-turbo'],
      endpoint:'https://api.openai.com/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys,stream){return{model:m,max_tokens:2048,stream:!!stream,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error){var msg=d.error.message||'';if(msg.indexOf('quota')!==-1)throw new Error('💳 Quota exceeded. platform.openai.com → Billing.');throw new Error(msg);}return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:true,
    },
    deepseek: {
      name:'DeepSeek', badge:'🐋', color:'#1a56db',
      note:'platform.deepseek.com — best coder, $0.14/1M tokens',
      models:['deepseek-coder','deepseek-chat','deepseek-reasoner'],
      thinkModel:'deepseek-reasoner',
      endpoint:'https://api.deepseek.com/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,max_tokens:2048,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||JSON.stringify(d.error));return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:false,
    },
    mistral: {
      name:'Mistral', badge:'🌊', color:'#ff7000',
      note:'console.mistral.ai — codestral code-specialized',
      models:['codestral-latest','mistral-small-latest','mistral-medium-latest'],
      endpoint:'https://api.mistral.ai/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,max_tokens:2048,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message||d.message);return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:false,
    },
    together: {
      name:'Together', badge:'🤝', color:'#7c3aed',
      note:'api.together.xyz — Qwen2.5-Coder excellent + cheap',
      models:['Qwen/Qwen2.5-Coder-32B-Instruct','meta-llama/Llama-3-70b-chat-hf'],
      endpoint:'https://api.together.xyz/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys,stream){return{model:m,max_tokens:2048,stream:!!stream,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message);return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:true,
    },
    cohere: {
      name:'Cohere', badge:'🌀', color:'#39b2ff',
      note:'cohere.com — free trial, great long context',
      models:['command-r-plus','command-r','command'],
      endpoint:'https://api.cohere.com/v2/chat',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,preamble:sys,messages:msgs.map(function(msg){return{role:msg.role==='assistant'?'chatbot':'user',content:msg.content};})};},
      parseResponse:function(d){if(d.message&&typeof d.message==='string'&&!d.choices)throw new Error(d.message);if(d.message&&d.message.content){var c=d.message.content;return Array.isArray(c)?c[0].text:c;}if(d.text)return d.text;return'';},
      supportsStream:false,
    },
    ollama: {
      name:'Ollama', badge:'🏠', color:'#3fb950',
      note:'ollama.ai — 100% offline, no API key needed',
      models:['qwen2.5-coder','deepseek-r1','codellama','llama3.2','mistral'],
      thinkModel:'deepseek-r1',
      endpoint:'http://localhost:11434/api/chat',
      buildHeaders:function(){return{'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys,stream){return{model:m,stream:!!stream,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error);return d.message?d.message.content:'';},
      supportsStream:true,
    },
    perplexity: {
      name:'Perplexity', badge:'🔍', color:'#20b2aa',
      note:'perplexity.ai — web-connected, current info',
      models:['sonar','sonar-pro','sonar-reasoning'],
      endpoint:'https://api.perplexity.ai/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message);return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:false,
    },
    xai: {
      name:'Grok', badge:'𝕏', color:'#1d9bf0',
      note:'console.x.ai — Grok, free tier',
      models:['grok-beta'],
      endpoint:'https://api.x.ai/v1/chat/completions',
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(d.error.message);return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:false,
    },
    huggingface: {
      name:'HuggingFace', badge:'🤗', color:'#ff9900',
      note:'huggingface.co — many free models',
      models:['mistralai/Mistral-7B-Instruct-v0.3','meta-llama/Llama-3.2-3B-Instruct'],
      endpoint:function(k,m){return'https://api-inference.huggingface.co/models/'+m+'/v1/chat/completions';},
      buildHeaders:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};},
      buildBody:function(msgs,m,sys){return{model:m,max_tokens:2048,messages:[{role:'system',content:sys}].concat(msgs)};},
      parseResponse:function(d){if(d.error)throw new Error(typeof d.error==='string'?d.error:JSON.stringify(d.error));return d.choices&&d.choices[0]?d.choices[0].message.content:'';},
      supportsStream:false,
    },
  };

  // ─── Init ──────────────────────────────────────────────────────────────────
  function init() {
    _loadHistory(); _loadConfig(); _loadKeys(); _loadStepSession();
    _initVoice(); _loadHighlightJS();

    PanelSystem.register({
      id:'ai', title:'AI',
      icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="14" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.5" fill="currentColor" stroke="none"/></svg>',
      render:_renderPanel, onShow:function(el){_panelEl=el;},
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({id:'ai-open',   label:'AI: Open Assistant',       category:'AI', action:function(){PanelSystem.show('ai');}});
      CommandPalette.register({id:'ai-config', label:'AI: Configure Provider',   category:'AI', action:openConfigModal});
      CommandPalette.register({id:'ai-voice',  label:'AI: Toggle Voice Input',   category:'AI', action:toggleVoice});
      CommandPalette.register({id:'ai-clear',  label:'AI: Clear Chat History',   category:'AI', action:function(){_history=[];_saveHistory();_clearStepSession();if(_panelEl)_renderPanel(_panelEl);}});
      CommandPalette.register({id:'ai-continue',label:'AI: Continue Build Steps',category:'AI', action:_triggerContinue});
    }
  }

  // ─── highlight.js ─────────────────────────────────────────────────────────
  var _hlReady = false;
  function _loadHighlightJS() {
    if (document.getElementById('hljs-script')) return;
    var link=document.createElement('link'); link.rel='stylesheet';
    link.href='https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    document.head.appendChild(link);
    var s=document.createElement('script'); s.id='hljs-script';
    s.src='https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
    s.onload=function(){_hlReady=true;}; document.head.appendChild(s);
  }

  function _highlight(code,lang) {
    if(!_hlReady||!window.hljs)return _escHtml(code);
    try{ if(lang&&window.hljs.getLanguage(lang))return window.hljs.highlight(code,{language:lang}).value; return window.hljs.highlightAuto(code).value; }catch(e){return _escHtml(code);}
  }

  // ─── Voice Input ──────────────────────────────────────────────────────────
  function _initVoice() {
    if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window))return;
    var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    _recognition=new SR(); _recognition.continuous=false; _recognition.interimResults=true; _recognition.lang='en-US';
    _recognition.onresult=function(e){var t='';for(var i=e.resultIndex;i<e.results.length;i++)t+=e.results[i][0].transcript;var inp=document.getElementById('ai-input');if(inp)inp.value=t;if(e.results[e.results.length-1].isFinal)_stopVoice();};
    _recognition.onend=_stopVoice; _recognition.onerror=function(e){_stopVoice();if(UI)UI.toast('Voice: '+e.error,'error');};
    EventBus.on(Events.APP_READY,function(){setTimeout(_addVoiceBtn,800);});
  }

  function _addVoiceBtn(){
    if(document.getElementById('ai-voice-ext'))return;
    var sendBtn=document.getElementById('ai-send'); if(!sendBtn)return;
    var btn=document.createElement('button'); btn.id='ai-voice-ext'; btn.className='ai-voice-btn-sm'; btn.title='Voice input'; btn.textContent='🎙️';
    btn.addEventListener('click',toggleVoice);
    sendBtn.parentNode.insertBefore(btn,sendBtn.nextSibling);
  }

  function toggleVoice(){if(!_recognition){if(UI)UI.toast('Voice not supported','warn');return;}_listening?_stopVoice():_startVoice();}
  function _startVoice(){_listening=true;var b=document.getElementById('ai-voice-btn')||document.getElementById('ai-voice-ext');if(b){b.classList.add('ai-voice-active');b.title='Stop recording';}if(UI)UI.toast('🎙️ Listening…','info');try{_recognition.start();}catch(e){}}
  function _stopVoice(){_listening=false;var b=document.getElementById('ai-voice-btn')||document.getElementById('ai-voice-ext');if(b){b.classList.remove('ai-voice-active');b.title='Voice input';}try{_recognition.stop();}catch(e){}}

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  // Detect if user wants a multi-file project
  function _isProjectRequest(msg) {
    var patterns = [
      /build\s+(a|an|the|me|my|full|complete|entire)/i,
      /create\s+(a|an|the|me|full|complete)\s+\w+\s*(app|project|website|system|game|tool)/i,
      /make\s+(a|an|the|me|full)\s+\w+\s*(app|project|website)/i,
      /generate\s+(a|full|complete)\s+project/i,
      /\bmultiple\s+files\b/i,
      /\bfull\s+project\b/i,
      /\bcomplete\s+(app|project|website|system)\b/i,
    ];
    return patterns.some(function(p){ return p.test(msg); });
  }

  // Sort files by priority order
  function _prioritizeFiles(files) {
    return files.slice().sort(function(a, b) {
      var ai = FILE_PRIORITY_ORDER.indexOf(a.filename);
      var bi = FILE_PRIORITY_ORDER.indexOf(b.filename);
      if (ai === -1) ai = 999;
      if (bi === -1) bi = 999;
      return ai - bi;
    });
  }

  // Split a large file into chunks of MAX_LINES_PER_CHUNK lines
  function _chunkFile(filename, content) {
    var lines  = content.split('\n');
    if (lines.length <= MAX_LINES_PER_CHUNK) return [{ filename:filename, content:content, part:1, total:1 }];
    var chunks = [];
    var total  = Math.ceil(lines.length / MAX_LINES_PER_CHUNK);
    for (var i = 0; i < total; i++) {
      chunks.push({
        filename: filename,
        content:  lines.slice(i * MAX_LINES_PER_CHUNK, (i+1) * MAX_LINES_PER_CHUNK).join('\n'),
        part:     i + 1,
        total:    total,
      });
    }
    return chunks;
  }

  // Build step list from a list of {filename, content} objects
  function _buildStepList(files) {
    var sorted = _prioritizeFiles(files);
    var steps  = [];
    // Group into MAX_FILES_PER_STEP files per step, but split large files first
    sorted.forEach(function(f) {
      var chunks = _chunkFile(f.filename, f.content || '');
      chunks.forEach(function(chunk) {
        steps.push({
          filename: chunk.filename,
          content:  chunk.content,
          part:     chunk.part,
          total:    chunk.total,
          action:   'create',
          done:     false,
        });
      });
    });
    return steps;
  }

  // Parse step-format response from AI
  function _parseStepResponse(text) {
    // Try JSON format first
    var jsonMatch = text.match(/```json\n?([\s\S]+?)```/i);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[1]); } catch(e) {}
    }
    // Fall back to FILENAME: format
    var files = _parseFiles(text);
    if (files.length > 0) return { files: files, type: 'files' };
    return null;
  }

  // ─── Start a step session ────────────────────────────────────────────────
  function _startStepSession(projectDesc, initialFiles) {
    var steps = _buildStepList(initialFiles);
    _stepSession = {
      projectDesc: projectDesc,
      steps:       steps,
      current:     0,
      completed:   [],
      paused:      false,
      startTime:   Date.now(),
      autoAdvance: true,
    };
    _saveStepSession();
    return _stepSession;
  }

  // ─── Execute one step ────────────────────────────────────────────────────
  function _executeStep(idx) {
    if (!_stepSession || idx >= _stepSession.steps.length) {
      _finishSession(); return;
    }
    var step = _stepSession.steps[idx];
    if (!step || step.done) { _executeStep(idx+1); return; }

    _stepSession.current = idx;
    _saveStepSession();

    // Build step message for AI
    var remaining = _stepSession.steps.filter(function(s,i){ return !s.done && i > idx; }).length;
    var partLabel = step.total > 1 ? ' (Part '+step.part+'/'+step.total+')' : '';
    var label = 'Step '+(idx+1)+'/'+_stepSession.steps.length+': '+step.filename+partLabel;

    // Build the step prompt
    var stepPrompt = [
      'Project: '+_stepSession.projectDesc,
      '',
      'CURRENT STEP: '+label,
      'Action: '+step.action+' '+step.filename+(partLabel?' '+partLabel:''),
      '',
      'RULES:',
      '- Output ONLY the code for '+step.filename+(step.total>1?' lines '+(((step.part-1)*MAX_LINES_PER_CHUNK)+1)+'-'+(step.part*MAX_LINES_PER_CHUNK):''),
      '- Maximum '+MAX_LINES_PER_CHUNK+' lines of code',
      '- Use format: FILENAME: '+step.filename+'\n```lang\ncode\n```',
      '- Do NOT output any other files',
      '',
      'Completed files: '+(idx > 0 ? _stepSession.steps.slice(0,idx).map(function(s){return s.filename;}).join(', ') : 'none'),
      'Remaining after this: '+remaining+' steps',
    ].join('\n');

    _addStepProgressMsg(idx, label, remaining);
    _callAI(stepPrompt, function(content) {
      _onStepComplete(idx, step, content);
    });
  }

  // ─── When a step response arrives ────────────────────────────────────────
  function _onStepComplete(idx, step, content) {
    if (!content) { _stepSession.steps[idx].done=true; _saveStepSession(); _continueIfAuto(); return; }

    var parsed = _parseFiles(content);
    var fileContent = '';

    if (parsed.length > 0) {
      // Take only the first file matching our expected file
      var matching = parsed.filter(function(f){ return f.filename===step.filename||f.filename.endsWith('/'+step.filename); });
      fileContent = matching.length > 0 ? matching[0].content : parsed[0].content;
    } else {
      // Extract raw code block
      var codeMatch = content.match(/```[\w]*\n?([\s\S]+?)```/);
      fileContent = codeMatch ? codeMatch[1] : content;
    }

    // Mark step done
    _stepSession.steps[idx].done     = true;
    _stepSession.steps[idx].content  = fileContent;
    _stepSession.completed.push(step.filename);
    _saveStepSession();

    // Render step result in chat
    _renderStepResult(idx, step, fileContent, content);
    _continueIfAuto();
  }

  // ─── Auto-advance ─────────────────────────────────────────────────────────
  function _continueIfAuto() {
    if (!_stepSession || _stepSession.paused) return;
    var next = _stepSession.steps.findIndex(function(s,i){ return !s.done && i > _stepSession.current; });
    if (next === -1) { _finishSession(); return; }
    if (_stepSession.autoAdvance) {
      setTimeout(function(){ _executeStep(next); }, 600);
    } else {
      _renderContinuePrompt(next);
    }
  }

  function _triggerContinue() {
    if (!_stepSession) { if(UI) UI.toast('No active build session','warn'); return; }
    var next = _stepSession.steps.findIndex(function(s){ return !s.done; });
    if (next !== -1) { _stepSession.paused=false; _executeStep(next); }
    else _finishSession();
  }

  function _finishSession() {
    if (!_stepSession) return;
    var files = _stepSession.steps.filter(function(s){return s.done&&s.content;});
    _renderSessionComplete(files);
    _saveHistory();
    // Keep session for reference but mark complete
    _stepSession.complete = true;
    _saveStepSession();
  }

  // ─── Step UI rendering ────────────────────────────────────────────────────
  function _addStepProgressMsg(idx, label, remaining) {
    var msgEl = document.getElementById('ai-messages'); if(!msgEl) return;
    var el = document.createElement('div');
    el.className = 'ai-msg ai-msg-assistant';
    el.id = 'step-progress-'+idx;
    el.innerHTML =
      '<div class="ai-msg-avatar">🤖</div>'+
      '<div class="ai-msg-body">'+
        '<div class="ai-step-banner">'+
          '<div class="ai-step-header">'+
            '<div class="ai-step-spinner"></div>'+
            '<span class="ai-step-label">'+_escHtml(label)+'</span>'+
            '<span class="ai-step-remaining">'+remaining+' remaining</span>'+
          '</div>'+
          '<div class="ai-step-bar"><div class="ai-step-bar-fill" id="step-bar-'+idx+'" style="width:0%"></div></div>'+
        '</div>'+
      '</div>';
    msgEl.appendChild(el);
    _scrollBot();
    // Animate bar
    setTimeout(function(){ var b=document.getElementById('step-bar-'+idx); if(b)b.style.width='90%'; },100);
  }

  function _renderStepResult(idx, step, fileContent, rawContent) {
    // Update the progress banner to show done
    var banner = document.getElementById('step-progress-'+idx);
    if (banner) {
      var partLabel = step.total > 1 ? ' (Part '+step.part+'/'+step.total+')' : '';
      var ext = step.filename.split('.').pop().toLowerCase();
      var highlighted = _highlight(fileContent, ext);
      var uid = 'step-code-'+idx;
      banner.querySelector('.ai-msg-body').innerHTML =
        '<div class="ai-step-banner ai-step-done">'+
          '<div class="ai-step-header">'+
            '<span class="ai-step-check">✅</span>'+
            '<span class="ai-step-label ai-step-label-done">'+_escHtml(step.filename+partLabel)+'</span>'+
            '<span class="ai-step-lines">'+fileContent.split('\n').length+' lines</span>'+
            '<button class="ai-step-toggle" onclick="(function(){var c=document.getElementById(\''+uid+'\');if(c){c.classList.toggle(\'hidden\');}})()">▼ view</button>'+
          '</div>'+
          '<div class="ai-step-code hidden" id="'+uid+'">'+
            '<div class="ai-code-header"><span class="ai-code-lang">'+_escHtml(ext)+'</span>'+
              '<button class="ai-copy-btn" onclick="(function(b){var c=b.closest(\'.ai-step-banner\').querySelector(\'code\');if(c)navigator.clipboard&&navigator.clipboard.writeText(c.textContent).then(function(){b.textContent=\'✓\';setTimeout(function(){b.textContent=\'Copy\'},1500)});})(this)">Copy</button>'+
            '</div>'+
            '<div class="ai-code-block"><code class="hljs language-'+_escHtml(ext)+'">'+highlighted+'</code></div>'+
          '</div>'+
        '</div>';
      var bar = document.getElementById('step-bar-'+idx); if(bar)bar.style.width='100%';
    }
    _scrollBot();
  }

  function _renderContinuePrompt(nextIdx) {
    var msgEl = document.getElementById('ai-messages'); if(!msgEl) return;
    var el = document.createElement('div');
    el.className = 'ai-msg ai-msg-assistant';
    el.id = 'step-continue-prompt';
    var next = _stepSession.steps[nextIdx];
    el.innerHTML =
      '<div class="ai-msg-avatar">🤖</div>'+
      '<div class="ai-msg-body">'+
        '<div class="ai-step-continue">'+
          '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Next: <strong style="color:var(--text)">'+_escHtml(next.filename)+'</strong></div>'+
          '<button class="ai-action-btn" onclick="AIAssistant._triggerContinue()">▶ Continue Building</button>'+
        '</div>'+
      '</div>';
    msgEl.appendChild(el);
    _scrollBot();
  }

  function _renderSessionComplete(files) {
    var msgEl = document.getElementById('ai-messages'); if(!msgEl) return;
    var el = document.createElement('div');
    el.className = 'ai-msg ai-msg-assistant';
    el.innerHTML =
      '<div class="ai-msg-avatar">🤖</div>'+
      '<div class="ai-msg-body">'+
        '<div class="ai-step-complete">'+
          '<div class="ai-step-complete-header">✅ Build Complete</div>'+
          '<div class="ai-step-complete-files">'+
            files.map(function(s){ return '<span class="ai-step-file-chip">📄 '+_escHtml(s.filename)+'</span>'; }).join('')+
          '</div>'+
          '<button class="ai-action-btn" id="step-create-all-btn">📁 Create All Files ('+(files.length)+')</button>'+
        '</div>'+
      '</div>';
    msgEl.appendChild(el);

    el.querySelector('#step-create-all-btn').addEventListener('click', function() {
      files.forEach(function(s){ if(s.content) _upsertFile(s.filename, s.content); });
      saveToStorage();
      if(typeof FolderTree!=='undefined') FolderTree.render(document.getElementById('file-list'));
      if(typeof TabManager!=='undefined') TabManager.render();
      if(UI) UI.toast('📁 Created '+files.length+' files!','success');
      el.querySelector('#step-create-all-btn').textContent='✅ Files Created!';
    });
    _scrollBot();
  }

  // ─── Config Modal ──────────────────────────────────────────────────────────
  function openConfigModal() {
    var overlay=document.getElementById('modal-overlay'), modal=document.getElementById('modal');
    if(!overlay||!modal){console.error('[AI] #modal-overlay missing');return;}
    var cfg=_config||{provider:'openrouter',model:'',readAll:false,autoPreview:false};
    modal.style.width='min(520px,96vw)';
    modal.innerHTML=[
      '<div class="modal-header"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🤖</span><span class="modal-title">AI Provider Setup</span></div><button id="modal-close-btn" class="modal-close">'+Icons.getUI('close')+'</button></div>',
      '<div class="modal-body" style="padding:14px;display:flex;flex-direction:column;gap:12px;max-height:72vh;overflow-y:auto">',
        '<div style="background:rgba(110,64,201,.12);border:1px solid rgba(110,64,201,.3);border-radius:6px;padding:10px 12px;font-size:12px;color:#c4b5fd">',
          '💡 <strong>Best for coding:</strong> OpenRouter (one key, all models) · DeepSeek (cheapest) · Groq (fastest, free)',
        '</div>',
        '<div><div class="ai-field-label">Provider</div>',
        '<div class="ai-provider-grid" id="ai-prov-grid" style="grid-template-columns:repeat(4,1fr)">',
          Object.keys(PROVIDERS).map(function(k){var p=PROVIDERS[k];return'<button class="ai-prov-grid-btn'+(cfg.provider===k?' selected':'')+'" data-prov="'+k+'" style="border-color:'+(cfg.provider===k?p.color:'transparent')+'" title="'+p.note+'"><span style="font-size:16px">'+p.badge+'</span><span class="ai-pgb-name">'+p.name+'</span>'+(_savedKeys[k]?'<span class="ai-pgb-check">✓</span>':'')+'</button>';}).join(''),
        '</div><div id="ai-prov-note" class="ai-provider-note" style="margin-top:5px"></div></div>',
        '<div><div class="ai-field-label">Model</div><select id="ai-model" class="ai-select"></select><input id="ai-custom-model" class="ai-input-field" placeholder="Or type any custom model…" style="margin-top:4px" value="'+(cfg.customModel||'')+'"></div>',
        '<div id="ai-key-section"><div class="ai-field-label">API Key</div><div style="position:relative"><input id="ai-apikey" type="password" class="ai-input-field" placeholder="Paste API key…"><button id="ai-show-key" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-dim);font-size:11px">Show</button></div></div>',
        '<div><div class="ai-field-label">Chunking Mode</div><select id="ai-chunk-mode" class="ai-select">',
          '<option value="auto"'+((cfg.chunkMode||'auto')==='auto'?' selected':'')+'>Auto (detect project requests → step mode)</option>',
          '<option value="always"'+(cfg.chunkMode==='always'?' selected':'')+'>Always step-by-step</option>',
          '<option value="never"'+(cfg.chunkMode==='never'?' selected':'')+'>Never (single response)</option>',
        '</select></div>',
        '<div style="display:flex;flex-direction:column;gap:8px">',
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text)"><input type="checkbox" id="ai-read-all"'+(cfg.readAll?' checked':'')+' style="accent-color:var(--accent)"> Read all project files</label>',
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text)"><input type="checkbox" id="ai-auto-continue"'+((cfg.autoContinue!==false)?' checked':'')+' style="accent-color:var(--accent)"> Auto-continue steps (no manual confirm needed)</label>',
          '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text)"><input type="checkbox" id="ai-auto-preview"'+(cfg.autoPreview?' checked':'')+' style="accent-color:var(--accent)"> Auto-preview HTML</label>',
        '</div>',
      '</div>',
      '<div class="modal-footer"><button id="modal-cancel" class="btn-sm">Cancel</button><button id="ai-test-btn" class="btn-sm">Test</button><button id="modal-confirm" class="btn-sm btn-primary-sm">Save</button></div>',
    ].join('');

    overlay.classList.remove('hidden');
    var _curProv=cfg.provider;

    function _sel(k){
      _curProv=k; var p=PROVIDERS[k]; if(!p) return;
      modal.querySelectorAll('.ai-prov-grid-btn').forEach(function(b){var me=b.dataset.prov===k;b.classList.toggle('selected',me);b.style.borderColor=me?p.color:'transparent';});
      var n=modal.querySelector('#ai-prov-note'); if(n) n.textContent=p.note||'';
      var s=modal.querySelector('#ai-model'); if(s) s.innerHTML=p.models.map(function(m){return'<option value="'+m+'"'+(cfg.model===m?' selected':'')+'>'+m+'</option>';}).join('');
      var ki=modal.querySelector('#ai-apikey'); if(ki) ki.value=_savedKeys[k]||'';
      var ks=modal.querySelector('#ai-key-section'); if(ks) ks.style.display=k==='ollama'?'none':'';
    }
    _sel(cfg.provider);
    modal.querySelectorAll('.ai-prov-grid-btn').forEach(function(b){b.addEventListener('click',function(){_sel(b.dataset.prov);});});
    var sk=modal.querySelector('#ai-show-key'),ki=modal.querySelector('#ai-apikey');
    if(sk&&ki)sk.addEventListener('click',function(){ki.type=ki.type==='password'?'text':'password';sk.textContent=ki.type==='password'?'Show':'Hide';});

    modal.querySelector('#ai-test-btn').addEventListener('click',function(){
      var btn=modal.querySelector('#ai-test-btn');btn.textContent='…';btn.disabled=true;
      var k=(ki?ki.value.trim():'')||_savedKeys[_curProv]||'';
      var m=(modal.querySelector('#ai-custom-model').value||'').trim()||modal.querySelector('#ai-model').value;
      _testConn(_curProv,m,k,function(ok,msg){btn.textContent=ok?'✅':'❌';btn.disabled=false;var n=modal.querySelector('#ai-prov-note');if(n){n.textContent=msg;n.style.color=ok?'var(--success)':'var(--danger)';}setTimeout(function(){btn.textContent='Test';_sel(_curProv);},3000);});
    });

    modal.querySelector('#modal-confirm').onclick=function(){
      var prov=_curProv, mc=(modal.querySelector('#ai-custom-model').value||'').trim(), ms=modal.querySelector('#ai-model').value;
      var apiKey=prov==='ollama'?'':(ki?ki.value.trim():'');
      if(apiKey){_savedKeys[prov]=apiKey;_saveKeys();}
      _config={provider:prov,model:mc||ms||(PROVIDERS[prov]?PROVIDERS[prov].models[0]:''),customModel:mc,apiKey:apiKey||_savedKeys[prov]||'',readAll:modal.querySelector('#ai-read-all').checked,autoPreview:modal.querySelector('#ai-auto-preview').checked,autoContinue:modal.querySelector('#ai-auto-continue').checked,chunkMode:modal.querySelector('#ai-chunk-mode').value};
      _saveConfig();overlay.classList.add('hidden');
      if(UI)UI.toast('✅ AI: '+(PROVIDERS[prov]?PROVIDERS[prov].name:prov)+' ready','success');
      if(_panelEl)_renderPanel(_panelEl);
    };
    modal.querySelector('#modal-cancel').onclick=function(){overlay.classList.add('hidden');};
    modal.querySelector('#modal-close-btn').onclick=function(){overlay.classList.add('hidden');};
  }

  function _testConn(pk,model,apiKey,cb){
    var p=PROVIDERS[pk];if(!p){cb(false,'Unknown provider');return;}
    var ep=typeof p.endpoint==='function'?p.endpoint(apiKey,model):p.endpoint;
    fetch(ep,{method:'POST',headers:p.buildHeaders(apiKey),body:JSON.stringify(p.buildBody([{role:'user',content:'Say OK.'}],model,'Reply: OK'))})
      .then(function(r){return r.json();}).then(function(d){try{var t=p.parseResponse(d);cb(true,'Connected! Reply: '+String(t).slice(0,40));}catch(e){cb(false,e.message);}}).catch(function(e){cb(false,e.message);});
  }

  // ─── Panel ────────────────────────────────────────────────────────────────
  function _renderPanel(container) {
    _panelEl=container;
    var noKey=!_config||(!_config.apiKey&&_config.provider!=='ollama'&&!_savedKeys[_config&&_config.provider]);
    var p=_config&&PROVIDERS[_config.provider];
    var hasSession=_stepSession&&!_stepSession.complete;
    var doneCount=hasSession?_stepSession.steps.filter(function(s){return s.done;}).length:0;
    var totalSteps=hasSession?_stepSession.steps.length:0;

    container.innerHTML=
      '<div class="ai-panel">'+
        // Provider pills
        '<div class="ai-provider-pills">'+
          Object.keys(PROVIDERS).map(function(k){var pv=PROVIDERS[k],hk=k==='ollama'||!!_savedKeys[k],ia=_config&&_config.provider===k;return'<button class="ai-pill'+(ia?' active':'')+'" data-provider="'+k+'" title="'+pv.name+(hk?' ✓':'')+'">'+pv.badge+' '+pv.name+'</button>';}).join('')+
          '<button class="ai-pill ai-pill-add" id="ai-add-btn">+ Key</button>'+
        '</div>'+
        // Mode bar
        '<div class="ai-mode-bar">'+
          _mp('normal','💬 Normal')+_mp('thinking','🧠 Think')+_mp('pro','⚡ Pro')+
          _mp('advanced','🔬 Advanced')+_mp('imagine','🎨 Imagine')+_mp('search','🔍 Search')+
        '</div>'+
        // Step session banner (if active)
        (hasSession?
          '<div class="ai-session-bar">'+
            '<div class="ai-session-info">'+
              '<span class="ai-session-icon">🏗️</span>'+
              '<span class="ai-session-label">Building: '+_escHtml((_stepSession.projectDesc||'').slice(0,40)+'…')+'</span>'+
              '<span class="ai-session-progress">'+doneCount+'/'+totalSteps+'</span>'+
            '</div>'+
            '<div class="ai-session-prog-bar"><div style="width:'+(totalSteps>0?Math.round(doneCount/totalSteps*100):0)+'%;height:100%;background:var(--accent);border-radius:2px;transition:width .4s"></div></div>'+
            '<div style="display:flex;gap:5px;margin-top:4px">'+
              '<button class="ai-session-btn" onclick="AIAssistant._triggerContinue()">▶ Continue</button>'+
              '<button class="ai-session-btn" onclick="AIAssistant._clearSession()">✕ Cancel</button>'+
            '</div>'+
          '</div>'
        :'')+
        // Topbar
        '<div class="ai-topbar">'+
          '<span style="font-size:15px">'+(p?p.badge:'🤖')+'</span>'+
          '<span class="ai-provider-label">'+(p?p.name:'Not configured')+'</span>'+
          '<span class="ai-model-label" style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(_config&&_config.model||'')+'</span>'+
          (p&&p.supportsStream?'<span style="font-size:9px;background:rgba(63,185,80,.15);color:var(--success);padding:1px 5px;border-radius:8px;margin-left:3px">LIVE</span>':'')+
          '<div style="flex:1"></div>'+
          '<span id="ai-hist-count" style="font-size:10px;color:var(--text-dim)">'+_history.length+' msgs</span>'+
          '<button class="ai-top-btn" id="ai-cfg-btn" title="Configure">⚙</button>'+
          '<button class="ai-top-btn" id="ai-clear-btn" title="Clear">🗑</button>'+
          '<button class="ai-top-btn" id="ai-voice-btn" title="Voice">🎙️</button>'+
          (_loading?'<button class="ai-top-btn" id="ai-stop-btn" style="color:var(--danger)" title="Stop">⛔</button>':'')+
        '</div>'+
        // Messages
        '<div class="ai-messages" id="ai-messages">'+
          (noKey?_setupScreen():(_history.length===0?_welcomeScreen(p):_history.map(_renderMsg).join('')))+
        '</div>'+
        // Input area
        '<div class="ai-input-area">'+
          '<div class="ai-context-bar">'+
            '<span class="ai-ctx-info" id="ai-ctx-info">'+_ctxInfo()+'</span>'+
            '<button class="ai-ctx-btn" id="ai-ctx-toggle">'+(_config&&_config.readAll?'📂 All':'📄 Active')+'</button>'+
          '</div>'+
          '<div class="ai-input-row">'+
            '<textarea class="ai-input" id="ai-input" placeholder="'+_ph()+'" rows="2" spellcheck="false"></textarea>'+
            '<div style="display:flex;flex-direction:column;gap:4px">'+
              '<button class="ai-send-btn" id="ai-send" title="Send (Enter)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>'+
              '<button class="ai-voice-btn-sm" id="ai-voice-btn-sm" title="Voice">🎙️</button>'+
            '</div>'+
          '</div>'+
          '<div id="ai-prompt-preview" class="ai-prompt-preview hidden"></div>'+
        '</div>'+
      '</div>';

    _bindPanel(container);
    _scrollBot();
  }

  function _mp(id,l){return'<button class="ai-mode-pill'+(_mode===id?' active':'')+'" data-mode="'+id+'">'+l+'</button>';}
  function _ph(){var m={normal:'Ask anything… large project → auto step mode',thinking:'Deep reasoning mode…',pro:'Full quality mode…',advanced:'Full project context…',imagine:'Describe image…',search:'Search the web…'};return m[_mode]||m.normal;}
  function _ctxInfo(){if(!_config)return'No provider';if(_config.readAll&&typeof AppState!=='undefined')return AppState.files.filter(function(f){return f.name!=='.gitkeep'&&!f.isImage;}).length+' files';var af=typeof getActiveFile!=='undefined'?getActiveFile():null;return af?af.name:'No file';}

  function _setupScreen(){return'<div class="ai-setup-screen"><div class="ai-setup-icon">🤖</div><div class="ai-setup-title">AI Assistant</div><div class="ai-setup-sub">Choose a provider to get started.<br><br><strong style="color:var(--success)">FREE:</strong> Groq ⚡ · Gemini 🔵 · OpenRouter 🌐 · Ollama 🏠</div><button class="btn-sm btn-primary-sm" id="ai-setup-btn" style="margin-top:12px">⚡ Configure</button></div>';}

  function _welcomeScreen(p){
    return'<div class="ai-welcome">'+
      '<div class="ai-welcome-icon">'+(p?p.badge:'🤖')+'</div>'+
      '<div class="ai-welcome-title">'+(p?p.name+' ready':'AI Assistant')+'</div>'+
      '<div class="ai-welcome-sub">'+(_config&&_config.model||'')+' · '+(_config&&_config.readAll?'📂 All files':'📄 Active')+'</div>'+
      '<div class="ai-quick-grid">'+
        _q('💡 Explain','Explain this code step by step.')+
        _q('🐛 Fix bugs','Find and fix all bugs. Show corrected code.')+
        _q('♻️ Refactor','Refactor for readability and performance.')+
        _q('📁 Build project','Build a complete app — will be created step by step, one file at a time.')+
        _q('🔌 Create plugin','Create a CodeX Editor plugin for me.')+
        _q('🧪 Write tests','Write comprehensive unit tests.')+
        _q('🔍 Search web','Search for current information on this topic.')+
        _q('🎨 Generate image','Describe an image for Imagine mode.')+
      '</div>'+
    '</div>';
  }

  function _q(l,p){return'<button class="ai-qbtn" data-prompt="'+_esc(p)+'">'+l+'</button>';}

  function _bindPanel(container) {
    container.querySelectorAll('.ai-pill[data-provider]').forEach(function(pill){
      pill.addEventListener('click',function(){
        var prov=pill.dataset.provider;
        if(prov!=='ollama'&&!_savedKeys[prov]){openConfigModal();return;}
        if(!_config)_config={provider:prov,model:PROVIDERS[prov].models[0],readAll:false};
        _config.provider=prov;_config.apiKey=_savedKeys[prov]||'';_config.model=PROVIDERS[prov].models[0];
        _saveConfig();_renderPanel(container);
      });
    });
    var addBtn=container.querySelector('#ai-add-btn'); if(addBtn)addBtn.addEventListener('click',openConfigModal);
    var setupBtn=container.querySelector('#ai-setup-btn'); if(setupBtn)setupBtn.addEventListener('click',openConfigModal);
    container.querySelectorAll('.ai-mode-pill').forEach(function(pill){pill.addEventListener('click',function(){_mode=pill.dataset.mode;_renderPanel(container);});});
    container.querySelector('#ai-cfg-btn')&&container.querySelector('#ai-cfg-btn').addEventListener('click',openConfigModal);
    container.querySelector('#ai-clear-btn')&&container.querySelector('#ai-clear-btn').addEventListener('click',function(){if(!confirm('Clear chat?'))return;_history=[];_saveHistory();_clearStepSession();_renderPanel(container);});
    container.querySelector('#ai-stop-btn')&&container.querySelector('#ai-stop-btn').addEventListener('click',function(){if(_abortCtrl){_abortCtrl.abort();_abortCtrl=null;}_loading=false;if(_stepSession)_stepSession.paused=true;_addMsg('assistant','_(Stopped)_');});
    container.querySelector('#ai-ctx-toggle')&&container.querySelector('#ai-ctx-toggle').addEventListener('click',function(){if(_config){_config.readAll=!_config.readAll;_saveConfig();_renderPanel(container);}});
    var voiceBtn=container.querySelector('#ai-voice-btn'); if(voiceBtn)voiceBtn.addEventListener('click',toggleVoice);
    var voiceSm=container.querySelector('#ai-voice-btn-sm'); if(voiceSm)voiceSm.addEventListener('click',toggleVoice);
    container.querySelectorAll('.ai-qbtn').forEach(function(btn){btn.addEventListener('click',function(){_sendMsg(btn.dataset.prompt);});});
    var sendBtn=container.querySelector('#ai-send'),inputEl=container.querySelector('#ai-input');
    if(sendBtn)sendBtn.addEventListener('click',function(){_sendMsg();});
    if(inputEl){
      inputEl.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();_sendMsg();}});
      inputEl.addEventListener('input',function(){_updatePromptPreview(inputEl.value);});
    }
  }

  // ─── Long prompt preview ─────────────────────────────────────────────────
  function _updatePromptPreview(text) {
    var p=document.getElementById('ai-prompt-preview'); if(!p)return;
    if(text.length>LONG_PROMPT_THRESHOLD||text.includes('\n')){
      p.classList.remove('hidden');
      p.innerHTML='<div class="ai-prompt-file-chip"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" style="width:12px;height:12px"><path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z"/><polyline points="9 1 9 5 13 5"/></svg>prompt.txt <span style="color:var(--text-dim)">'+text.length+' chars</span></div>';
    } else {
      p.classList.add('hidden');
    }
  }

  // ─── SEND (main entry) ────────────────────────────────────────────────────
  function _sendMsg(override) {
    if (_loading) return;

    if (_mode==='imagine') {
      var ii=document.getElementById('ai-input'),pr=override||(ii?ii.value.trim():'');
      if(!pr)return; if(ii)ii.value=''; _generateImage(pr); return;
    }

    var inputEl=document.getElementById('ai-input');
    var userMsg=override||(inputEl?inputEl.value.trim():'');
    if(!userMsg)return;
    if(inputEl){inputEl.value='';_updatePromptPreview('');}

    if(!_config||(!_config.apiKey&&_config.provider!=='ollama'&&!_savedKeys[_config&&_config.provider])){openConfigModal();return;}
    if(!_config.apiKey&&_savedKeys[_config.provider])_config.apiKey=_savedKeys[_config.provider];

    var isLong=userMsg.length>LONG_PROMPT_THRESHOLD||userMsg.split('\n').length>3;
    var displayMsg=isLong?'\x00PROMPTFILE\x00'+userMsg+'\x00/PROMPTFILE\x00':userMsg;

    // Detect project request
    var chunkMode=_config.chunkMode||'auto';
    var isProject=(chunkMode==='always')||(chunkMode==='auto'&&_isProjectRequest(userMsg));

    if (isProject) {
      _history.push({role:'user',content:userMsg,_display:displayMsg});
      _saveHistory();_renderHistory();
      _runProjectPlan(userMsg);
      return;
    }

    // Normal mode
    var effectiveModel=_config.model, thinkBudget=null, sysExtra='';
    if(_mode==='thinking'){var tp=PROVIDERS[_config.provider];if(tp&&tp.thinkModel)effectiveModel=tp.thinkModel;thinkBudget=8000;sysExtra='\n\nTHINKING: Reason step-by-step inside <thinking>...</thinking> then give final answer.';}
    else if(_mode==='pro'){sysExtra='\n\nPRO: Complete production-ready code, never truncate.';}
    else if(_mode==='advanced'){_config.readAll=true;sysExtra='\n\nADVANCED: Full project context, complete implementations.';}
    else if(_mode==='search'){sysExtra='\n\nSEARCH: Provide accurate, up-to-date information.';}

    var code='',fn='';
    if(_config.readAll&&typeof AppState!=='undefined'){AppState.files.forEach(function(f){if(!f.isImage&&f.name!=='.gitkeep')code+='\n\n=== '+f.name+' ===\n'+(f.content||'').slice(0,2500);});}
    else{var af=typeof getActiveFile!=='undefined'?getActiveFile():null;if(af&&!af.isImage){code=(af.content||'').slice(0,5000);fn=af.name;}}

    var customBehavior=(typeof AICustomize!=='undefined')?AICustomize.getSystemInjection():'';
    var memoryContext=(typeof AIMemory!=='undefined')?AIMemory.getMemoryContext():'';
    var system='You are the AI in CodeX Editor.\n'+(customBehavior?customBehavior+'\n':'')+(memoryContext?memoryContext+'\n':'')+
      'Use markdown + fenced code blocks.\n'+
      'HARD LIMIT: Max 80 lines of code per response. If more is needed, say "Ready for next part — reply continue".\n'+
      'For files: FILENAME: path/file.ext\n```lang\ncode\n```\n'+
      (isLong?'User sent prompt.txt — address everything.\n':'')+sysExtra+
      (code?'\n\nContext'+(fn?' ('+fn+')':'')+':\n```\n'+code.slice(0,8000)+'\n```':'\n\nNo file open.');

    _history.push({role:'user',content:userMsg,_display:displayMsg});
    _saveHistory();_renderHistory();
    _loading=true;

    _callAI(system, function(content){
      _loading=false;
      _addMsg('assistant',content);
      if(_config.autoPreview&&content.indexOf('```html')!==-1){var hm=content.match(/```html\n([\s\S]*?)```/);if(hm&&typeof Runner!=='undefined')setTimeout(function(){Runner.run();},300);}
    }, true);
  }

  // ─── Project Plan Mode ────────────────────────────────────────────────────
  function _runProjectPlan(userMsg) {
    if (UI) UI.toast('🏗️ Planning project steps…','info');
    _loading = true;
    _showTyping();

    var planPrompt = [
      'You are a project planner. The user wants: "'+userMsg+'"',
      '',
      'Output ONLY a JSON array of files to create (no explanations):',
      '[',
      '  {"filename": "index.html", "description": "main HTML"},',
      '  {"filename": "style.css", "description": "styles"},',
      '  {"filename": "app.js", "description": "main logic"}',
      ']',
      '',
      'Rules:',
      '- List only files, no folders needed in names unless necessary',
      '- Maximum 8 files total',
      '- Most important files first',
      '- Output ONLY the JSON array, nothing else',
    ].join('\n');

    var customBehavior=(typeof AICustomize!=='undefined')?AICustomize.getSystemInjection():'';
    var systemPlan='You are a precise file planner for CodeX Editor.'+(customBehavior?'\n'+customBehavior:'');

    _callAIRaw(planPrompt, systemPlan, function(planText) {
      _loading = false;
      _removeTyping();

      var fileList = [];
      try {
        var jsonMatch = planText.match(/\[[\s\S]*\]/);
        if (jsonMatch) fileList = JSON.parse(jsonMatch[0]);
      } catch(e) {
        fileList = [{filename:'index.html'},{filename:'style.css'},{filename:'script.js'}];
      }

      if (!fileList.length) fileList = [{filename:'index.html'},{filename:'style.css'},{filename:'script.js'}];

      // Show plan to user
      var planMsg = '🏗️ **Build Plan** for: *'+userMsg+'*\n\n'+
        'I\'ll create **'+fileList.length+' files** step by step:\n\n'+
        fileList.map(function(f,i){ return (i+1)+'. `'+f.filename+'`'+(f.description?' — '+f.description:''); }).join('\n')+
        '\n\n*Building now — one file at a time…*';
      _addMsg('assistant', planMsg);

      // Start session with placeholder content (will be filled per step)
      var files = fileList.map(function(f){ return {filename:f.filename,content:''}; });
      var session = _startStepSession(userMsg, files);
      session.autoAdvance = _config.autoContinue !== false;

      if (_panelEl) _renderPanel(_panelEl);

      // Start building first step
      setTimeout(function(){ _executeStep(0); }, 800);
    });
  }

  // ─── Per-step AI call ─────────────────────────────────────────────────────
  function _callAI(stepPrompt, onDone, useSystemDirectly) {
    var provider = PROVIDERS[_config.provider]; if (!provider) { onDone('Unknown provider.'); return; }
    var effectiveModel = _config.model;

    var customBehavior = (typeof AICustomize!=='undefined') ? AICustomize.getSystemInjection() : '';
    var system = useSystemDirectly ? stepPrompt
      : 'You are the AI in CodeX Editor.\n'+(customBehavior?customBehavior+'\n':'')+
        'Build the requested file. HARD LIMIT: max 80 lines per response.\n'+
        'Use: FILENAME: path/file.ext\n```lang\ncode here\n```\n\n'+
        'Project being built: '+((_stepSession&&_stepSession.projectDesc)||'Unknown')+'\n'+stepPrompt;

    var msgs = useSystemDirectly
      ? _history.slice(-6).map(function(m){return{role:m.role,content:m.content};})
      : [{role:'user',content:stepPrompt}];

    var body = useSystemDirectly
      ? provider.buildBody(msgs, effectiveModel, stepPrompt, provider.supportsStream)
      : provider.buildBody([{role:'user',content:stepPrompt}], effectiveModel, system, provider.supportsStream);

    var ep = typeof provider.endpoint==='function' ? provider.endpoint(_config.apiKey,effectiveModel) : provider.endpoint;

    _abortCtrl = typeof AbortController!=='undefined' ? new AbortController() : null;
    var opts={method:'POST',headers:provider.buildHeaders(_config.apiKey),body:JSON.stringify(body)};
    if(_abortCtrl)opts.signal=_abortCtrl.signal;

    if (provider.supportsStream && !useSystemDirectly) {
      _streamToOnDone(ep, opts, provider, onDone);
    } else {
      fetch(ep, opts).then(function(r){return r.json();}).then(function(data){
        _loading=false;_abortCtrl=null;_removeTyping();
        try{ onDone(provider.parseResponse(data)); } catch(e){ onDone('⚠️ '+e.message); }
      }).catch(function(e){
        _loading=false;_abortCtrl=null;_removeTyping();
        if(e.name!=='AbortError') onDone('⚠️ '+e.message);
      });
    }
  }

  function _callAIRaw(userMsg, system, onDone) {
    var provider=PROVIDERS[_config.provider]; if(!provider){onDone('');return;}
    var ep=typeof provider.endpoint==='function'?provider.endpoint(_config.apiKey,_config.model):provider.endpoint;
    var body=provider.buildBody([{role:'user',content:userMsg}],_config.model,system,false);
    fetch(ep,{method:'POST',headers:provider.buildHeaders(_config.apiKey),body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(data){try{onDone(provider.parseResponse(data));}catch(e){onDone('');}}).catch(function(){onDone('');});
  }

  function _streamToOnDone(endpoint, opts, provider, onDone) {
    var full='';
    fetch(endpoint,opts).then(function(res){
      if(!res.ok)return res.json().then(function(d){throw new Error(d.error&&d.error.message||'HTTP '+res.status);});
      var reader=res.body.getReader(),decoder=new TextDecoder();
      function pump(){return reader.read().then(function(result){
        if(result.done||!_loading){_loading=false;_abortCtrl=null;_removeTyping();onDone(full);return;}
        decoder.decode(result.value,{stream:true}).split('\n').forEach(function(line){
          if(!line.startsWith('data:'))return; var data=line.slice(5).trim(); if(data==='[DONE]')return;
          try{var json=JSON.parse(data);var delta='';
            if(json.choices&&json.choices[0]){var c=json.choices[0];if(c.delta&&c.delta.content)delta=c.delta.content;else if(c.text)delta=c.text;}
            if(json.type==='content_block_delta'&&json.delta&&json.delta.text)delta=json.delta.text;
            if(json.message&&json.message.content)delta=json.message.content;
            if(delta)full+=delta;
          }catch(e){}
        });
        return pump();
      });}
      return pump();
    }).catch(function(e){_loading=false;_abortCtrl=null;_removeTyping();if(e.name!=='AbortError')onDone('⚠️ '+e.message);});
  }

  // ─── Streaming for normal chat (live UI) ──────────────────────────────────
  function _streamResponse(endpoint, opts, provider) {
    var msgEl=document.getElementById('ai-messages');if(!msgEl)return;
    var bubble=document.createElement('div');bubble.className='ai-msg ai-msg-assistant';bubble.id='ai-streaming-bubble';
    bubble.innerHTML='<div class="ai-msg-avatar">🤖</div><div class="ai-msg-body"><div class="ai-stream-text" id="ai-stream-text"><span class="ai-cursor-blink">▊</span></div></div>';
    msgEl.appendChild(bubble);_scrollBot();
    var fullText='',textEl=bubble.querySelector('#ai-stream-text');
    fetch(endpoint,opts).then(function(res){
      if(!res.ok)return res.json().then(function(d){throw new Error(d.error&&d.error.message||'HTTP '+res.status);});
      var reader=res.body.getReader(),decoder=new TextDecoder();
      function pump(){return reader.read().then(function(result){
        if(result.done||!_loading){
          _loading=false;_abortCtrl=null;
          var sb=document.getElementById('ai-streaming-bubble');if(sb)sb.removeAttribute('id');
          if(textEl){textEl.removeAttribute('id');textEl.className='ai-msg-text';}
          _history.push({role:'assistant',content:fullText});_saveHistory();_renderHistory();
          if(_config.autoPreview&&fullText.indexOf('```html')!==-1){var hm=fullText.match(/```html\n([\s\S]*?)```/);if(hm&&typeof Runner!=='undefined')setTimeout(function(){Runner.run();},300);}
          return;
        }
        decoder.decode(result.value,{stream:true}).split('\n').forEach(function(line){
          if(!line.startsWith('data:'))return;var data=line.slice(5).trim();if(data==='[DONE]')return;
          try{var json=JSON.parse(data);var delta='';
            if(json.choices&&json.choices[0]){var c=json.choices[0];if(c.delta&&c.delta.content)delta=c.delta.content;else if(c.text)delta=c.text;}
            if(json.type==='content_block_delta'&&json.delta&&json.delta.text)delta=json.delta.text;
            if(json.message&&json.message.content)delta=json.message.content;
            if(delta){fullText+=delta;if(textEl){textEl.innerHTML=_formatMd(fullText)+'<span class="ai-cursor-blink">▊</span>';_scrollBot();}}
          }catch(e){}
        });
        return pump();
      });}
      return pump();
    }).catch(function(e){_loading=false;_abortCtrl=null;var sb=document.getElementById('ai-streaming-bubble');if(sb)sb.remove();if(e.name!=='AbortError')_addMsg('assistant','⚠️ '+e.message);});
  }

  // ─── Image generation ─────────────────────────────────────────────────────
  function _generateImage(prompt){
    _history.push({role:'user',content:'🎨 '+prompt});_saveHistory();_renderHistory();
    var seed=Math.floor(Math.random()*99999);
    var url='https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width=512&height=512&seed='+seed+'&nologo=true';
    _addMsg('assistant','🎨 *'+prompt+'*\n\nPOLLINATIONS_IMG:'+url+'|512×512\n\n[Pollinations.ai — free, no key]');
  }

  // ─── File creation modal ──────────────────────────────────────────────────
  function _createFilesFromMsg(btn, idx) {
    var rawText=''; if(idx>=0&&_history[idx])rawText=_history[idx].content||'';
    var files=_parseFiles(rawText);
    if(files.length===0){if(UI)UI.toast('No files found. Ask AI to use FILENAME: file.ext','warn');return;}
    var overlay=document.getElementById('modal-overlay'),modal=document.getElementById('modal');
    if(!overlay||!modal){files.forEach(function(f){_upsertFile(f.filename,f.content);});saveToStorage();if(UI)UI.toast('Created '+files.length+' files','success');return;}
    modal.style.width='min(520px,96vw)';
    modal.innerHTML=[
      '<div class="modal-header"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🤖</span><span class="modal-title">Create Files</span></div><button id="modal-close-btn" class="modal-close">'+Icons.getUI('close')+'</button></div>',
      '<div class="modal-body" style="padding:0;max-height:70vh;overflow:hidden;display:flex;flex-direction:column">',
        '<div style="padding:10px 14px;background:#161b22;border-bottom:1px solid #30363d;flex-shrink:0">',
          '<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">Creating <strong style="color:var(--text-bright)">'+files.length+' file'+(files.length!==1?'s':'')+'</strong></div>',
          '<div style="display:flex;flex-wrap:wrap;gap:4px">',
            files.map(function(f){return'<span style="background:#21262d;border:1px solid #30363d;border-radius:4px;padding:2px 8px;font-size:11px;font-family:var(--font-code);color:var(--text)">📄 '+_escHtml(f.filename.split('/').pop())+'</span>';}).join(''),
          '</div>',
        '</div>',
        '<div style="flex:1;overflow-y:auto">',
          '<div id="cm-file-list">',
            files.map(function(f,i){var ext=f.filename.split('.').pop().toLowerCase();var uid='cmf'+i;return'<div class="cm-file-item" id="cmf-wrap-'+uid+'"><div class="cm-file-header" onclick="document.getElementById(\'cmp-'+uid+'\').classList.toggle(\'hidden\')"><div style="display:flex;align-items:center;gap:8px;flex:1"><div class="cmf-bar-wrap"><div class="cmf-bar-fill-inner" style="width:0%"></div></div><span class="cmf-filename">'+_escHtml(f.filename)+'</span><span style="font-size:10px;color:var(--text-dim)">'+f.content.split('\n').length+' lines</span></div><div style="display:flex;align-items:center;gap:6px"><span class="cmf-status-icon">⏳</span><span style="font-size:10px;color:var(--text-dim)">▼</span></div></div><div class="cm-code-preview hidden" id="cmp-'+uid+'"><pre class="cm-code-pre"><code>'+_highlight(f.content,ext)+'</code></pre></div></div>';}).join(''),
          '</div>',
        '</div>',
        '<div id="cm-summary" style="padding:8px 14px;border-top:1px solid #1a1a1a;display:none;font-size:12px;flex-shrink:0"></div>',
      '</div>',
      '<div class="modal-footer"><button id="modal-cancel" class="btn-sm">Cancel</button><button id="cm-create-btn" class="btn-sm btn-primary-sm">📁 Create All</button></div>',
    ].join('');
    overlay.classList.remove('hidden');
    modal.querySelector('#modal-close-btn').onclick=function(){overlay.classList.add('hidden');};
    modal.querySelector('#modal-cancel').onclick=function(){overlay.classList.add('hidden');};
    modal.querySelector('#cm-create-btn').onclick=function(){
      var btn=modal.querySelector('#cm-create-btn');btn.disabled=true;btn.textContent='Creating…';
      var delay=0;
      files.forEach(function(f,i){setTimeout(function(){
        var row=document.getElementById('cmf-wrap-'+('cmf'+i));
        if(row){var bar=row.querySelector('.cmf-bar-fill-inner');if(bar)bar.style.width='100%';}
        _upsertFile(f.filename,f.content);
        if(row)setTimeout(function(){var st=row.querySelector('.cmf-status-icon');if(st)st.textContent='✅';},100);
        if(i===files.length-1){setTimeout(function(){saveToStorage();if(typeof FolderTree!=='undefined')FolderTree.render(document.getElementById('file-list'));if(typeof TabManager!=='undefined')TabManager.render();var sumEl=document.getElementById('cm-summary');if(sumEl){sumEl.style.display='block';sumEl.innerHTML='✅ Created '+files.length+' files!';}btn.textContent='✅ Done';if(UI)UI.toast('📁 '+files.length+' files created!','success');setTimeout(function(){overlay.classList.add('hidden');},1500);},300);}
      },delay);delay+=Math.min(500,1600/files.length);});
    };
  }

  function _parseFiles(text){
    var results=[];
    var re1=/FILENAME:\s*([^\n`|*_]{1,120}?)\s*\n[\s\S]*?```(?:\w*)\n([\s\S]*?)```/gi,m;
    while((m=re1.exec(text))!==null){var fn=m[1].trim().replace(/^["'`]|["'`]$/g,'');if(fn&&fn.includes('.')&&!fn.includes(' ')&&fn.length<100)results.push({filename:fn,content:m[2]||''});}
    if(results.length===0){var re2=/(?:\/\/|#)\s*File:\s*([^\n\r]+)/g,matches=[];while((m=re2.exec(text))!==null)matches.push({fn:m[1].trim(),idx:m.index});for(var i=0;i<matches.length;i++){var start=text.indexOf('\n',matches[i].idx)+1;var end=i+1<matches.length?matches[i+1].idx:text.length;results.push({filename:matches[i].fn,content:text.slice(start,end).replace(/^```[\w]*\n?|```$/gm,'').trim()});}}
    if(results.length===0){var em={javascript:'app.js',js:'app.js',typescript:'app.ts',html:'index.html',css:'style.css',python:'main.py',json:'data.json',bash:'run.sh'},seen={};var re3=/```(\w+)\n([\s\S]*?)```/g;while((m=re3.exec(text))!==null){var lang=m[1].toLowerCase(),fn2=em[lang];if(!fn2)continue;if(seen[fn2]){var ex=fn2.split('.').pop();fn2=fn2.replace('.'+ex,'_'+(Object.keys(seen).length+1)+'.'+ex);}seen[fn2]=true;results.push({filename:fn2,content:m[2]});}}
    return results;
  }

  function _upsertFile(filename,content){
    filename=filename.replace(/\\/g,'/').trim();
    var parts=filename.split('/'),name=parts[parts.length-1];
    var existing=AppState.files.filter(function(f){return f.name===name||f.path===filename;})[0];
    if(existing){existing.content=content;existing.modifiedAt=Date.now();if(existing.id===AppState.activeFileId&&Editor&&Editor._ace)Editor._ace.setValue(content,-1);}
    else{var f=createFileObject(name,content);f.path=filename;AppState.files.push(f);AppState.activeFileId=f.id;if(Editor)Editor.loadFile(f);EventBus.emit(Events.FILE_CREATED,{file:f});}
  }

  // ─── Message rendering ─────────────────────────────────────────────────────
  function _renderMsg(msg, idx) {
    var isUser=msg.role==='user';
    var display=msg._display||msg.content;
    if(isUser){
      var isLong=display&&display.startsWith('\x00PROMPTFILE\x00');
      var raw=isLong?display.slice(14,display.lastIndexOf('\x00/PROMPTFILE\x00')):display;
      var content=isLong?_renderPromptFile(raw,idx):'<div class="ai-msg-text">'+_formatMd(display)+'</div>';
      return'<div class="ai-msg ai-msg-user"><div class="ai-msg-avatar">👤</div><div class="ai-msg-body">'+content+'</div></div>';
    }
    return'<div class="ai-msg ai-msg-assistant">'+
      '<div class="ai-msg-avatar">🤖</div>'+
      '<div class="ai-msg-body">'+
        '<div class="ai-msg-text">'+_formatMd(msg.content)+'</div>'+
        '<div class="ai-msg-actions">'+
          '<button class="ai-action-btn" onclick="AIAssistant._createFiles(this,'+idx+')">📁 Create Files</button>'+
          '<button class="ai-action-btn" onclick="AIAssistant._copyMsg(this,'+idx+')" style="background:rgba(255,255,255,.05);border-color:var(--border)">📋 Copy</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function _renderPromptFile(raw,idx){
    var uid='pf'+idx;
    return'<div class="ai-prompt-file">'+
      '<div class="ai-pf-header" onclick="(function(){var b=document.getElementById(\''+uid+'\');if(b)b.classList.toggle(\'hidden\');var t=document.getElementById(\'pft-'+uid+'\');if(t)t.textContent=b&&b.classList.contains(\'hidden\')?\'▼ show\':\'▲ hide\';})()">'+
        '<div class="ai-pf-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" style="width:13px;height:13px"><path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5L9 1z"/><polyline points="9 1 9 5 13 5"/></svg></div>'+
        '<span class="ai-pf-name">prompt.txt</span>'+
        '<span class="ai-pf-meta">'+raw.length+' chars · '+raw.split('\n').length+' lines</span>'+
        '<span id="pft-'+uid+'" class="ai-pf-toggle">▼ show</span>'+
      '</div>'+
      '<div class="ai-pf-content hidden" id="'+uid+'"><pre class="ai-pf-pre">'+_escHtml(raw.slice(0,2000))+(raw.length>2000?'\n\n…('+( raw.length-2000)+' more)':'')+'</pre></div>'+
    '</div>';
  }

  // ─── Markdown ──────────────────────────────────────────────────────────────
  function _formatMd(text){
    if(!text)return'';
    var s=String(text);
    var codeBlocks=[],thinkBlocks=[];
    s=s.replace(/```(\w*)\n?([\s\S]*?)```/g,function(_,lang,code){codeBlocks.push({lang:lang||'',code:code});return'\x00CODE'+(codeBlocks.length-1)+'\x00';});
    s=s.replace(/<thinking>([\s\S]*?)<\/thinking>/gi,function(_,c){thinkBlocks.push(c);return'\x00THINK'+(thinkBlocks.length-1)+'\x00';});
    s=s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s=s.replace(/POLLINATIONS_IMG:(https?:\/\/[^\s|]+)\|([^\n]+)/g,'<div class="ai-img-result"><img src="$1" alt="$2" style="max-width:100%;border-radius:4px;border:1px solid var(--border);cursor:pointer;margin:4px 0" onclick="window.open(\'$1\',\'_blank\')" loading="lazy"><div style="font-size:10px;color:var(--text-dim);margin-top:2px">$2 · <a href="$1" target="_blank" style="color:var(--accent)">Open</a></div></div>');
    s=s.replace(/`([^`\n]+)`/g,'<code class="ai-inline-code">$1</code>');
    s=s.replace(/^######\s+(.+)$/gm,'<h6 class="ai-h3">$1</h6>');
    s=s.replace(/^#####\s+(.+)$/gm,'<h5 class="ai-h3">$1</h5>');
    s=s.replace(/^####\s+(.+)$/gm,'<h4 class="ai-h3">$1</h4>');
    s=s.replace(/^###\s+(.+)$/gm,'<h3 class="ai-h3">$1</h3>');
    s=s.replace(/^##\s+(.+)$/gm,'<h2 class="ai-h2">$1</h2>');
    s=s.replace(/^#\s+(.+)$/gm,'<h1 class="ai-h1">$1</h1>');
    s=s.replace(/\*\*\*([^*\n]+)\*\*\*/g,'<strong><em>$1</em></strong>');
    s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*\n]+)\*/g,'<em>$1</em>');
    s=s.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
    s=s.replace(/^[ \t]*[-*•]\s+(.+)$/gm,'<li>$1</li>');
    s=s.replace(/^[ \t]*\d+\.\s+(.+)$/gm,'<li>$1</li>');
    s=s.replace(/((?:<li>[\s\S]*?<\/li>[ \t]*\n?)+)/g,'<ul class="ai-list">$1</ul>');
    s=s.replace(/^&gt;\s?(.+)$/gm,'<blockquote class="ai-blockquote">$1</blockquote>');
    s=s.replace(/^---+$/gm,'<hr style="border:none;border-top:1px solid var(--border);margin:10px 0">');
    s=s.replace(/\n\n+/g,'</p><p class="ai-p">');
    s=s.replace(/\n/g,'<br>');
    s='<p class="ai-p">'+s+'</p>';
    s=s.replace(/\x00THINK(\d+)\x00/g,function(_,i){var c=thinkBlocks[+i]||'';var uid='th'+Math.random().toString(36).slice(2,6);return'<div class="ai-think-block"><div class="ai-think-header" onclick="(function(){var b=document.getElementById(\''+uid+'\');if(b)b.classList.toggle(\'hidden\');this.querySelector(\'.ai-think-arrow\').textContent=b&&b.classList.contains(\'hidden\')?\'▶\':\'▼\';}).call(this)"><span class="ai-think-arrow">▶</span><span>🧠 Thinking</span><span class="ai-think-show">expand</span></div><div class="ai-think-content hidden" id="'+uid+'">'+_escHtml(c)+'</div></div>';});
    s=s.replace(/\x00CODE(\d+)\x00/g,function(_,i){var cb=codeBlocks[+i];if(!cb)return'';var uid='c'+Math.random().toString(36).slice(2,6);var lines=cb.code.split('\n').length;return'<div class="ai-code-wrap"><div class="ai-code-header"><span class="ai-code-lang">'+(cb.lang||'code')+'</span><span style="font-size:10px;color:var(--text-dim)">'+lines+' lines</span><button class="ai-copy-btn" onclick="(function(b){var c=b.closest(\'.ai-code-wrap\').querySelector(\'code\');if(c)navigator.clipboard&&navigator.clipboard.writeText(c.textContent).then(function(){b.textContent=\'✓\';setTimeout(function(){b.textContent=\'Copy\'},1500)});})(this)">Copy</button></div><div class="ai-code-block"><code class="hljs language-'+_escHtml(cb.lang)+'">'+_highlight(cb.code,cb.lang)+'</code></div></div>';});
    return s;
  }

  function _addMsg(role,content){_history.push({role:role,content:content});_saveHistory();_renderHistory();var c=document.getElementById('ai-hist-count');if(c)c.textContent=_history.length+' msgs';}
  function _renderHistory(){
    var el=document.getElementById('ai-messages');if(!el)return;
    el.innerHTML=_history.map(function(msg,idx){return _renderMsg(msg,idx);}).join('');
    if(_hlReady&&window.hljs)el.querySelectorAll('code.hljs').forEach(function(b){try{window.hljs.highlightElement(b);}catch(e){}});
    _scrollBot();
  }
  function _showTyping(){var el=document.getElementById('ai-messages');if(!el)return;var t=document.createElement('div');t.className='ai-msg ai-msg-assistant';t.id='ai-typing';t.innerHTML='<div class="ai-msg-avatar">🤖</div><div class="ai-msg-body"><div class="ai-dots"><span></span><span></span><span></span></div><div style="font-size:10px;color:var(--text-dim);margin-top:4px">Planning…</div></div>';el.appendChild(t);_scrollBot();}
  function _removeTyping(){var t=document.getElementById('ai-typing');if(t)t.remove();}
  function _scrollBot(){var el=document.getElementById('ai-messages');if(el)el.scrollTop=el.scrollHeight;}

  // ─── Step session persistence ─────────────────────────────────────────────
  function _saveStepSession()  { try{if(_stepSession)localStorage.setItem(STEP_KEY,JSON.stringify({projectDesc:_stepSession.projectDesc,steps:_stepSession.steps.map(function(s){return{filename:s.filename,part:s.part,total:s.total,done:s.done,action:s.action};}),current:_stepSession.current,completed:_stepSession.completed,complete:_stepSession.complete}));}catch(e){} }
  function _loadStepSession()  { try{var s=JSON.parse(localStorage.getItem(STEP_KEY)||'null');if(s&&!s.complete){_stepSession=s;_stepSession.autoAdvance=true;_stepSession.paused=true;}}catch(e){} }
  function _clearStepSession() { _stepSession=null; try{localStorage.removeItem(STEP_KEY);}catch(e){} }

  // ─── Persistence ──────────────────────────────────────────────────────────
  function _saveHistory(){try{localStorage.setItem(HIST_KEY,JSON.stringify(_history.slice(-40)));}catch(e){}}
  function _loadHistory(){try{_history=JSON.parse(localStorage.getItem(HIST_KEY)||'[]');}catch(e){_history=[];}}
  function _saveConfig() {try{localStorage.setItem(CFG_KEY,JSON.stringify(_config));}catch(e){}}
  function _loadConfig() {try{_config=JSON.parse(localStorage.getItem(CFG_KEY)||'null');}catch(e){_config=null;}}
  function _saveKeys()   {try{localStorage.setItem(KEYS_KEY,JSON.stringify(_savedKeys));}catch(e){}}
  function _loadKeys()   {try{_savedKeys=JSON.parse(localStorage.getItem(KEYS_KEY)||'{}');}catch(e){_savedKeys={};}}

  function _esc(s)    {return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function _escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  return {
    init, openConfigModal, toggleVoice,
    _sendMsg,
    _createFiles:    function(btn,idx){ _createFilesFromMsg(btn,idx); },
    _copyMsg:        function(btn,idx){ var m=_history[idx];if(m&&navigator.clipboard)navigator.clipboard.writeText(m.content).then(function(){btn.textContent='✓';setTimeout(function(){btn.textContent='📋 Copy';},1500);}); },
    _triggerContinue: _triggerContinue,
    _clearSession:   function(){ _clearStepSession(); if(_panelEl)_renderPanel(_panelEl); if(UI)UI.toast('Build session cleared','info'); },
  };
})();
