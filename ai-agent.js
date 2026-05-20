/**
 * ai-agent.js — Autonomous AI Agent Mode
 * AI can READ files, WRITE files, CREATE files, RUN code — all autonomously.
 * Inspired by Cursor Composer / Claude Computer Use.
 */
var AIAgent = (function() {

  var _panelEl  = null;
  var _running  = false;
  var _abortCtrl = null;
  var _log      = [];
  var LOG_KEY   = 'codex:agent-log';

  // Tools the agent can use
  var TOOLS = {
    read_file: {
      desc: 'Read the contents of a file in the project',
      fn: function(args) {
        var file = AppState.files.filter(function(f) {
          return f.name === args.filename || (f.path||f.name) === args.filename;
        })[0];
        if (!file) return { error: 'File not found: ' + args.filename };
        return { content: file.content || '', filename: file.name, lines: (file.content||'').split('\n').length };
      }
    },
    write_file: {
      desc: 'Create or update a file with new content',
      fn: function(args) {
        var filename = (args.filename||'').replace(/\\/g, '/').trim();
        var name = filename.split('/').pop();
        var existing = AppState.files.filter(function(f) {
          return f.name === name || (f.path||f.name) === filename;
        })[0];
        if (existing) {
          existing.content = args.content || '';
          existing.modifiedAt = Date.now();
          if (existing.id === AppState.activeFileId && Editor && Editor._ace) {
            Editor._ace.setValue(args.content || '', -1);
          }
        } else {
          var f = createFileObject(name, args.content || '');
          f.path = filename;
          AppState.files.push(f);
          AppState.activeFileId = f.id;
          if (Editor) Editor.loadFile(f);
          EventBus.emit(Events.FILE_CREATED, { file: f });
        }
        saveToStorage();
        if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
        if (typeof TabManager !== 'undefined') TabManager.render();
        return { success: true, filename: filename, action: existing ? 'updated' : 'created' };
      }
    },
    list_files: {
      desc: 'List all files in the current project',
      fn: function() {
        return {
          files: AppState.files.filter(function(f) { return !f.isImage && f.name !== '.gitkeep'; })
            .map(function(f) { return { name: f.name, path: f.path||f.name, lines: (f.content||'').split('\n').length }; })
        };
      }
    },
    delete_file: {
      desc: 'Delete a file from the project',
      fn: function(args) {
        var before = AppState.files.length;
        AppState.files = AppState.files.filter(function(f) {
          return f.name !== args.filename && (f.path||f.name) !== args.filename;
        });
        saveToStorage();
        if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
        return { success: AppState.files.length < before, deleted: args.filename };
      }
    },
    run_preview: {
      desc: 'Run the current project preview',
      fn: function() {
        if (typeof Runner !== 'undefined') { Runner.run(); return { success: true, action: 'preview launched' }; }
        return { error: 'Runner not available' };
      }
    },
    search_files: {
      desc: 'Search for text across all files',
      fn: function(args) {
        var results = [];
        AppState.files.forEach(function(f) {
          if (f.isImage) return;
          var lines = (f.content||'').split('\n');
          lines.forEach(function(line, i) {
            if (line.toLowerCase().indexOf((args.query||'').toLowerCase()) !== -1) {
              results.push({ file: f.name, line: i+1, text: line.trim() });
            }
          });
        });
        return { results: results.slice(0, 30), total: results.length };
      }
    },
    get_active_file: {
      desc: 'Get the currently open file',
      fn: function() {
        var f = typeof getActiveFile !== 'undefined' ? getActiveFile() : null;
        if (!f) return { error: 'No file open' };
        return { filename: f.name, path: f.path||f.name, content: (f.content||'').slice(0, 3000), lines: (f.content||'').split('\n').length };
      }
    },
    append_to_file: {
      desc: 'Append content to end of an existing file',
      fn: function(args) {
        var file = AppState.files.filter(function(f) { return f.name === args.filename || (f.path||f.name) === args.filename; })[0];
        if (!file) return { error: 'File not found' };
        file.content = (file.content||'') + '\n' + (args.content||'');
        file.modifiedAt = Date.now();
        saveToStorage();
        return { success: true, filename: args.filename };
      }
    },
  };

  function init() {
    try { _log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch(e) { _log = []; }

    PanelSystem.register({
      id: 'agent', title: 'Agent',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; }
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'agent-open', label:'Agent: Open AI Agent Mode', category:'AI', action: function(){ PanelSystem.show('agent'); } });
    }
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML =
      '<div class="agent-panel">' +
        '<div class="agent-header">' +
          '<div class="agent-title-row">' +
            '<div class="agent-badge">🤖 AGENT</div>' +
            '<span class="agent-subtitle">Autonomous file editing & project building</span>' +
          '</div>' +
          '<div class="agent-tools-row">' +
            Object.keys(TOOLS).map(function(k) {
              return '<span class="agent-tool-chip" title="'+TOOLS[k].desc+'">'+k.replace(/_/g,' ')+'</span>';
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="agent-log" id="agent-log">' +
          (_log.length === 0
            ? '<div class="agent-empty">Give me a task and I\'ll autonomously read, edit and create files.<br><br>Example: <em>"Build a complete todo app with localStorage"</em></div>'
            : _log.map(_renderLogEntry).join('')) +
        '</div>' +

        '<div class="agent-input-area">' +
          '<textarea id="agent-input" class="agent-input" placeholder="Describe what you want me to build or fix… (I\'ll autonomously edit your files)" rows="3" spellcheck="false"></textarea>' +
          '<div class="agent-input-actions">' +
            '<button class="agent-clear-btn" id="agent-clear">Clear</button>' +
            (_running
              ? '<button class="agent-stop-btn" id="agent-stop">⛔ Stop</button>'
              : '<button class="agent-run-btn" id="agent-run">🚀 Run Agent</button>') +
          '</div>' +
        '</div>' +
      '</div>';

    var runBtn  = container.querySelector('#agent-run');
    var stopBtn = container.querySelector('#agent-stop');
    var clearBtn = container.querySelector('#agent-clear');
    var input   = container.querySelector('#agent-input');

    if (runBtn) runBtn.addEventListener('click', function() {
      var task = input ? input.value.trim() : '';
      if (!task) return;
      if (input) input.value = '';
      _runAgent(task);
    });

    if (stopBtn) stopBtn.addEventListener('click', function() {
      if (_abortCtrl) _abortCtrl.abort();
      _running = false;
      _addLog('system', '⛔ Agent stopped by user.');
      _render(container);
    });

    if (clearBtn) clearBtn.addEventListener('click', function() {
      _log = [];
      try { localStorage.removeItem(LOG_KEY); } catch(e) {}
      _render(container);
    });

    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          var task = input.value.trim();
          if (task) { input.value = ''; _runAgent(task); }
        }
      });
    }

    _scrollLog();
  }

  function _renderLogEntry(entry) {
    var icons = { user:'👤', agent:'🤖', tool:'🔧', result:'✅', error:'❌', system:'💬', think:'🧠' };
    var icon = icons[entry.type] || '•';
    return '<div class="agent-log-entry agent-log-' + entry.type + '">' +
      '<div class="agent-log-icon">' + icon + '</div>' +
      '<div class="agent-log-body">' +
        (entry.label ? '<div class="agent-log-label">' + _escHtml(entry.label) + '</div>' : '') +
        '<div class="agent-log-text">' + _formatAgentText(entry.text||'') + '</div>' +
      '</div>' +
    '</div>';
  }

  function _formatAgentText(text) {
    return _escHtml(text)
      .replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function _addLog(type, text, label) {
    var entry = { type: type, text: text, label: label||'', ts: Date.now() };
    _log.push(entry);
    try { localStorage.setItem(LOG_KEY, JSON.stringify(_log.slice(-100))); } catch(e) {}

    var logEl = document.getElementById('agent-log');
    if (logEl) {
      // Remove empty state
      var empty = logEl.querySelector('.agent-empty');
      if (empty) empty.remove();
      var el = document.createElement('div');
      el.innerHTML = _renderLogEntry(entry);
      logEl.appendChild(el.firstChild);
      _scrollLog();
    }
  }

  function _scrollLog() {
    var el = document.getElementById('agent-log');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ─── Main Agent Loop ────────────────────────────────────────────────────
  function _runAgent(task) {
    if (_running) return;
    var cfg = null;
    var keys = {};
    try { cfg  = JSON.parse(localStorage.getItem('codex:ai-config') || 'null'); } catch(e) {}
    try { keys = JSON.parse(localStorage.getItem('codex:ai-keys')   || '{}');   } catch(e) {}

    if (!cfg || (!cfg.apiKey && cfg.provider !== 'ollama' && !keys[cfg&&cfg.provider])) {
      if (typeof AIAssistant !== 'undefined') AIAssistant.openConfigModal();
      return;
    }

    var apiKey = cfg.apiKey || keys[cfg.provider] || '';
    _running = true;
    if (_panelEl) _render(_panelEl);

    _addLog('user', task);
    _addLog('system', 'Agent started. Reading project files…');

    // Build project context
    var projectFiles = AppState.files.filter(function(f) { return !f.isImage && f.name !== '.gitkeep'; });
    var contextSummary = projectFiles.map(function(f) {
      return f.name + ' (' + (f.content||'').split('\n').length + ' lines)';
    }).join(', ') || 'empty project';

    var systemPrompt = [
      'You are an autonomous coding agent inside CodeX Editor. You have tools to read and write files.',
      '',
      'AVAILABLE TOOLS (call by outputting JSON):',
      Object.keys(TOOLS).map(function(k) { return '- ' + k + ': ' + TOOLS[k].desc; }).join('\n'),
      '',
      'TO USE A TOOL, output EXACTLY this format on its own line:',
      'TOOL: {"name":"tool_name","args":{"key":"value"}}',
      '',
      'RULES:',
      '- Think step by step. Plan first, then execute.',
      '- Always READ files before editing them.',
      '- Write complete file content when using write_file.',
      '- After finishing all tasks, output: DONE: <summary of what was accomplished>',
      '- Max 10 tool calls per task.',
      '- Be autonomous — do not ask for confirmation.',
      '',
      'CURRENT PROJECT FILES: ' + contextSummary,
    ].join('\n');

    _callAgentAPI(apiKey, cfg, systemPrompt, task, 0);
  }

  function _callAgentAPI(apiKey, cfg, systemPrompt, userMsg, iteration) {
    if (!_running || iteration >= 10) {
      if (iteration >= 10) _addLog('system', '⚠️ Max iterations reached (10). Agent stopped.');
      _running = false;
      if (_panelEl) _render(_panelEl);
      return;
    }

    var PROVIDERS_MAP = {
      openrouter: { ep:'https://openrouter.ai/api/v1/chat/completions', headers:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json','HTTP-Referer':'https://codex-editor.app'};} },
      groq:       { ep:'https://api.groq.com/openai/v1/chat/completions', headers:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};} },
      claude:     { ep:'https://api.anthropic.com/v1/messages', headers:function(k){return{'x-api-key':k,'anthropic-version':'2023-06-01','content-type':'application/json'};} },
      chatgpt:    { ep:'https://api.openai.com/v1/chat/completions', headers:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};} },
      deepseek:   { ep:'https://api.deepseek.com/v1/chat/completions', headers:function(k){return{'Authorization':'Bearer '+k,'Content-Type':'application/json'};} },
      gemini:     { ep:function(k,m){return'https://generativelanguage.googleapis.com/v1beta/models/'+(m||'gemini-2.0-flash')+':generateContent?key='+k;}, headers:function(){return{'Content-Type':'application/json'};} },
    };

    var prov = PROVIDERS_MAP[cfg.provider] || PROVIDERS_MAP.openrouter;
    var ep   = typeof prov.ep === 'function' ? prov.ep(apiKey, cfg.model) : prov.ep;

    var messages = [{ role:'user', content: iteration === 0 ? userMsg : userMsg }];

    var body;
    if (cfg.provider === 'claude') {
      body = JSON.stringify({ model: cfg.model || 'claude-sonnet-4-5', max_tokens: 2048, system: systemPrompt, messages: messages });
    } else if (cfg.provider === 'gemini') {
      body = JSON.stringify({ contents:[{role:'user',parts:[{text:systemPrompt+'\n\nTask: '+userMsg}]}], generationConfig:{maxOutputTokens:2048} });
    } else {
      body = JSON.stringify({ model: cfg.model||'gpt-4o-mini', max_tokens:2048, messages:[{role:'system',content:systemPrompt},{role:'user',content:userMsg}] });
    }

    _abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;

    fetch(ep, { method:'POST', headers:prov.headers(apiKey), body:body, signal:_abortCtrl?_abortCtrl.signal:undefined })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!_running) return;

        var text = '';
        if (cfg.provider === 'claude') {
          text = data.content && data.content[0] ? data.content[0].text : '';
        } else if (cfg.provider === 'gemini') {
          text = data.candidates && data.candidates[0] && data.candidates[0].content ? data.candidates[0].content.parts[0].text : '';
        } else {
          text = data.choices && data.choices[0] ? data.choices[0].message.content : '';
        }

        if (!text) { _addLog('error', 'Empty response from AI'); _running=false; if(_panelEl)_render(_panelEl); return; }

        // Parse the response for tool calls and text
        var lines = text.split('\n');
        var thoughtLines = [];
        var toolResults  = [];
        var isDone = false;
        var doneMsg = '';

        lines.forEach(function(line) {
          var trimmed = line.trim();

          // TOOL call detection
          if (trimmed.startsWith('TOOL:')) {
            var jsonStr = trimmed.slice(5).trim();
            try {
              var toolCall = JSON.parse(jsonStr);
              var toolName = toolCall.name;
              var toolArgs = toolCall.args || {};
              var tool     = TOOLS[toolName];

              if (tool) {
                _addLog('tool', 'Calling `' + toolName + '`' + (toolArgs.filename ? ' → `' + toolArgs.filename + '`' : ''), 'TOOL CALL');
                var result = tool.fn(toolArgs);
                toolResults.push({ tool: toolName, args: toolArgs, result: result });

                if (result.error) {
                  _addLog('error', result.error, toolName);
                } else if (toolName === 'write_file') {
                  _addLog('result', '`' + (toolArgs.filename||'') + '` ' + (result.action||'written') + ' (' + (toolArgs.content||'').split('\n').length + ' lines)', 'FILE WRITTEN');
                } else if (toolName === 'read_file') {
                  _addLog('result', '`' + (toolArgs.filename||'') + '` read — ' + (result.lines||0) + ' lines', 'FILE READ');
                } else {
                  _addLog('result', JSON.stringify(result).slice(0, 120), toolName.toUpperCase());
                }
              } else {
                _addLog('error', 'Unknown tool: ' + toolName);
              }
            } catch(e) {
              _addLog('error', 'Failed to parse tool call: ' + jsonStr.slice(0,60));
            }
            return;
          }

          // DONE detection
          if (trimmed.startsWith('DONE:')) {
            isDone = true;
            doneMsg = trimmed.slice(5).trim();
            return;
          }

          // Regular agent thoughts
          if (trimmed) thoughtLines.push(trimmed);
        });

        // Show thoughts if any
        if (thoughtLines.length > 0) {
          _addLog('think', thoughtLines.join('\n'), 'Thinking');
        }

        if (isDone || toolResults.length === 0) {
          _running = false;
          _addLog('system', '✅ ' + (doneMsg || 'Agent task complete!'));
          if (UI) UI.toast('🤖 Agent done!', 'success');
          if (_panelEl) _render(_panelEl);
        } else {
          // Build next message with tool results and continue
          var toolResultSummary = toolResults.map(function(tr) {
            return 'Tool ' + tr.tool + ' result: ' + JSON.stringify(tr.result).slice(0,500);
          }).join('\n');

          _callAgentAPI(apiKey, cfg, systemPrompt, toolResultSummary + '\n\nContinue with the task. Call more tools or output DONE: <summary> when finished.', iteration + 1);
        }
      })
      .catch(function(e) {
        if (e.name === 'AbortError') return;
        _running = false;
        _addLog('error', e.message);
        if (_panelEl) _render(_panelEl);
      });
  }

  function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
