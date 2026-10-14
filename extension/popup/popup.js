/**
 * AgentQA - Popup Controller
 * Manages recorder state machine UI, reactive session updates,
 * script export, and backend synchronization.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnClear = document.getElementById('btn-clear');
  const stepCountBadge = document.getElementById('step-count-badge');
  const stepsList = document.getElementById('steps-list');
  const emptyState = document.getElementById('empty-state');
  const exportFormatSelect = document.getElementById('export-format-select');
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');
  const btnSendBackend = document.getElementById('btn-send-backend');
  const backendUrlInput = document.getElementById('backend-url');
  const syncStatus = document.getElementById('sync-status');

  // Load active session state
  const session = await chrome.storage.session.get([
    'recordingState',
    'recordedSteps',
    'sessionMeta'
  ]);

  renderUI(session.recordingState || 'idle', session.recordedSteps || []);

  // Reactive listener: update UI when storage changes in service worker
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'session') return;
    chrome.storage.session.get(['recordingState', 'recordedSteps', 'sessionMeta']).then((res) => {
      renderUI(res.recordingState || 'idle', res.recordedSteps || []);
    });
  });

  // --- Actions ---

  btnStart.addEventListener('click', async () => {
    btnStart.disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.runtime.sendMessage({ type: 'START_RECORDING', tabId: tab ? tab.id : null }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('Error starting:', chrome.runtime.lastError);
      }
    });
  });

  btnPause.addEventListener('click', async () => {
    const session = await chrome.storage.session.get('recordingState');
    const isPaused = session.recordingState === 'paused';
    chrome.runtime.sendMessage({ type: isPaused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING' });
  });

  btnStop.addEventListener('click', async () => {
    btnStop.disabled = true;
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
  });

  btnClear.addEventListener('click', async () => {
    if (confirm('Clear all recorded actions?')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_RECORDING' });
    }
  });

  btnDownload.addEventListener('click', async () => {
    const { recordedSteps = [], sessionMeta = {} } = await chrome.storage.session.get([
      'recordedSteps',
      'sessionMeta'
    ]);
    if (recordedSteps.length === 0) return;

    const format = exportFormatSelect.value;
    const exportResult = generateExport(format, recordedSteps, sessionMeta);
    window.AgentQAExporter.triggerDownload(exportResult.content, exportResult.fileName, exportResult.mimeType);
  });

  btnCopy.addEventListener('click', async () => {
    const { recordedSteps = [], sessionMeta = {} } = await chrome.storage.session.get([
      'recordedSteps',
      'sessionMeta'
    ]);
    if (recordedSteps.length === 0) return;

    const format = exportFormatSelect.value;
    const exportResult = generateExport(format, recordedSteps, sessionMeta);
    await navigator.clipboard.writeText(exportResult.content);

    const originalText = btnCopy.textContent;
    btnCopy.textContent = 'Copied!';
    setTimeout(() => {
      btnCopy.textContent = originalText;
    }, 1500);
  });

  btnSendBackend.addEventListener('click', async () => {
    const { recordedSteps = [], sessionMeta = {} } = await chrome.storage.session.get([
      'recordedSteps',
      'sessionMeta'
    ]);
    if (recordedSteps.length === 0) return;

    const baseUrl = (backendUrlInput.value || 'http://localhost:8000').replace(/\/$/, '');
    syncStatus.textContent = 'Sending to AgentQA AI Backend...';
    btnSendBackend.disabled = true;

    try {
      // 1. Ingest recording
      const ingestRes = await fetch(`${baseUrl}/api/v1/recordings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: sessionMeta.title || 'Recorded Flow',
          source_url: sessionMeta.startUrl || (recordedSteps[0]?.url) || 'unknown',
          steps: recordedSteps
        })
      });

      if (!ingestRes.ok) {
        throw new Error(`Ingest failed: HTTP ${ingestRes.status}`);
      }

      const recordingData = await ingestRes.json();
      syncStatus.textContent = 'Generating POM & Assertions with LLM...';

      // 2. Generate polished test
      const genRes = await fetch(`${baseUrl}/api/v1/recordings/${recordingData.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framework: 'playwright' })
      });

      if (!genRes.ok) {
        throw new Error(`Generation failed: HTTP ${genRes.status}`);
      }

      const testData = await genRes.json();
      syncStatus.textContent = '✓ Test generated! Downloading...';

      window.AgentQAExporter.triggerDownload(
        testData.code,
        `agentqa-pom-test-${testData.id.substring(0, 8)}.spec.ts`,
        'text/typescript'
      );
    } catch (err) {
      console.error(err);
      syncStatus.textContent = '✗ Error: ' + err.message;
    } finally {
      btnSendBackend.disabled = false;
      setTimeout(() => {
        syncStatus.textContent = '';
      }, 5000);
    }
  });

  // --- Rendering UI ---

  function renderUI(state, steps) {
    const isRecording = state === 'recording';
    const isPaused = state === 'paused';
    const hasSteps = steps.length > 0;

    // Status Pill
    statusPill.className = `status-pill ${state}`;
    statusText.textContent = state.toUpperCase();

    // Button states
    btnStart.disabled = isRecording;
    btnPause.disabled = !isRecording && !isPaused;
    btnPause.textContent = isPaused ? 'Resume' : 'Pause';
    btnStop.disabled = state === 'idle';
    btnDownload.disabled = !hasSteps;
    btnCopy.disabled = !hasSteps;
    btnSendBackend.disabled = !hasSteps || isRecording;

    // Step counter
    stepCountBadge.textContent = `${steps.length} step${steps.length === 1 ? '' : 's'}`;

    // Steps list
    if (steps.length === 0) {
      emptyState.style.display = 'block';
      stepsList.innerHTML = '';
    } else {
      emptyState.style.display = 'none';
      stepsList.innerHTML = steps.slice(-10).map(s => {
        const typeClass = (s.type || '').toLowerCase();
        let desc = '';

        if (s.type === 'navigate') {
          desc = s.url || '';
        } else if (s.type === 'click') {
          desc = s.elementInfo?.textPreview || (s.selectors ? s.selectors[0][0] : 'element');
        } else if (s.type === 'change') {
          desc = `"${s.value}" → ${s.elementInfo?.name || (s.selectors ? s.selectors[0][0] : 'input')}`;
        } else if (s.type === 'keyDown') {
          desc = `Key: ${s.key}`;
        }

        return `
          <li class="step-item">
            <span class="step-tag ${typeClass}">${s.type}</span>
            <span class="step-desc" title="${escapeHtml(desc)}">${escapeHtml(desc)}</span>
          </li>
        `;
      }).join('');
      // Scroll to bottom
      const container = document.getElementById('steps-container');
      container.scrollTop = container.scrollHeight;
    }
  }

  function generateExport(format, steps, meta) {
    switch (format) {
      case 'playwright-ts':
        return window.AgentQAExporter.exportAsPlaywrightTS(steps, meta);
      case 'playwright-py':
        return window.AgentQAExporter.exportAsPlaywrightPython(steps, meta);
      case 'cypress':
        return window.AgentQAExporter.exportAsCypress(steps, meta);
      case 'selenium':
        return window.AgentQAExporter.exportAsSeleniumPython(steps, meta);
      case 'json':
      default:
        return window.AgentQAExporter.exportAsJSON(steps, meta);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
