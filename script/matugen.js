// ========================================
// Matugen Dynamic Theme Integration (~/.cache/matugen)
// ========================================

(function () {
  let matugenPollInterval = null;
  let matugenLoaded = false;
  let hasShownToastError = false;

  const MATUGEN_CANDIDATES = [
    '../../.cache/matugen/colors.css',
    '../../.cache/matugen/colors.json',
    '../../.cache/matugen/theme.css',
    '../../.cache/matugen/matugen.css',
    '../../.cache/matugen/matugen.json',
    '/.cache/matugen/colors.css',
    '/.cache/matugen/colors.json',
    '/.cache/matugen/theme.css',
    '/.cache/matugen/matugen.css',
    '~/.cache/matugen/colors.css',
    '~/.cache/matugen/colors.json',
    '~/.cache/matugen/theme.css',
  ];

  /**
   * Load Matugen theme from ~/.cache/matugen
   * @param {boolean} userAction - whether triggered explicitly by user command/click
   */
  async function loadMatugenTheme(userAction = false) {
    const success = await _tryFetchMatugenFiles();

    if (success) {
      matugenLoaded = true;
      hasShownToastError = false;
      hideMatugenErrorBanner();
      if (userAction && typeof showToast === 'function') {
        showToast('Tema do Matugen carregado com sucesso!', 'success', 3000);
      }
      _stopMatugenPolling();
    } else {
      matugenLoaded = false;
      showMatugenErrorBanner();

      if ((userAction || !hasShownToastError) && typeof showToast === 'function') {
        showToast(
          'Matugen não encontrado em ~/.cache/matugen. Execute "matugen" para gerar os temas.',
          'error',
          5000
        );
        hasShownToastError = true;
      }

      _startMatugenPolling();
    }
  }

  /**
   * Try candidate paths to fetch matugen output
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
            _applyMatugenContent(text, path);
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
   * Apply fetched Matugen CSS or JSON
   */
  function _applyMatugenContent(content, filePath) {
    let styleEl = document.getElementById('matugen-dynamic-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'matugen-dynamic-style';
      document.head.appendChild(styleEl);
    }

    if (filePath.endsWith('.json') || content.trim().startsWith('{')) {
      try {
        const json = JSON.parse(content);
        const colors = json.colors || json;
        let cssRules = 'html.matugen-mode body {\n';

        for (const [key, val] of Object.entries(colors)) {
          const cssVar = key.startsWith('--') ? key : `--${key.replace(/_/g, '-')}`;
          cssRules += `  ${cssVar}: ${val};\n`;
        }

        // Add explicit mapping for startpage variables
        if (colors.background || colors.surface) {
          cssRules += `  --background-color: ${colors.background || colors.surface};\n`;
        }
        if (colors.on_background || colors.on_surface) {
          cssRules += `  --text-color: ${colors.on_background || colors.on_surface};\n`;
        }
        if (colors.primary) {
          cssRules += `  --color-primary: ${colors.primary};\n`;
          cssRules += `  --syn-cmd: ${colors.primary};\n`;
        }
        if (colors.surface_container || colors.surface) {
          cssRules += `  --card-background: ${colors.surface_container || colors.surface};\n`;
          cssRules += `  --terminal-bg: ${colors.surface_container || colors.surface};\n`;
        }

        cssRules += '}\n';
        styleEl.textContent = cssRules;
        return;
      } catch (e) {
        console.error('Failed to parse Matugen JSON:', e);
      }
    }

    // Treat as CSS
    styleEl.textContent = content;
  }

  /**
   * Remove Matugen dynamic style and stop polling
   */
  function clearMatugenTheme() {
    matugenLoaded = false;
    hasShownToastError = false;
    _stopMatugenPolling();
    hideMatugenErrorBanner();

    const styleEl = document.getElementById('matugen-dynamic-style');
    if (styleEl) styleEl.remove();
  }

  /**
   * Start periodic polling while Matugen mode is active but files are missing
   */
  function _startMatugenPolling() {
    if (matugenPollInterval) return;
    matugenPollInterval = setInterval(async () => {
      const activeTheme = (typeof getStoredTheme === 'function') ? getStoredTheme() : localStorage.getItem('theme');
      if (activeTheme !== 'matugen') {
        _stopMatugenPolling();
        return;
      }

      const success = await _tryFetchMatugenFiles();
      if (success) {
        matugenLoaded = true;
        hideMatugenErrorBanner();
        _stopMatugenPolling();
        if (typeof showToast === 'function') {
          showToast('Matugen detectado e tema aplicado!', 'success', 3000);
        }
      }
    }, 3000);
  }

  function _stopMatugenPolling() {
    if (matugenPollInterval) {
      clearInterval(matugenPollInterval);
      matugenPollInterval = null;
    }
  }

  /**
   * Display Matugen Error Banner until matugen is executed
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
          <span>Erro: Matugen não encontrado</span>
        </div>
        <p class="matugen-error-text">
          Não foi possível carregar os temas do Matugen em <code>~/.cache/matugen</code>.<br>
          Por favor, execute o <code>matugen</code> no seu terminal para gerar os arquivos de cores.
        </p>
        <div class="matugen-error-actions">
          <code class="matugen-cmd-hint">matugen image /caminho/para/imagem.jpg</code>
          <button type="button" id="matugen-retry-btn" class="matugen-retry-btn">Tentar Novamente ↻</button>
        </div>
      `;

      // Insert at top of main content container
      const container = document.querySelector('.content') || document.body;
      container.insertBefore(banner, container.firstChild);

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
    banner.style.display = 'flex';
  }

  /**
   * Hide Matugen Error Banner
   */
  function hideMatugenErrorBanner() {
    const banner = document.getElementById('matugen-error-banner');
    if (banner) {
      banner.style.display = 'none';
    }
  }

  // Export functions to global scope
  window.loadMatugenTheme = loadMatugenTheme;
  window.clearMatugenTheme = clearMatugenTheme;
  window.retryMatugenTheme = () => loadMatugenTheme(true);
})();
