/**
 * AgentQA - Content Script Main Entrypoint
 * Initializes DOM recorder, connects with Background Service Worker,
 * and maintains the recording session across page navigations.
 */

(function () {
  'use strict';

  let recorder = null;
  let indicatorEl = null;

  function init() {
    recorder = new window.AgentQADOMEventRecorder((step) => {
      // Dispatch step to background service worker (wakes it up if idle)
      chrome.runtime.sendMessage({
        type: 'RECORD_STEP',
        step: step
      }).catch(err => {
        console.debug('[AgentQA] Step message dispatch error (ignorable if popup closed):', err);
      });
    });

    // Query active session state from background service worker on load
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.recordingState === 'recording') {
        startRecordingUI();
      }
    });

    // Listen for direct commands from popup or service worker
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'SET_RECORDING_ACTIVE') {
        if (message.active) {
          startRecordingUI();
        } else {
          stopRecordingUI();
        }
        sendResponse({ success: true });
      }
      return true;
    });
  }

  function startRecordingUI() {
    if (!recorder) return;
    recorder.start();
    showFloatingIndicator();
  }

  function stopRecordingUI() {
    if (!recorder) return;
    recorder.stop();
    hideFloatingIndicator();
  }

  function showFloatingIndicator() {
    if (indicatorEl) return;

    indicatorEl = document.createElement('div');
    indicatorEl.id = 'agentqa-recorder-overlay';
    indicatorEl.dataset.agentqaUi = 'true';
    indicatorEl.setAttribute('style', `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 8px;
      background: #111827;
      color: #ffffff;
      padding: 8px 14px;
      border-radius: 9999px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.1);
      pointer-events: auto;
      user-select: none;
    `);

    const dot = document.createElement('span');
    dot.dataset.agentqaUi = 'true';
    dot.setAttribute('style', `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #EF4444;
      display: inline-block;
      animation: agentqa-pulse 1.5s infinite;
    `);

    const text = document.createElement('span');
    text.dataset.agentqaUi = 'true';
    text.textContent = 'AgentQA Recording';

    const styleSheet = document.createElement('style');
    styleSheet.dataset.agentqaUi = 'true';
    styleSheet.textContent = `
      @keyframes agentqa-pulse {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        70% { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
    `;

    indicatorEl.appendChild(styleSheet);
    indicatorEl.appendChild(dot);
    indicatorEl.appendChild(text);
    document.body.appendChild(indicatorEl);
  }

  function hideFloatingIndicator() {
    if (indicatorEl) {
      indicatorEl.remove();
      indicatorEl = null;
    }
  }

  // Ensure DOM is ready before initializing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
