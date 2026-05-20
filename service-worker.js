/**
 * service-worker.js v12.13 — Full offline PWA support
 *
 * Strategy: Cache-First for app shell (all JS/CSS/HTML)
 *           Network-First for CDN resources (Ace, hljs, etc.)
 *           Never block startup — if network fails, serve from cache
 */

var CACHE_NAME  = 'codex-v12-15';
var CDN_CACHE   = 'codex-cdn-v12-15';

// ── ALL app shell files (must be 100% complete) ────────────────────────
var APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  // Core
  './state.js',
  './events.js',
  './icons.js',
  './editor.js',
  './ui.js',
  './panel-system.js',
  './file-manager.js',
  './folder-tree.js',
  './tab-manager.js',
  // Editor tools
  './find-replace.js',
  './formatter.js',
  './file-diff.js',
  './snippets.js',
  './split-screen.js',
  './markdown-preview.js',
  // AI
  './ai-assistant.js',
  './ai-suggest.js',
  './ai-agent.js',
  './ai-memory.js',
  './ai-ghost-text.js',
  './ai-code-review.js',
  './ai-customize.js',
  // Features
  './runner.js',
  './lang-runner.js',
  './python-runner.js',
  './screenshot-to-code.js',
  './workspace-sync.js',
  './eslint-linter.js',
  './performance.js',
  './error-intelligence.js',
  './css-tools-panel.js',
  './export-zip.js',
  './templates.js',
  './terminal.js',
  './changelog.js',
  './pwa.js',
  // Panels & plugins
  './plugin-manager.js',
  './plugin-api.js',
  './panel-dragger.js',
  './panel-resizer.js',
  './pip-panel.js',
  './command-palette.js',
  './notification-center.js',
  // UI extras
  './image-import.js',
  './image-viewer.js',
  './imgbg.js',
  './theme-creator.js',
  './theme-marketplace.js',
  './color-picker.js',
  './shadow-picker.js',
  // v12.7+ features
  './project-manager.js',
  './global-search.js',
  './voice-input.js',
  './git-github.js',
  './git-panel.js',
  './code-analytics.js',
  './keybindings.js',
  './power-mode.js',
  './collaboration.js',
  './path-intelligence.js',
  // Icons
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png',
];

// ── Install: pre-cache entire app shell ───────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting(); // activate immediately — don't wait for old tabs to close
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Add files one by one so one failure doesn't block the rest
      return Promise.all(APP_SHELL.map(function(url) {
        return cache.add(url).catch(function(err) {
          console.warn('[SW] Failed to cache:', url, err.message);
        });
      }));
    })
  );
});

// ── Activate: delete all old caches ───────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(k) { return k !== CACHE_NAME && k !== CDN_CACHE; })
          .map(function(k) {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(function() {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── Fetch: smart cache strategy ───────────────────────────────────────
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (url.startsWith('chrome-extension://')) return;
  if (url.startsWith('data:')) return;

  // AI API calls — never cache, always network
  var neverCache = [
    'api.anthropic.com', 'api.openai.com', 'openrouter.ai',
    'api.groq.com', 'generativelanguage.googleapis.com',
    'api.deepseek.com', 'api.together.xyz', 'api.mistral.ai',
    'api.cohere.com', 'api.perplexity.ai', 'api.x.ai',
    'api-inference.huggingface.co', 'localhost:11434',
    'googleapis.com/drive', 'googleapis.com/upload',
    'image.pollinations.ai',
  ];
  if (neverCache.some(function(h) { return url.indexOf(h) !== -1; })) return;

  // CDN resources (Ace, highlight.js, Pyodide) — network first, CDN cache fallback
  var isCDN = url.indexOf('cdnjs.cloudflare.com') !== -1 ||
              url.indexOf('jsdelivr.net') !== -1 ||
              url.indexOf('unpkg.com') !== -1;

  if (isCDN) {
    e.respondWith(
      caches.open(CDN_CACHE).then(function(cache) {
        return fetch(e.request).then(function(res) {
          if (res && res.status === 200) cache.put(e.request, res.clone());
          return res;
        }).catch(function() {
          return cache.match(e.request);
        });
      })
    );
    return;
  }

  // App shell — Cache First, network fallback, then offline page
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(e.request).then(function(res) {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, clone);
        });
        return res;
      }).catch(function() {
        // Offline fallback — serve index.html for navigation requests
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('// Offline', { headers: { 'Content-Type': 'text/plain' } });
      });
    })
  );
});

// ── Message: force update ──────────────────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'CACHE_URLS') {
    // Dynamically cache extra URLs (e.g. Ace theme files)
    var urls = e.data.urls || [];
    caches.open(CDN_CACHE).then(function(cache) {
      urls.forEach(function(url) { cache.add(url).catch(function(){}); });
    });
  }
});
