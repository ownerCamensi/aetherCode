/**
 * screenshot-to-code.js — Paste/upload screenshot → AI writes HTML/CSS/JS
 * Uses vision models: Claude claude-sonnet-4-5, GPT-4o, Gemini
 */
var ScreenshotToCode = (function() {

  var _panelEl = null;

  function init() {
    PanelSystem.register({
      id: 'screenshot', title: 'Screenshot',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; }
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'screenshot-to-code', label:'AI: Screenshot → Code', category:'AI', action: function(){ PanelSystem.show('screenshot'); } });
    }

    // Global paste listener — catch clipboard images
    document.addEventListener('paste', function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          var blob = items[i].getAsFile();
          if (blob) {
            PanelSystem.show('screenshot');
            setTimeout(function() { _handleImageFile(blob); }, 200);
          }
          break;
        }
      }
    });
  }

  function _render(container) {
    _panelEl = container;
    container.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%">' +
        '<div style="padding:10px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0">' +
          '<div style="font-size:12px;font-weight:600;color:var(--text-bright);margin-bottom:2px">📸 Screenshot → Code</div>' +
          '<div style="font-size:10px;color:var(--text-dim)">Paste a screenshot (Ctrl+V) or upload an image → AI writes the code</div>' +
        '</div>' +

        // Drop zone
        '<div id="s2c-dropzone" class="s2c-drop" style="margin:12px;border-radius:8px">' +
          '<div class="s2c-drop-inner">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="width:32px;height:32px;color:var(--text-dim);margin-bottom:8px"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
            '<div style="font-size:13px;color:var(--text-dim);margin-bottom:4px">Paste screenshot or drag & drop</div>' +
            '<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">Ctrl+V anywhere to paste</div>' +
            '<button id="s2c-upload" class="btn-sm btn-primary-sm">Choose Image</button>' +
          '</div>' +
          '<input type="file" id="s2c-file-input" accept="image/*" style="display:none">' +
        '</div>' +

        // Preview + generate area
        '<div id="s2c-preview-area" class="hidden" style="flex:1;display:flex;flex-direction:column;padding:0 12px 12px;gap:8px">' +
          '<div style="position:relative">' +
            '<img id="s2c-preview-img" style="max-width:100%;border-radius:6px;border:1px solid var(--border);max-height:180px;object-fit:contain;background:#0d1117">' +
            '<button id="s2c-remove" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">×</button>' +
          '</div>' +

          '<div><div class="ai-field-label">Style / Framework</div>' +
            '<select id="s2c-style" class="ai-select">' +
              '<option value="vanilla">Vanilla HTML + CSS</option>' +
              '<option value="tailwind">Tailwind CSS</option>' +
              '<option value="react">React Component</option>' +
              '<option value="mobile">Mobile-first (responsive)</option>' +
            '</select>' +
          '</div>' +

          '<div><div class="ai-field-label">Extra instructions (optional)</div>' +
            '<input id="s2c-instructions" class="ai-input-field" placeholder="e.g. Use dark theme, add animations…">' +
          '</div>' +

          '<button id="s2c-generate" class="btn-sm btn-primary-sm" style="padding:10px">🚀 Generate Code from Screenshot</button>' +

          '<div id="s2c-output" class="hidden" style="background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:hidden">' +
            '<div style="padding:6px 10px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;justify-content:space-between">' +
              '<span style="font-size:11px;font-weight:600;color:var(--text-bright)">Generated Code</span>' +
              '<div style="display:flex;gap:6px">' +
                '<button id="s2c-copy-code" class="ai-copy-btn">Copy</button>' +
                '<button id="s2c-create-file" class="btn-sm btn-primary-sm" style="font-size:10px;padding:2px 8px">Create File</button>' +
              '</div>' +
            '</div>' +
            '<pre id="s2c-code-pre" style="margin:0;padding:12px;font-family:var(--font-code);font-size:11px;color:#e6edf3;overflow-x:auto;white-space:pre-wrap;max-height:300px;overflow-y:auto"></pre>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Bindings
    var uploadBtn   = container.querySelector('#s2c-upload');
    var fileInput   = container.querySelector('#s2c-file-input');
    var removeBtn   = container.querySelector('#s2c-remove');
    var generateBtn = container.querySelector('#s2c-generate');
    var dropzone    = container.querySelector('#s2c-dropzone');

    if (uploadBtn) uploadBtn.addEventListener('click', function() { if(fileInput)fileInput.click(); });
    if (fileInput) fileInput.addEventListener('change', function() { if(fileInput.files[0]) _handleImageFile(fileInput.files[0]); });
    if (removeBtn) removeBtn.addEventListener('click', function() {
      container.querySelector('#s2c-preview-area').classList.add('hidden');
      container.querySelector('#s2c-dropzone').classList.remove('hidden');
      container.querySelector('#s2c-output').classList.add('hidden');
    });

    // Drag and drop
    if (dropzone) {
      dropzone.addEventListener('dragover', function(e) { e.preventDefault(); dropzone.classList.add('s2c-drag-over'); });
      dropzone.addEventListener('dragleave', function() { dropzone.classList.remove('s2c-drag-over'); });
      dropzone.addEventListener('drop', function(e) {
        e.preventDefault(); dropzone.classList.remove('s2c-drag-over');
        var file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) _handleImageFile(file);
      });
    }

    if (generateBtn) generateBtn.addEventListener('click', _generate);

    var copyBtn = container.querySelector('#s2c-copy-code');
    if (copyBtn) copyBtn.addEventListener('click', function() {
      var pre = container.querySelector('#s2c-code-pre');
      if (pre && navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(function(){ copyBtn.textContent='✓'; setTimeout(function(){copyBtn.textContent='Copy';},1500); });
    });

    var createBtn = container.querySelector('#s2c-create-file');
    if (createBtn) createBtn.addEventListener('click', function() {
      var pre = container.querySelector('#s2c-code-pre');
      if (!pre) return;
      var code = pre.textContent;
      var style = (container.querySelector('#s2c-style')||{}).value || 'vanilla';
      var ext   = style === 'react' ? 'jsx' : 'html';
      var f = createFileObject('screenshot-code.' + ext, code);
      AppState.files.push(f); AppState.activeFileId = f.id;
      if (Editor) Editor.loadFile(f);
      saveToStorage();
      if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
      if (UI) UI.toast('📄 screenshot-code.' + ext + ' created!', 'success');
    });
  }

  var _currentImageBase64 = null;
  var _currentMime        = 'image/png';

  function _handleImageFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _currentImageBase64 = e.target.result.split(',')[1];
      _currentMime        = file.type || 'image/png';

      if (_panelEl) {
        var img = _panelEl.querySelector('#s2c-preview-img');
        if (img) img.src = e.target.result;
        var dz = _panelEl.querySelector('#s2c-dropzone'); if(dz) dz.classList.add('hidden');
        var pa = _panelEl.querySelector('#s2c-preview-area'); if(pa) pa.classList.remove('hidden');
      }
    };
    reader.readAsDataURL(file);
  }

  function _generate() {
    if (!_currentImageBase64) { if(UI) UI.toast('No image loaded','warn'); return; }

    var cfg = null; var keys = {};
    try { cfg  = JSON.parse(localStorage.getItem('codex:ai-config')||'null'); } catch(e) {}
    try { keys = JSON.parse(localStorage.getItem('codex:ai-keys')||'{}'); } catch(e) {}

    if (!cfg) { if(typeof AIAssistant!=='undefined') AIAssistant.openConfigModal(); return; }
    var apiKey = cfg.apiKey || keys[cfg.provider] || '';

    var style = (_panelEl && _panelEl.querySelector('#s2c-style') ? _panelEl.querySelector('#s2c-style').value : 'vanilla');
    var extra = (_panelEl && _panelEl.querySelector('#s2c-instructions') ? _panelEl.querySelector('#s2c-instructions').value : '');
    var styleGuide = {
      vanilla: 'Pure HTML + CSS + JavaScript. No frameworks.',
      tailwind: 'HTML with Tailwind CSS classes. Include Tailwind CDN.',
      react: 'React functional component with hooks. No build tools — use CDN.',
      mobile: 'Mobile-first responsive HTML/CSS. Use CSS Grid/Flexbox.',
    }[style] || '';

    var prompt = 'Look at this screenshot and write the complete code to replicate this UI.\n\n' +
      'Style: ' + styleGuide + '\n' +
      (extra ? 'Extra requirements: ' + extra + '\n' : '') +
      '\nWrite complete, working code. Include all CSS inline or in a <style> tag. No placeholders.';

    var genBtn = _panelEl && _panelEl.querySelector('#s2c-generate');
    if (genBtn) { genBtn.disabled=true; genBtn.textContent='🔄 Generating…'; }

    // Build vision request
    var messages, body, ep, headers;

    if (cfg.provider === 'claude') {
      ep = 'https://api.anthropic.com/v1/messages';
      headers = { 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json' };
      body = JSON.stringify({ model: cfg.model||'claude-sonnet-4-5', max_tokens:4096,
        messages:[{ role:'user', content:[
          { type:'image', source:{ type:'base64', media_type:_currentMime, data:_currentImageBase64 } },
          { type:'text', text:prompt }
        ]}]
      });
    } else if (cfg.provider === 'chatgpt' || cfg.provider === 'openrouter') {
      ep = cfg.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
      headers = { 'Authorization':'Bearer '+apiKey, 'Content-Type':'application/json' };
      body = JSON.stringify({ model: cfg.provider==='openrouter'?(cfg.model||'openai/gpt-4o'):'gpt-4o', max_tokens:4096,
        messages:[{ role:'user', content:[
          { type:'image_url', image_url:{ url:'data:'+_currentMime+';base64,'+_currentImageBase64 } },
          { type:'text', text:prompt }
        ]}]
      });
    } else if (cfg.provider === 'gemini') {
      ep = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=' + apiKey;
      headers = { 'Content-Type':'application/json' };
      body = JSON.stringify({ contents:[{ parts:[
        { inlineData:{ mimeType:_currentMime, data:_currentImageBase64 } },
        { text:prompt }
      ]}], generationConfig:{ maxOutputTokens:4096 } });
    } else {
      if (genBtn) { genBtn.disabled=false; genBtn.textContent='🚀 Generate Code from Screenshot'; }
      if (UI) UI.toast('Screenshot to code needs Claude, GPT-4o, Gemini, or OpenRouter','warn');
      return;
    }

    fetch(ep, { method:'POST', headers:headers, body:body })
      .then(function(r){ return r.json(); })
      .then(function(data) {
        var text = '';
        if (cfg.provider==='claude') text = data.content&&data.content[0]?data.content[0].text:'';
        else if (cfg.provider==='gemini') text = data.candidates&&data.candidates[0]&&data.candidates[0].content?data.candidates[0].content.parts[0].text:'';
        else text = data.choices&&data.choices[0]?data.choices[0].message.content:'';

        // Extract code from markdown
        var codeMatch = text.match(/```(?:html|jsx|javascript|css)?\n?([\s\S]+?)```/);
        var code = codeMatch ? codeMatch[1] : text;

        if (_panelEl) {
          var outEl = _panelEl.querySelector('#s2c-output'); if(outEl) outEl.classList.remove('hidden');
          var pre   = _panelEl.querySelector('#s2c-code-pre'); if(pre) pre.textContent = code;
        }
        if (genBtn) { genBtn.disabled=false; genBtn.textContent='🚀 Generate Code from Screenshot'; }
        if (UI) UI.toast('✅ Code generated from screenshot!', 'success');
      })
      .catch(function(e) {
        if (genBtn) { genBtn.disabled=false; genBtn.textContent='🚀 Generate Code from Screenshot'; }
        if (UI) UI.toast('Error: ' + e.message, 'error');
      });
  }

  return { init };
})();
