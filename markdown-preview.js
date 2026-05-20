/**
 * markdown-preview.js — Live Markdown preview panel
 * Renders .md files with syntax highlighting, tables, etc.
 * Auto-opens when an .md file is the active file.
 */
var MarkdownPreview = (function() {

  var _panelEl = null;
  var _visible = false;

  function init() {
    PanelSystem.register({
      id:'markdown', title:'Preview MD',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14 3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 0 1 1h12zM2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H2z"/><path d="M9.5 8.5a.5.5 0 0 0 1 0v-3h2a.5.5 0 0 0 0-1h-2.5a.5.5 0 0 0-.5.5v3.5zm-2.354-3.854a.5.5 0 0 0-.707.708L7.793 6.5 6.439 7.854a.5.5 0 1 0 .707.707l1.5-1.5a.5.5 0 0 0 0-.707l-1.5-1.5z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; _visible = true; _update(); },
      onHide: function()   { _panelEl = null; _visible = false; },
    });

    // Auto-show for .md files
    EventBus.on(Events.FILE_SWITCHED, function(data) {
      if (data && data.file) {
        var ext = data.file.name.split('.').pop().toLowerCase();
        if (ext === 'md' || ext === 'markdown') {
          PanelSystem.show('markdown');
        }
      }
    });

    // Update on edit
    if (typeof Editor !== 'undefined') {
      EventBus.on('editor:change', function() {
        if (_visible) { clearTimeout(_mdTimer); _mdTimer = setTimeout(_update, 400); }
      });
    }
  }

  var _mdTimer = null;

  function _render(container) {
    _panelEl = container;
    container.innerHTML =
      '<div class="md-preview" id="md-preview-body" style="padding:20px 28px;overflow-y:auto;height:100%;background:#1e1e1e;color:#ccc;font-family:\'Inter\',system-ui,sans-serif;font-size:15px;line-height:1.75;"></div>';
    _update();
  }

  function _update() {
    if (!_panelEl) return;
    var file    = getActiveFile();
    var content = '';
    if (file) {
      var ext = file.name.split('.').pop().toLowerCase();
      content = (ext === 'md' || ext === 'markdown')
        ? (Editor && Editor._ace ? Editor._ace.getValue() : file.content || '')
        : file.content || '';
    }
    var body = _panelEl.querySelector('#md-preview-body');
    if (!body) return;
    body.innerHTML = _renderMd(content || '*Open a .md file to preview it here.*');
  }

  // ─── Markdown renderer ─────────────────────────────────────────────────────

  function _renderMd(text) {
    var html = text;

    // Escape HTML (but we'll re-allow some)
    html = html.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    // Code blocks with syntax highlight classes
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, function(_, lang, code) {
      return '<pre class="md-pre"><code class="md-code md-lang-' + (lang||'text') + '">' + code + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline">$1</code>');

    // Headers
    html = html.replace(/^######\s+(.+)$/gm, '<h6 class="md-h">$1</h6>');
    html = html.replace(/^#####\s+(.+)$/gm,  '<h5 class="md-h">$1</h5>');
    html = html.replace(/^####\s+(.+)$/gm,   '<h4 class="md-h">$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm,    '<h3 class="md-h">$1</h3>');
    html = html.replace(/^##\s+(.+)$/gm,     '<h2 class="md-h">$1</h2>');
    html = html.replace(/^#\s+(.+)$/gm,      '<h1 class="md-h">$1</h1>');

    // Blockquote
    html = html.replace(/^&gt;\s?(.+)$/gm, '<blockquote class="md-blockquote">$1</blockquote>');

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr class="md-hr">');

    // Bold + italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Links and images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="md-link" target="_blank">$1</a>');

    // Tables
    html = html.replace(/((?:\|.+\|\n)+)/g, function(tableBlock) {
      var lines = tableBlock.trim().split('\n');
      if (lines.length < 2) return tableBlock;
      var headers = lines[0].split('|').filter(Boolean).map(function(h){ return '<th>' + h.trim() + '</th>'; }).join('');
      var rows = lines.slice(2).map(function(row) {
        var cells = row.split('|').filter(Boolean).map(function(c){ return '<td>' + c.trim() + '</td>'; }).join('');
        return '<tr>' + cells + '</tr>';
      }).join('');
      return '<table class="md-table"><thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
    });

    // Unordered list
    html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li class="md-li">$1</li>');
    html = html.replace(/((?:<li[^>]*>[\s\S]*?<\/li>\n?)+)/g, '<ul class="md-ul">$1</ul>');

    // Ordered list
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="md-oli">$1</li>');
    html = html.replace(/((?:<li class="md-oli">[\s\S]*?<\/li>\n?)+)/g, '<ol class="md-ol">$1</ol>');

    // Paragraphs (double newline)
    html = html.replace(/\n\n(?!<)/g, '</p><p class="md-p">');
    html = '<p class="md-p">' + html + '</p>';

    // Single newlines
    html = html.replace(/(?<!>)\n(?!<)/g, '<br>');

    return '<style>' + _mdStyles() + '</style>' + html;
  }

  function _mdStyles() {
    return [
      '.md-h{color:#e2e8f0;font-weight:700;margin:1.5em 0 .5em;border-bottom:1px solid #2d3748;padding-bottom:.3em;}',
      'h1.md-h{font-size:2em;color:#90cdf4;}',
      'h2.md-h{font-size:1.5em;color:#90cdf4;}',
      'h3.md-h{font-size:1.25em;color:#9ae6b4;}',
      'h4.md-h,h5.md-h,h6.md-h{font-size:1em;color:#faf089;}',
      '.md-p{margin:.75em 0;color:#cbd5e0;}',
      '.md-pre{background:#0d1117;border:1px solid #2d3748;border-radius:6px;padding:14px 16px;overflow-x:auto;margin:1em 0;}',
      '.md-code{font-family:"JetBrains Mono",monospace;font-size:13px;color:#e2e8f0;}',
      '.md-inline{background:#2d3748;color:#fbb6ce;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:.9em;}',
      '.md-blockquote{border-left:4px solid #4a5568;padding:.5em 1em;margin:1em 0;color:#a0aec0;background:rgba(74,85,104,.1);border-radius:0 6px 6px 0;}',
      '.md-hr{border:none;border-top:1px solid #2d3748;margin:2em 0;}',
      '.md-link{color:#63b3ed;text-decoration:none;}.md-link:hover{text-decoration:underline;}',
      '.md-img{max-width:100%;border-radius:6px;margin:1em 0;}',
      '.md-table{width:100%;border-collapse:collapse;margin:1em 0;}',
      '.md-table th{background:#2d3748;color:#e2e8f0;padding:.5em 1em;text-align:left;border:1px solid #4a5568;}',
      '.md-table td{padding:.5em 1em;border:1px solid #2d3748;color:#cbd5e0;}',
      '.md-table tr:nth-child(even) td{background:rgba(45,55,72,.3);}',
      '.md-ul,.md-ol{padding-left:1.5em;margin:.5em 0;}',
      '.md-li,.md-oli{margin:.25em 0;color:#cbd5e0;}',
      'strong{color:#faf089;}em{color:#b794f4;}del{color:#fc8181;text-decoration:line-through;}',
    ].join('');
  }

  return { init };
})();
