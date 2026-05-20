/**
 * icons.js — Professional VSCode/JetBrains icon themes v2
 * Supports theme switching: 'vscode' | 'jetbrains' | 'default' | (plugin name)
 * Icon theme saved to localStorage.
 */
var Icons = (function() {

  var _theme = localStorage.getItem('codex:icon-theme') || 'vscode';

  function setTheme(t) { _theme = t; localStorage.setItem('codex:icon-theme', t); }
  function getTheme()  { return _theme; }

  var UI = {
    explorer:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    search:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    plugins:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z"/><line x1="16" y1="8" x2="2" y2="22"/><line x1="17.5" y1="15" x2="9" y2="15"/></svg>',
    close:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    rename:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
    trash:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    newFile:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
    newFolder:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
    openFile:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    openFolder: '<svg viewBox="0 0 24 24" fill="none" stroke="#dcb67a" stroke-width="1.5" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M2 10h20"/></svg>',
    image:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    back:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    chevronR:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
    chevronD:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>',
    run:        '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    stop:       '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
    format:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="7" y2="18"/></svg>',
    find:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    sidebar:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    panel:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="15" x2="21" y2="15"/></svg>',
    cmd:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/></svg>',
    console:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    git:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>',
    upload:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
    plus:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    ai:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>',
    zip:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  };

  // VSCode Seti-exact file icons
  var _vscode = {
    js:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#f7df1e"/><path d="M18.8 22.3c.4.65.91 1.13 1.82 1.13.77 0 1.26-.38 1.26-.91 0-.63-.5-.86-1.35-1.23l-.46-.2c-1.34-.57-2.23-1.28-2.23-2.79 0-1.39 1.06-2.45 2.71-2.45 1.18 0 2.02.41 2.63 1.48l-1.44.92c-.32-.57-.66-.79-1.19-.79-.54 0-.88.34-.88.79 0 .55.34.78 1.13 1.12l.46.2c1.58.68 2.47 1.36 2.47 2.91 0 1.67-1.31 2.58-3.07 2.58-1.72 0-2.84-.82-3.38-1.89zm-6.46.16c.29.52.56.95 1.19.95.61 0 .99-.24.99-1.16V16h1.82v6.31c0 1.92-1.12 2.79-2.76 2.79-1.48 0-2.34-.77-2.78-1.69z" fill="#000"/></svg>',
    ts:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#3178c6"/><path d="M13.82 15H10v2h2.46v9h2.14v-9h2.48v-2h-3.26zm8.11 2v-2h-5.5v11h2.14v-4.5h3.36v-2h-3.36V17z" fill="#fff"/></svg>',
    jsx:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#149eca"/><text x="4" y="22" font-family="monospace" font-size="11" font-weight="bold" fill="#fff">JSX</text></svg>',
    tsx:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#3178c6"/><text x="4" y="22" font-family="monospace" font-size="11" font-weight="bold" fill="#61dafb">TSX</text></svg>',
    html: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#e34c26"/><path d="M6 3l1.77 19.83L16 25l8.23-2.17L26 3H6zm17.01 6H11.38l.28 2.97h10.76l-.87 9.78L16 23.23l-5.55-1.48-.38-4.28h2.89l.19 2.14 2.85.77 2.86-.77.3-3.33H10.57L9.71 9h12.58z" fill="#fff"/></svg>',
    css:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#264de4"/><path d="M6 3l1.77 19.83L16 25l8.23-2.17L26 3H6zm15.74 13.14l-.4 4.42-5.34 1.48-5.34-1.48-.36-4.02h2.9l.18 2.05 2.62.7 2.62-.7.27-3.04H9.18L8.41 9h15.18l-.27 2.97H11.8l.19 2.14h9.48l-.27 2.03z" fill="#fff"/></svg>',
    scss: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#bf4080"/><text x="3" y="22" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">SCSS</text></svg>',
    json: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#5a9e6f"/><text x="5" y="22" font-family="monospace" font-size="11" font-weight="bold" fill="#fff">{ }</text></svg>',
    md:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#5e6687"/><path d="M4 10h24v12H4zm2 10V12h3l3 4 3-4h3v8h-2v-5l-2 3h-2l-2-3v5zm16-2l2.5-3H20v-3h6v2l-2.5 3H26v3h-6v-2z" fill="#fff" opacity=".9"/></svg>',
    py:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#3572a5"/><path d="M15.88 5C11.47 5 11.75 6.88 11.75 6.88V8.75h4.21v.56H9.31S7 9.05 7 13.49c0 4.44 2.46 4.28 2.46 4.28h1.47v-2.06s-.08-2.46 2.42-2.46h4.17s2.33.04 2.33-2.25V7.88S19.72 5 15.88 5zm-2.3 1.33c.42 0 .76.34.76.76s-.34.76-.76.76-.76-.34-.76-.76.34-.76.76-.76z" fill="#ffd343"/><path d="M16.12 27c4.41 0 4.13-1.88 4.13-1.88V23.25h-4.21v-.56h6.65S25 22.95 25 18.51c0-4.44-2.46-4.28-2.46-4.28h-1.47v2.06s.08 2.46-2.42 2.46h-4.17S12.15 18.71 12.15 21v3.13S12.28 27 16.12 27zm2.3-1.33c-.42 0-.76-.34-.76-.76s.34-.76.76-.76.76.34.76.76-.34.76-.76.76z" fill="#fff"/></svg>',
    java: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#b07219"/><path d="M13 17s-1.1.64.78.87c2.29.26 3.46.22 5.98-.25 0 0 .66.41 1.58.77-5.64 2.42-12.77-.14-8.36-1.39zm-.69-3.16s-1.24.92.66 1.12c2.44.25 4.39.27 7.74-.37 0 0 .47.47 1.19.73-6.86 2.01-14.49.16-9.59-1.48z" fill="#f89820"/><path d="M17.56 9.79c1.4 1.61-.37 3.06-.37 3.06s3.55-1.83 1.91-4.12c-1.52-2.12-2.69-3.18 3.63-6.83 0 0-9.93 2.48-5.17 7.89z" fill="#f89820"/></svg>',
    rs:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#dea584"/><text x="5" y="22" font-family="monospace" font-size="14" font-weight="bold" fill="#fff">rs</text></svg>',
    go:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#00add8"/><text x="4" y="22" font-family="monospace" font-size="14" font-weight="bold" fill="#fff">Go</text></svg>',
    sh:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#4eaa25"/><text x="4" y="22" font-family="monospace" font-size="12" font-weight="bold" fill="#fff">$_</text></svg>',
    sql:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#e38c00"/><text x="3" y="22" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">SQL</text></svg>',
    php:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#777bb4"/><text x="3" y="22" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">PHP</text></svg>',
    rb:   '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#701516"/><text x="5" y="22" font-family="monospace" font-size="12" font-weight="bold" fill="#fff">rb</text></svg>',
    vue:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#41b883"/><path d="M16 7l-7 12h14z" fill="#fff" opacity=".85"/><path d="M16 11l-4 8h8z" fill="#41b883"/><path d="M16 11l-4 8h8z" fill="#34495e" opacity=".3"/></svg>',
    xml:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#e44d26"/><text x="3" y="22" font-family="monospace" font-size="10" font-weight="bold" fill="#fff">XML</text></svg>',
    yaml: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#cb171e"/><text x="3" y="22" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">YAML</text></svg>',
    toml: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#9c4121"/><text x="3" y="22" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">TOML</text></svg>',
    env:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#ecd53f"/><text x="3" y="21" font-family="monospace" font-size="9" font-weight="bold" fill="#1a1a1a">.env</text></svg>',
    txt:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#6b737c"/><path d="M8 9h16v2H8zm0 4h16v2H8zm0 4h11v2H8z" fill="#fff" opacity=".8"/></svg>',
    svg:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#ffb13b"/><text x="4" y="21" font-family="monospace" font-size="9" font-weight="bold" fill="#1a1a1a">SVG</text></svg>',
    png:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#4e80c4"/><circle cx="10" cy="10" r="3" fill="#ffd700" opacity=".9"/><path d="M4 22l8-9 5 6 3-3 7 6z" fill="#2ecc71" opacity=".9"/></svg>',
    jpg:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#4e80c4"/><circle cx="10" cy="10" r="3" fill="#ffd700" opacity=".9"/><path d="M4 22l8-9 5 6 3-3 7 6z" fill="#e74c3c" opacity=".9"/></svg>',
    gif:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#9b59b6"/><text x="4" y="21" font-family="monospace" font-size="9" font-weight="bold" fill="#fff">GIF</text></svg>',
    cpp:  '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#f34b7d"/><text x="3" y="22" font-family="monospace" font-size="11" font-weight="bold" fill="#fff">C++</text></svg>',
    c:    '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="3" fill="#555"/><text x="8" y="22" font-family="monospace" font-size="16" font-weight="bold" fill="#fff">C</text></svg>',
    folder:     '<svg viewBox="0 0 32 32"><path d="M3 8a2 2 0 0 1 2-2h8l2 3h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" fill="#dcb67a"/></svg>',
    folderOpen: '<svg viewBox="0 0 32 32"><path d="M3 8a2 2 0 0 1 2-2h8l2 3h12a2 2 0 0 1 2 2v1H3V8z" fill="#dcb67a"/><path d="M3 13h26l-3 13H5L3 13z" fill="#e8c988"/></svg>',
    default:    '<svg viewBox="0 0 32 32"><path d="M20 3H8a2 2 0 0 0-2 2v22a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9l-6-6z" fill="#607d8b"/><path d="M20 3l6 6h-6z" fill="#b0bec5"/></svg>',
  };

  // JetBrains variant — same structure, slightly different look
  var _jetbrains = Object.assign({}, _vscode, {
    js: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="#1a1a1a"/><rect x="3" y="3" width="26" height="26" rx="4" fill="#f7df1e"/><path d="M18.8 22.3c.4.65.91 1.13 1.82 1.13.77 0 1.26-.38 1.26-.91 0-.63-.5-.86-1.35-1.23l-.46-.2c-1.34-.57-2.23-1.28-2.23-2.79 0-1.39 1.06-2.45 2.71-2.45 1.18 0 2.02.41 2.63 1.48l-1.44.92c-.32-.57-.66-.79-1.19-.79-.54 0-.88.34-.88.79 0 .55.34.78 1.13 1.12l.46.2c1.58.68 2.47 1.36 2.47 2.91 0 1.67-1.31 2.58-3.07 2.58-1.72 0-2.84-.82-3.38-1.89zm-6.46.16c.29.52.56.95 1.19.95.61 0 .99-.24.99-1.16V16h1.82v6.31c0 1.92-1.12 2.79-2.76 2.79-1.48 0-2.34-.77-2.78-1.69z" fill="#000"/></svg>',
    ts: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="#007acc"/><path d="M13.82 15H10v2h2.46v9h2.14v-9h2.48v-2h-3.26zm8.11 2v-2h-5.5v11h2.14v-4.5h3.36v-2h-3.36V17z" fill="#fff"/></svg>',
    py: '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="5" fill="#3572a5"/><path d="M15.88 5C11.47 5 11.75 6.88 11.75 6.88V8.75h4.21v.56H9.31S7 9.05 7 13.49c0 4.44 2.46 4.28 2.46 4.28h1.47v-2.06s-.08-2.46 2.42-2.46h4.17s2.33.04 2.33-2.25V7.88S19.72 5 15.88 5zm-2.3 1.33c.42 0 .76.34.76.76s-.34.76-.76.76-.76-.34-.76-.76.34-.76.76-.76z" fill="#ffd343"/><path d="M16.12 27c4.41 0 4.13-1.88 4.13-1.88V23.25h-4.21v-.56h6.65S25 22.95 25 18.51c0-4.44-2.46-4.28-2.46-4.28h-1.47v2.06s.08 2.46-2.42 2.46h-4.17S12.15 18.71 12.15 21v3.13S12.28 27 16.12 27zm2.3-1.33c-.42 0-.76-.34-.76-.76s.34-.76.76-.76.76.34.76.76-.34.76-.76.76z" fill="#fff"/></svg>',
  });

  function getFileIcon(ext, svgOverride) {
    if (svgOverride && svgOverride.trim().startsWith('<svg')) return svgOverride;
    var map = _theme === 'jetbrains' ? _jetbrains : _vscode;
    return map[ext] || map['default'];
  }
  function getUI(name) { return UI[name] || ''; }

  return { getFileIcon, getUI, UI, setTheme, getTheme };
})();
