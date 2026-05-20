/**
 * git-github.js — GitHub API integration: commit, push, pull, repo browser
 */
var GitHubIntegration = (function() {

  var TOKEN_KEY = 'codex:github-token';
  var REPO_KEY  = 'codex:github-repo';
  var _token    = '';
  var _repo     = '';   // owner/repo
  var _panelEl  = null;
  var _commits  = [];
  var _branch   = 'main';

  function init() {
    _token = localStorage.getItem(TOKEN_KEY) || '';
    _repo  = localStorage.getItem(REPO_KEY)  || '';

    PanelSystem.register({
      id: 'github', title: 'GitHub',
      icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
      render: _render,
      onShow: function(el) { _panelEl = el; if (_token && _repo) _loadRecentCommits(); },
    });

    if (typeof CommandPalette !== 'undefined') {
      CommandPalette.register({ id:'gh-commit', label:'GitHub: Commit & Push',    category:'Git', action: _commitPush });
      CommandPalette.register({ id:'gh-pull',   label:'GitHub: Pull Latest',       category:'Git', action: _pull });
      CommandPalette.register({ id:'gh-setup',  label:'GitHub: Connect Repository',category:'Git', action: _showSetup });
    }
  }

  function _render(container) {
    _panelEl = container;
    if (!_token || !_repo) { _renderSetup(container); return; }

    container.innerHTML = [
      '<div style="display:flex;flex-direction:column;height:100%">',
        '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a;background:#1e1e1e;flex-shrink:0">',
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">',
            '<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
            '<span style="font-size:12px;font-weight:600;color:var(--text-bright)">' + _esc(_repo) + '</span>',
            '<span style="font-size:10px;color:var(--text-dim);background:rgba(255,255,255,.08);padding:1px 6px;border-radius:10px">' + _branch + '</span>',
            '<button id="gh-settings-btn" class="icon-btn" style="margin-left:auto" title="Change repo">⚙</button>',
          '</div>',
          '<div style="display:flex;gap:6px">',
            '<button id="gh-commit-btn" class="btn-sm btn-primary-sm" style="flex:1;font-size:11px">⬆ Commit & Push</button>',
            '<button id="gh-pull-btn"   class="btn-sm"               style="flex:1;font-size:11px">⬇ Pull</button>',
          '</div>',
          '<input id="gh-msg" placeholder="Commit message…" style="width:100%;margin-top:6px;background:#1a1a1a;border:1px solid var(--border);border-radius:3px;color:var(--text);font-size:12px;padding:5px 8px;box-sizing:border-box">',
        '</div>',
        '<div style="flex-shrink:0;padding:6px 12px;font-size:10px;font-weight:700;color:var(--text-dim);letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #1a1a1a">Recent Commits</div>',
        '<div id="gh-commits-list" style="flex:1;overflow-y:auto;padding:4px 0">',
          '<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:20px">Loading commits…</div>',
        '</div>',
      '</div>',
    ].join('');

    container.querySelector('#gh-commit-btn').addEventListener('click', _commitPush);
    container.querySelector('#gh-pull-btn').addEventListener('click', _pull);
    container.querySelector('#gh-settings-btn').addEventListener('click', function() { _renderSetup(container); });

    _loadRecentCommits();
  }

  function _renderSetup(container) {
    container.innerHTML = [
      '<div style="padding:16px;display:flex;flex-direction:column;gap:12px">',
        '<div style="text-align:center;padding:10px 0"><svg viewBox="0 0 24 24" fill="currentColor" style="width:36px;height:36px;opacity:.7"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg></div>',
        '<div class="ai-field-label">GitHub Personal Access Token</div>',
        '<input id="gh-token-input" type="password" class="ai-input-field" placeholder="ghp_xxxxxxxxxxxx" value="' + _esc(_token) + '">',
        '<div style="font-size:11px;color:var(--text-dim)">Create at github.com → Settings → Developer settings → Personal access tokens (needs <strong>repo</strong> scope)</div>',
        '<div class="ai-field-label">Repository (owner/repo)</div>',
        '<input id="gh-repo-input" class="ai-input-field" placeholder="yourusername/my-project" value="' + _esc(_repo) + '">',
        '<div class="ai-field-label">Branch</div>',
        '<input id="gh-branch-input" class="ai-input-field" placeholder="main" value="' + _esc(_branch) + '">',
        '<button id="gh-save-btn" class="btn-sm btn-primary-sm">Connect Repository</button>',
        (_token&&_repo?'<button id="gh-back-btn" class="btn-sm">← Back</button>':''),
      '</div>',
    ].join('');

    container.querySelector('#gh-save-btn').addEventListener('click', function() {
      var t = container.querySelector('#gh-token-input').value.trim();
      var r = container.querySelector('#gh-repo-input').value.trim();
      var b = container.querySelector('#gh-branch-input').value.trim() || 'main';
      if (!t || !r) { if(UI)UI.toast('Token and repo are required','error'); return; }
      _token = t; _repo = r; _branch = b;
      localStorage.setItem(TOKEN_KEY, t);
      localStorage.setItem(REPO_KEY,  r);
      if (UI) UI.toast('GitHub connected: ' + r, 'success');
      _render(container);
    });

    var backBtn = container.querySelector('#gh-back-btn');
    if (backBtn) backBtn.addEventListener('click', function() { _render(container); });
  }

  function _showSetup() { if (_panelEl) _renderSetup(_panelEl); else PanelSystem.show('github'); }

  function _loadRecentCommits() {
    if (!_token || !_repo) return;
    var listEl = document.getElementById('gh-commits-list');
    fetch('https://api.github.com/repos/' + _repo + '/commits?per_page=10&sha=' + _branch, {
      headers: { 'Authorization': 'Bearer ' + _token, 'Accept': 'application/vnd.github.v3+json' }
    }).then(function(r){ return r.json(); }).then(function(data) {
      _commits = Array.isArray(data) ? data : [];
      if (!listEl) return;
      if (_commits.length === 0) { listEl.innerHTML = '<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:20px">No commits yet or repo not found.</div>'; return; }
      listEl.innerHTML = _commits.map(function(c) {
        return '<div style="padding:8px 12px;border-bottom:1px solid #1a1a1a">' +
          '<div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(c.commit.message.split('\n')[0]) + '</div>' +
          '<div style="font-size:10px;color:var(--text-dim);margin-top:2px">' + _esc(c.commit.author.name) + ' · ' + new Date(c.commit.author.date).toLocaleDateString() +
          ' <a href="https://github.com/' + _repo + '/commit/' + c.sha + '" target="_blank" style="color:var(--accent);font-family:monospace">' + c.sha.slice(0,7) + '</a></div>' +
        '</div>';
      }).join('');
    }).catch(function(e) {
      if (listEl) listEl.innerHTML = '<div style="color:var(--danger);font-size:11px;padding:10px">Error: ' + e.message + '</div>';
    });
  }

  function _commitPush() {
    if (!_token || !_repo) { _showSetup(); return; }
    var msgEl  = document.getElementById('gh-msg');
    var message = msgEl ? msgEl.value.trim() : '';
    if (!message) message = 'Update from CodeX Editor — ' + new Date().toLocaleString();

    if (UI) UI.toast('Committing to GitHub…', 'info');
    var promises = AppState.files.filter(function(f){ return f.name!=='.gitkeep'&&!f.isImage; })
      .map(function(file) {
        var path = (file.path||file.name).replace(/^\//,'');
        var content = btoa(unescape(encodeURIComponent(file.content||'')));
        // Get current SHA first (to update existing files)
        return fetch('https://api.github.com/repos/' + _repo + '/contents/' + path + '?ref=' + _branch, {
          headers: { 'Authorization': 'Bearer ' + _token, 'Accept': 'application/vnd.github.v3+json' }
        }).then(function(r){ return r.json(); }).then(function(existing) {
          var body = { message: message, content: content, branch: _branch };
          if (existing && existing.sha) body.sha = existing.sha;
          return fetch('https://api.github.com/repos/' + _repo + '/contents/' + path, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json', 'Accept': 'application/vnd.github.v3+json' },
            body: JSON.stringify(body),
          });
        });
      });

    Promise.all(promises).then(function() {
      if (UI) UI.toast('✅ Pushed to GitHub: ' + _repo, 'success');
      if (msgEl) msgEl.value = '';
      _loadRecentCommits();
    }).catch(function(e) {
      if (UI) UI.toast('GitHub push failed: ' + e.message, 'error');
    });
  }

  function _pull() {
    if (!_token || !_repo) { _showSetup(); return; }
    if (UI) UI.toast('Pulling from GitHub…', 'info');
    fetch('https://api.github.com/repos/' + _repo + '/git/trees/' + _branch + '?recursive=1', {
      headers: { 'Authorization': 'Bearer ' + _token, 'Accept': 'application/vnd.github.v3+json' }
    }).then(function(r){ return r.json(); }).then(function(data) {
      if (!data.tree) throw new Error(data.message || 'Failed to fetch tree');
      var fileItems = data.tree.filter(function(item){ return item.type==='blob'; });
      var fetches   = fileItems.map(function(item) {
        return fetch('https://api.github.com/repos/' + _repo + '/contents/' + item.path + '?ref=' + _branch, {
          headers: { 'Authorization': 'Bearer ' + _token, 'Accept': 'application/vnd.github.v3+json' }
        }).then(function(r){ return r.json(); }).then(function(d) {
          return { path: item.path, content: d.encoding==='base64' ? decodeURIComponent(escape(atob(d.content.replace(/\n/g,'')))) : '' };
        });
      });
      return Promise.all(fetches);
    }).then(function(pulledFiles) {
      pulledFiles.forEach(function(pf) {
        var existing = AppState.files.filter(function(f){ return (f.path||f.name)===pf.path; })[0];
        if (existing) { existing.content = pf.content; }
        else { var f = createFileObject(pf.path.split('/').pop(), pf.content); f.path = pf.path; AppState.files.push(f); }
      });
      saveToStorage();
      if (Editor) Editor.loadFile(getActiveFile());
      if (typeof FolderTree !== 'undefined') FolderTree.render(document.getElementById('file-list'));
      if (UI) UI.toast('✅ Pulled ' + pulledFiles.length + ' files from GitHub', 'success');
      _loadRecentCommits();
    }).catch(function(e) {
      if (UI) UI.toast('GitHub pull failed: ' + e.message, 'error');
    });
  }

  function _esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { init };
})();
