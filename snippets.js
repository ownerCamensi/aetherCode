/**
 * snippets.js — Code snippets system
 * Save reusable code blocks with triggers.
 * Type trigger + Ctrl+Space to expand inline via Ace's snippet system.
 * Also available via command palette and a sidebar panel.
 */
var SnippetSystem = (function() {

  var _snippets   = [];
  var STORAGE_KEY = 'codex:snippets';

  var BUILTIN = [
    { id:'b_cl',   trigger:'cl',      lang:'js',   label:'console.log',     code:'console.log(${1:value});' },
    { id:'b_fn',   trigger:'fn',      lang:'js',   label:'Function',        code:'function ${1:name}(${2:params}) {\n\t${3:// body}\n}' },
    { id:'b_afn',  trigger:'afn',     lang:'js',   label:'Async function',  code:'async function ${1:name}(${2:params}) {\n\t${3:await}\n}' },
    { id:'b_arr',  trigger:'arr',     lang:'js',   label:'Arrow function',  code:'const ${1:name} = (${2:params}) => {\n\t${3:// body}\n};' },
    { id:'b_cls',  trigger:'cls',     lang:'js',   label:'Class',           code:'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t${3:// init}\n\t}\n}' },
    { id:'b_imp',  trigger:'imp',     lang:'js',   label:'Import',          code:"import ${1:module} from '${2:path}';" },
    { id:'b_qs',   trigger:'qs',      lang:'js',   label:'querySelector',   code:"document.querySelector('${1:selector}')" },
    { id:'b_ael',  trigger:'ael',     lang:'js',   label:'addEventListener',code:"${1:el}.addEventListener('${2:click}', function(e) {\n\t${3:// handler}\n});" },
    { id:'b_try',  trigger:'tryc',    lang:'js',   label:'Try/catch',       code:'try {\n\t${1:// code}\n} catch (${2:error}) {\n\tconsole.error(${2:error});\n}' },
    { id:'b_forof',trigger:'forof',   lang:'js',   label:'for...of',        code:'for (const ${1:item} of ${2:items}) {\n\t${3:// body}\n}' },
    { id:'b_html', trigger:'html5',   lang:'html', label:'HTML5 boilerplate',code:'<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:Document}</title>\n</head>\n<body>\n\t${2:<!-- content -->}\n</body>\n</html>' },
    { id:'b_flex', trigger:'flex',    lang:'css',  label:'Flexbox center',  code:'display: flex;\nalign-items: center;\njustify-content: center;' },
    { id:'b_grid', trigger:'grid',    lang:'css',  label:'Grid',            code:'display: grid;\ngrid-template-columns: ${1:repeat(3, 1fr)};\ngap: ${2:16px};' },
    { id:'b_med',  trigger:'media',   lang:'css',  label:'Media query',     code:'@media (max-width: ${1:768px}) {\n\t${2:/* styles */}\n}' },
    { id:'b_pyfn', trigger:'defn',    lang:'py',   label:'Python function', code:'def ${1:name}(${2:params}):\n\t"""${3:docstring}"""\n\t${4:pass}' },
    { id:'b_pycls',trigger:'class',   lang:'py',   label:'Python class',    code:'class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t${3:pass}' },
  ];

  function init() {
    _load();
    _registerAceSnippets();

    PanelSystem.register({
      id:'snippets', title:'Snippets',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 9.511c.076.954.83 1.697 2.182 1.785V12h.6v-.709c1.4-.098 2.218-.846 2.218-1.932 0-.987-.626-1.496-1.745-1.76l-.473-.112V5.57c.6.068.982.396 1.074.85h1.052c-.076-.919-.864-1.638-2.126-1.716V4h-.6v.719c-1.195.117-2.01.836-2.01 1.853 0 .9.606 1.472 1.613 1.707l.397.098v2.034c-.615-.093-1.022-.43-1.114-.9H5.5zm2.177-2.166c-.59-.137-.91-.416-.91-.836 0-.47.345-.822.915-.925v1.76h-.005zm.692 1.193c.717.166 1.048.435 1.048.91 0 .542-.412.914-1.135.982V8.518l.087.02z"/><path d="M3 0h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm0 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3z"/></svg>',
      render: _renderPanel,
    });

    // Command palette
    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'snippets-open', label:'Snippets: Open Snippet Manager', category:'Edit', action: function() { PanelSystem.show('snippets'); } });
      CommandPalette.register({ id:'snippets-new',  label:'Snippets: Save Selection as Snippet', category:'Edit', action: _saveFromSelection });
    }
  }

  function _registerAceSnippets() {
    // Register snippets with Ace's snippet manager
    EventBus.on(Events.APP_READY, function() {
      try {
        var snippetManager = ace.require('ace/snippets').snippetManager;
        var all = BUILTIN.concat(_snippets);
        var byLang = {};
        all.forEach(function(s) {
          var lang = s.lang || 'js';
          if (!byLang[lang]) byLang[lang] = [];
          byLang[lang].push({ trigger: s.trigger, name: s.label, content: s.code });
        });
        Object.keys(byLang).forEach(function(lang) {
          snippetManager.register(byLang[lang], lang);
          snippetManager.register(byLang[lang], lang + 'script'); // js → javascript
        });
      } catch(e) { console.warn('[Snippets] Could not register with Ace:', e); }
    });
  }

  function _renderPanel(container) {
    var all = BUILTIN.concat(_snippets);
    var html = '<div class="snip-panel">';
    html += '<div class="snip-search-row"><input class="snip-search" id="snip-search" placeholder="Search snippets…"><button class="btn-sm btn-primary-sm" id="snip-new-btn">+ New</button></div>';

    // Group by language
    var langs = {};
    all.forEach(function(s) { var l = s.lang||'any'; if (!langs[l]) langs[l] = []; langs[l].push(s); });
    Object.keys(langs).sort().forEach(function(lang) {
      html += '<div class="snip-lang-group"><div class="snip-lang-label">' + lang.toUpperCase() + '</div>';
      langs[lang].forEach(function(s) {
        var isCustom = !s.id.startsWith('b_');
        html += '<div class="snip-item" data-id="' + s.id + '">' +
                '<div class="snip-info"><span class="snip-trigger">' + _esc(s.trigger) + '</span><span class="snip-label">' + _esc(s.label) + '</span></div>' +
                '<div class="snip-actions">' +
                '<button class="snip-insert-btn" data-id="' + s.id + '" title="Insert at cursor">↵</button>' +
                (isCustom ? '<button class="snip-del-btn" data-id="' + s.id + '" title="Delete">×</button>' : '') +
                '</div></div>';
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    // Search filter
    var searchEl = container.querySelector('#snip-search');
    if (searchEl) searchEl.addEventListener('input', function() {
      var q = searchEl.value.toLowerCase();
      container.querySelectorAll('.snip-item').forEach(function(item) {
        item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    container.querySelector('#snip-new-btn').addEventListener('click', _promptNewSnippet);

    container.querySelectorAll('.snip-insert-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _insertSnippet(btn.dataset.id); });
    });
    container.querySelectorAll('.snip-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() { _deleteSnippet(btn.dataset.id); _renderPanel(container); });
    });
  }

  function _insertSnippet(id) {
    var all = BUILTIN.concat(_snippets);
    var s   = all.filter(function(x) { return x.id === id; })[0];
    if (!s || !Editor || !Editor._ace) return;
    try {
      var snippetManager = ace.require('ace/snippets').snippetManager;
      snippetManager.insertSnippet(Editor._ace, s.code);
      Editor._ace.focus();
    } catch(e) {
      // Fallback: just insert the code directly
      Editor._ace.insert(s.code.replace(/\$\{\d+:[^}]*\}/g,'').replace(/\$\d+/g,''));
      Editor._ace.focus();
    }
  }

  function _promptNewSnippet() {
    var trigger = prompt('Trigger (e.g. cl):', '');
    if (!trigger) return;
    var label = prompt('Label:', trigger);
    if (!label) return;
    var lang  = prompt('Language (js/ts/css/html/py):', 'js');
    var code  = Editor && Editor._ace ? Editor._ace.getSelectedText() : '';
    if (!code) code = prompt('Code:', '') || '';
    if (!code) return;
    var s = { id: 'u_' + Date.now(), trigger: trigger, label: label, lang: lang || 'js', code: code };
    _snippets.push(s);
    _save();
    if (UI) UI.toast('Snippet "' + trigger + '" saved!', 'success');
  }

  function _saveFromSelection() {
    PanelSystem.show('snippets');
    setTimeout(_promptNewSnippet, 300);
  }

  function _deleteSnippet(id) {
    _snippets = _snippets.filter(function(s) { return s.id !== id; });
    _save();
  }

  function _save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_snippets)); } catch(e) {} }
  function _load() { try { _snippets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e) { _snippets = []; } }
  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init: init };
})();
