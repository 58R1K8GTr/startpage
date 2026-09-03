// ========================================
// Matugen & Pywal/Pywalfox Theme Integration (~/.cache/wal/colors.json)
// ========================================

(function () {
  let matugenWatchInterval = null;
  let lastAppliedContent = '';
  let activeFileHandle = null;

  const MATUGEN_CANDIDATES = [
    './colors.json',
    './colors.css',
    './wal.json',
    './wal.css',
    './matugen.json',
    './matugen.css',
    '../../.cache/wal/colors.json',
    '../../.cache/wal/colors.css',
    '../../.cache/matugen/colors.json',
    '../../.cache/matugen/colors.css',
    '/.cache/wal/colors.json',
    '/.cache/wal/colors.css',
    '/.cache/matugen/colors.json',
    '/.cache/matugen/colors.css',
  ];

  // ---- IndexedDB Helper for FileSystemFileHandle ----
  const DB_NAME = 'StartpageMatugenDB';
  const STORE_NAME = 'handles';

  function _openHandleDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return resolve(null);
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function _saveFileHandle(handle) {
    try {
      const db = await _openHandleDB();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, 'colorsHandle');
    } catch (e) {
      console.warn('Could not store FileHandle in IndexedDB:', e);
    }
  }

  async function _getFileHandle() {
    try {
      const db = await _openHandleDB();
      if (!db) return null;
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('colorsHandle');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  // ---- Refresh Mode Helper (auto 2s vs manual) ----
  function getStoredRefreshMode() {
    return localStorage.getItem('matugenRefreshMode') || 'auto';
  }

  function setRefreshMode(mode) {
    localStorage.setItem('matugenRefreshMode', mode);
    if (mode === 'manual') {
      _stopLiveWatcher();
      if (typeof showToast === 'function') {
        showToast('Modo de atualização definido para MANUAL.', 'info', 4000);
      }
    } else {
      _startLiveWatcher();
      if (typeof showToast === 'function') {
        showToast('Modo de atualização definido para AUTOMÁTICO (2s).', 'info', 4000);
      }
    }
    _updateModeUI();
  }

  /**
   * Ask user preference between Auto (2s) and Manual updates
   */
  async function askRefreshModePreference() {
    if (typeof showConfirm === 'function') {
      const isAuto = await showConfirm(
        'Como você prefere atualizar as cores do tema?\n\n' +
        '⚡ Automático: A startpage lê o arquivo de 2 em 2 segundos e atualiza sozinha quando o wallpaper mudar.\n\n' +
        '🖐️ Manual: O tema só atualiza quando você clicar para selecionar o arquivo ou apertar no botão de reler.',
        {
          title: 'Modo de Atualização de Cores',
          confirmLabel: '⚡ Automático (2 em 2s)',
          cancelLabel: '🖐️ Manual (ao selecionar)'
        }
      );
      const mode = isAuto ? 'auto' : 'manual';
      setRefreshMode(mode);
      return mode;
    }
    return getStoredRefreshMode();
  }

  /**
   * Main entry point to load Matugen/Pywal theme
   * @param {boolean} userAction
   */
  async function loadMatugenTheme(userAction = false) {
    _initBarEventListeners();
    _updateModeUI();

    // 1. Try reading stored handle from IndexedDB (Chromium File System Access API)
    if (!activeFileHandle) {
      activeFileHandle = await _getFileHandle();
    }

    if (activeFileHandle) {
      const success = await _readAndApplyHandle(activeFileHandle, userAction);
      if (success) {
        hideMatugenErrorBanner();
        _startLiveWatcher();
        return;
      }
    }

    // 2. Try stored raw content in localStorage
    const savedColors = localStorage.getItem('matugenCustomColors');
    if (savedColors) {
      _applyMatugenContent(savedColors);
      hideMatugenErrorBanner();
      _startLiveWatcher();
      if (userAction && typeof showToast === 'function') {
        showToast('Tema do Matugen/Pywal aplicado a partir do arquivo salvo!', 'success', 3000);
      }
      return;
    }

    // 3. Try Pywalfox injected CSS variables
    if (_tryDetectPywalfoxVars()) {
      hideMatugenErrorBanner();
      _startLiveWatcher();
      if (userAction && typeof showToast === 'function') {
        showToast('Cores do Pywalfox detectadas e aplicadas!', 'success', 3000);
      }
      return;
    }

    // 4. Try fetching candidate relative files (e.g., ./colors.json)
    const fetched = await _tryFetchMatugenFiles();
    if (fetched) {
      hideMatugenErrorBanner();
      _startLiveWatcher();
      if (userAction && typeof showToast === 'function') {
        showToast('Tema do Matugen/Pywal carregado com sucesso!', 'success', 3000);
      }
    } else {
      showMatugenErrorBanner();
      _startLiveWatcher();
      if (userAction && typeof showToast === 'function') {
        showToast(
          'Selecione ~/.cache/wal/colors.json ou crie o link simbólico ./colors.json!',
          'error',
          6000
        );
      }
    }
  }

  /**
   * Re-read stored file/handle without opening file picker window (Button 2)
   */
  async function reloadMatugenThemeFile(showToastMessage = true) {
    if (!activeFileHandle) {
      activeFileHandle = await _getFileHandle();
    }

    if (activeFileHandle) {
      const success = await _readAndApplyHandle(activeFileHandle, showToastMessage);
      if (success) {
        if (showToastMessage && typeof showToast === 'function') {
          showToast('Cores relidas e aplicadas com sucesso!', 'success', 2500);
        }
        return true;
      }
    }

    const fetched = await _tryFetchMatugenFiles();
    if (fetched) {
      if (showToastMessage && typeof showToast === 'function') {
        showToast('Cores relidas a partir do arquivo local!', 'success', 2500);
      }
      return true;
    }

    if (showToastMessage && typeof showToast === 'function') {
      showToast('Nenhum arquivo armazenado. Abrindo janela de seleção...', 'info', 3000);
    }
    promptMatugenFileSelection();
    return false;
  }

  /**
   * Read handle and apply if changed
   */
  async function _readAndApplyHandle(handle, showToastOnSuccess = false) {
    try {
      if (typeof handle.queryPermission === 'function') {
        const perm = await handle.queryPermission({ mode: 'read' });
        if (perm !== 'granted') {
          const req = await handle.requestPermission({ mode: 'read' });
          if (req !== 'granted') return false;
        }
      }

      const file = await handle.getFile();
      const text = await file.text();

      if (text && text.trim().length > 0) {
        if (text !== lastAppliedContent || showToastOnSuccess) {
          lastAppliedContent = text;
          localStorage.setItem('matugenCustomColors', text);
          _applyMatugenContent(text);
          if (showToastOnSuccess && typeof showToast === 'function') {
            showToast(`Cores aplicadas de "${file.name}"!`, 'success', 3000);
          }
        }
        return true;
      }
    } catch (e) {
      console.warn('Error reading file handle:', e);
    }
    return false;
  }

  /**
   * Start live watching (every 2 seconds) if mode === 'auto'
   */
  function _startLiveWatcher() {
    if (getStoredRefreshMode() === 'manual') {
      _stopLiveWatcher();
      return;
    }

    if (matugenWatchInterval) return;

    matugenWatchInterval = setInterval(async () => {
      const activeTheme = (typeof getStoredTheme === 'function') ? getStoredTheme() : localStorage.getItem('theme');
      if (activeTheme !== 'matugen' || getStoredRefreshMode() === 'manual') {
        _stopLiveWatcher();
        return;
      }

      // Check IndexedDB FileHandle if available
      if (activeFileHandle) {
        const ok = await _readAndApplyHandle(activeFileHandle, false);
        if (ok) {
          hideMatugenErrorBanner();
          return;
        }
      }

      // Check Pywalfox injected variables
      if (_tryDetectPywalfoxVars()) {
        hideMatugenErrorBanner();
        return;
      }

      // Check candidate relative files (e.g. ./colors.json symlink)
      const fetched = await _tryFetchMatugenFiles();
      if (fetched) {
        hideMatugenErrorBanner();
      }
    }, 2000);
  }

  function _stopLiveWatcher() {
    if (matugenWatchInterval) {
      clearInterval(matugenWatchInterval);
      matugenWatchInterval = null;
    }
  }

  /**
   * Detect Pywalfox CSS variables injected into document root
   */
  function _tryDetectPywalfoxVars() {
    const computed = getComputedStyle(document.documentElement);
    const pywalBg = computed.getPropertyValue('--pywal-bg') || computed.getPropertyValue('--pywal-background') || computed.getPropertyValue('--color0');
    const pywalFg = computed.getPropertyValue('--pywal-fg') || computed.getPropertyValue('--pywal-foreground') || computed.getPropertyValue('--color7');
    const pywalPrimary = computed.getPropertyValue('--pywal-color1') || computed.getPropertyValue('--pywal-color2') || computed.getPropertyValue('--color1');

    if (pywalBg && pywalFg && pywalBg.trim() !== '') {
      const key = `${pywalBg.trim()}_${pywalFg.trim()}_${(pywalPrimary || '').trim()}`;
      if (key !== lastAppliedContent) {
        lastAppliedContent = key;
        _applyMatugenColors({
          background: pywalBg.trim(),
          on_background: pywalFg.trim(),
          surface: pywalBg.trim(),
          on_surface: pywalFg.trim(),
          primary: (pywalPrimary || pywalFg).trim(),
        });
      }
      return true;
    }
    return false;
  }

  /**
   * Try candidate paths to fetch matugen/pywal output
   */
  async function _tryFetchMatugenFiles() {
    const timestamp = Date.now();

    for (const path of MATUGEN_CANDIDATES) {
      try {
        const url = `${path}?t=${timestamp}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (response.ok) {
          const text = await response.text();
          if (text && text.trim().length > 0) {
            if (text !== lastAppliedContent) {
              lastAppliedContent = text;
              _applyMatugenContent(text);
            }
            return true;
          }
        }
      } catch (e) {
        // Continue to next candidate
      }
    }
    return false;
  }

  /**
   * Apply raw content string (JSON or CSS)
   */
  function _applyMatugenContent(content) {
    if (content.trim().startsWith('{')) {
      try {
        const json = JSON.parse(content);
        const colorMap = {};

        // Pywal format parsing: special & colors
        if (json.special) {
          if (json.special.background) colorMap.background = json.special.background;
          if (json.special.foreground) colorMap.on_background = json.special.foreground;
        }

        if (json.colors) {
          if (json.colors.color0) colorMap.background = colorMap.background || json.colors.color0;
          if (json.colors.color7) colorMap.on_background = colorMap.on_background || json.colors.color7;
          if (json.colors.color1) colorMap.primary = json.colors.color1;
          if (json.colors.color2) colorMap.secondary = json.colors.color2;
          if (json.colors.color3) colorMap.tertiary = json.colors.color3;
          Object.assign(colorMap, json.colors);
        }

        // Matugen format parsing: colors or top-level keys
        if (json.colors && typeof json.colors === 'object') {
          Object.assign(colorMap, json.colors);
        }

        for (const [k, v] of Object.entries(json)) {
          if (typeof v === 'string') colorMap[k] = v;
        }

        _applyMatugenColors(colorMap);
        return;
      } catch (e) {
        console.error('Failed to parse Matugen/Pywal JSON:', e);
      }
    }

    // Treat as raw CSS
    let styleEl = document.getElementById('matugen-dynamic-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'matugen-dynamic-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = content;
  }

  /**
   * Map color object to CSS style rules
   */
  function _applyMatugenColors(colors) {
    let styleEl = document.getElementById('matugen-dynamic-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'matugen-dynamic-style';
      document.head.appendChild(styleEl);
    }

    let cssRules = 'html.matugen-mode body {\n';

    for (const [key, val] of Object.entries(colors)) {
      if (typeof val === 'string' && val.trim()) {
        const cssVar = key.startsWith('--') ? key : `--${key.replace(/_/g, '-')}`;
        cssRules += `  ${cssVar}: ${val.trim()};\n`;
      }
    }

    const bg = colors.background || colors.surface || colors.color0;
    const fg = colors.on_background || colors.on_surface || colors.foreground || colors.color7;
    const pri = colors.primary || colors.color1 || colors.color2 || colors.color4 || fg;
    const cardBg = colors.surface_container || colors.color0 || bg;
    const border = colors.color8 || colors.color1 || 'rgba(255, 255, 255, 0.15)';

    if (bg) {
      cssRules += `  --background-color: ${bg};\n`;
      cssRules += `  --terminal-bg: ${bg};\n`;
    }
    if (fg) {
      cssRules += `  --text-color: ${fg};\n`;
      cssRules += `  --terminal-text: ${fg};\n`;
    }
    if (pri) {
      cssRules += `  --color-primary: ${pri};\n`;
      cssRules += `  --syn-cmd: ${pri};\n`;
    }
    if (cardBg) {
      cssRules += `  --card-background: ${cardBg};\n`;
    }
    if (border) {
      cssRules += `  --card-border: ${border};\n`;
    }

    cssRules += '}\n';
    styleEl.textContent = cssRules;
  }

  /**
   * Prompt user to select Matugen/Pywal file (~/.cache/wal/colors.json)
   */
  async function promptMatugenFileSelection() {
    // If refresh mode has never been set, ask user preference first
    if (!localStorage.getItem('matugenRefreshMode')) {
      await askRefreshModePreference();
    }

    // Try modern File System Access API
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'Pywal/Matugen Colors File (colors.json)',
            accept: {
              'application/json': ['.json'],
              'text/css': ['.css'],
              'text/plain': ['.txt']
            }
          }]
        });

        if (handle) {
          activeFileHandle = handle;
          await _saveFileHandle(handle);
          const ok = await _readAndApplyHandle(handle, true);
          if (ok) {
            hideMatugenErrorBanner();
            if (getStoredRefreshMode() === 'auto') {
              _startLiveWatcher();
            } else {
              _stopLiveWatcher();
            }
            return;
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') return; // User cancelled
        console.warn('showOpenFilePicker error/fallback:', e);
      }
    }

    // Fallback: standard input type="file"
    let input = document.getElementById('matugen-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'matugen-file-input';
      input.accept = '.json,.css,.txt';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          if (content) {
            lastAppliedContent = content;
            localStorage.setItem('matugenCustomColors', content);
            _applyMatugenContent(content);
            hideMatugenErrorBanner();
            if (getStoredRefreshMode() === 'auto') {
              _startLiveWatcher();
            } else {
              _stopLiveWatcher();
            }
            if (typeof showToast === 'function') {
              showToast(`Arquivo "${file.name}" carregado e aplicado!`, 'success', 3500);
            }
          }
        };
        reader.readAsText(file);
      });
    }
    input.click();
  }

  /**
   * Attach event listeners to the docked controls bar
   */
  function _initBarEventListeners() {
    const pickBtn = document.getElementById('bar-matugen-pick');
    if (pickBtn && !pickBtn._bound) {
      pickBtn._bound = true;
      pickBtn.addEventListener('click', promptMatugenFileSelection);
    }

    const reloadBtn = document.getElementById('bar-matugen-reload');
    if (reloadBtn && !reloadBtn._bound) {
      reloadBtn._bound = true;
      reloadBtn.addEventListener('click', () => reloadMatugenThemeFile(true));
    }

    const modeBtn = document.getElementById('bar-matugen-mode');
    if (modeBtn && !modeBtn._bound) {
      modeBtn._bound = true;
      modeBtn.addEventListener('click', () => {
        const current = getStoredRefreshMode();
        setRefreshMode(current === 'auto' ? 'manual' : 'auto');
      });
    }
  }

  /**
   * Update banner UI & bar UI with current mode status
   */
  function _updateModeUI() {
    const mode = getStoredRefreshMode();
    const modeBtn = document.getElementById('bar-matugen-mode');
    if (modeBtn) {
      if (mode === 'manual') {
        modeBtn.textContent = '🖐️ Modo: Manual';
        modeBtn.title = 'Modo Manual (sem leituras em 2s). Clique para mudar para Automático (2s).';
      } else {
        modeBtn.textContent = '⚡ Modo: Automático (2s)';
        modeBtn.title = 'Modo Automático (lendo de 2s em 2s). Clique para mudar para Manual.';
      }
    }

    const bannerModeBtn = document.querySelector('#matugen-error-banner #matugen-mode-btn');
    if (bannerModeBtn) {
      if (mode === 'manual') {
        bannerModeBtn.textContent = '🖐️ Modo: Manual (Clique p/ Mudar p/ Automático)';
      } else {
        bannerModeBtn.textContent = '⚡ Modo: Automático 2s (Clique p/ Mudar p/ Manual)';
      }
    }
  }

  /**
   * Clear stored custom colors
   */
  function clearMatugenCustomColors() {
    localStorage.removeItem('matugenCustomColors');
    lastAppliedContent = '';
    activeFileHandle = null;
    clearMatugenTheme();
    loadMatugenTheme(true);
  }

  /**
   * Remove Matugen dynamic style and stop watcher
   */
  function clearMatugenTheme() {
    _stopLiveWatcher();
    hideMatugenErrorBanner();

    const styleEl = document.getElementById('matugen-dynamic-style');
    if (styleEl) styleEl.remove();
  }

  /**
   * Display Matugen & Pywal Banner
   */
  function showMatugenErrorBanner() {
    let banner = document.getElementById('matugen-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'matugen-error-banner';
      banner.className = 'matugen-error-banner';
      banner.setAttribute('role', 'alert');

      banner.innerHTML = `
        <div class="matugen-error-header">
          <span class="matugen-error-icon">⚠️</span>
          <span>Matugen / Pywal: Leitura do arquivo de cores</span>
        </div>
        <p class="matugen-error-text">
          O navegador impede a leitura automática de <code>~/.cache/wal/colors.json</code> por segurança.<br>
          <strong>Escolha como deseja que a startpage atualize o tema:</strong>
        </p>
        <div class="matugen-error-actions">
          <button type="button" id="matugen-file-btn" class="matugen-action-btn matugen-btn-primary">📁 Selecionar ~/.cache/wal/colors.json</button>
          <button type="button" id="matugen-mode-btn" class="matugen-action-btn matugen-btn-secondary">⚡ Modo: Automático 2s (Clique p/ Mudar)</button>
          <button type="button" id="matugen-retry-btn" class="matugen-action-btn matugen-btn-secondary">Tentar Novamente ↻</button>
        </div>
      `;

      const container = document.querySelector('.content') || document.body;
      container.insertBefore(banner, container.firstChild);

      const fileBtn = banner.querySelector('#matugen-file-btn');
      if (fileBtn) {
        fileBtn.addEventListener('click', promptMatugenFileSelection);
      }

      const modeBtn = banner.querySelector('#matugen-mode-btn');
      if (modeBtn) {
        modeBtn.addEventListener('click', async () => {
          const current = getStoredRefreshMode();
          const nextMode = current === 'auto' ? 'manual' : 'auto';
          setRefreshMode(nextMode);
        });
      }

      const retryBtn = banner.querySelector('#matugen-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          retryBtn.textContent = 'Verificando...';
          loadMatugenTheme(true).finally(() => {
            retryBtn.textContent = 'Tentar Novamente ↻';
          });
        });
      }
    }
    _updateModeUI();
    banner.style.display = 'flex';
  }

  function hideMatugenErrorBanner() {
    const banner = document.getElementById('matugen-error-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    _initBarEventListeners();
  });

  // Export functions to global scope
  window.loadMatugenTheme = loadMatugenTheme;
  window.clearMatugenTheme = clearMatugenTheme;
  window.promptMatugenFileSelection = promptMatugenFileSelection;
  window.reloadMatugenThemeFile = reloadMatugenThemeFile;
  window.clearMatugenCustomColors = clearMatugenCustomColors;
  window.askRefreshModePreference = askRefreshModePreference;
  window.setRefreshMode = setRefreshMode;
  window.getStoredRefreshMode = getStoredRefreshMode;
  window.retryMatugenTheme = () => loadMatugenTheme(true);
})();
