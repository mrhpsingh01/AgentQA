/**
 * AgentQA - Background Service Worker (Manifest V3)
 * Coordinates recording state machine, listens for navigation events,
 * and maintains session state in chrome.storage.session.
 */

// Initialize default session storage on extension load/install
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.session.set({
    recordingState: 'idle', // 'idle' | 'recording' | 'paused'
    activeTabId: null,
    recordedSteps: [],
    sessionMeta: null
  });
  console.log('[AgentQA Background] Service worker initialized.');
});

// Central message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always handle async work inside an immediately-invoked async function
  (async () => {
    try {
      switch (message.type) {
        case 'START_RECORDING': {
          const result = await handleStartRecording(message.tabId);
          sendResponse({ success: true, ...result });
          break;
        }

        case 'STOP_RECORDING': {
          const steps = await handleStopRecording();
          sendResponse({ success: true, steps });
          break;
        }

        case 'PAUSE_RECORDING': {
          await handlePauseRecording();
          sendResponse({ success: true });
          break;
        }

        case 'RESUME_RECORDING': {
          await handleResumeRecording();
          sendResponse({ success: true });
          break;
        }

        case 'RECORD_STEP': {
          if (sender.tab) {
            await handleRecordStep(sender.tab.id, message.step);
          }
          sendResponse({ success: true });
          break;
        }

        case 'GET_STATUS': {
          const session = await chrome.storage.session.get([
            'recordingState',
            'activeTabId',
            'recordedSteps',
            'sessionMeta'
          ]);
          sendResponse(session);
          break;
        }

        case 'CLEAR_RECORDING': {
          await chrome.storage.session.set({
            recordingState: 'idle',
            activeTabId: null,
            recordedSteps: [],
            sessionMeta: null
          });
          await updateBadge('idle');
          sendResponse({ success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type: ' + message.type });
      }
    } catch (err) {
      console.error('[AgentQA Background] Error processing message:', err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keeps the message channel open for asynchronous responses
});

async function handleStartRecording(tabId) {
  let targetTabId = tabId;
  let targetTabUrl = '';
  let targetTabTitle = '';

  if (!targetTabId) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      targetTabId = activeTab.id;
      targetTabUrl = activeTab.url;
      targetTabTitle = activeTab.title;
    }
  } else {
    const tab = await chrome.tabs.get(targetTabId);
    targetTabUrl = tab.url;
    targetTabTitle = tab.title;
  }

  const initialStep = {
    id: 'step_nav_' + Date.now(),
    type: 'navigate',
    url: targetTabUrl,
    title: targetTabTitle,
    assertedEvents: [
      {
        type: 'navigation',
        url: targetTabUrl,
        title: targetTabTitle
      }
    ],
    timestamp: Date.now()
  };

  const meta = {
    startTime: Date.now(),
    startUrl: targetTabUrl,
    title: targetTabTitle || 'Recorded Flow'
  };

  await chrome.storage.session.set({
    recordingState: 'recording',
    activeTabId: targetTabId,
    recordedSteps: [initialStep],
    sessionMeta: meta
  });

  await updateBadge('recording');

  // Notify content script in target tab
  try {
    await chrome.tabs.sendMessage(targetTabId, { type: 'SET_RECORDING_ACTIVE', active: true });
  } catch (err) {
    // If content script was not already loaded, inject dynamically
    try {
      await chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        files: [
          'content/selector-engine.js',
          'content/recorder.js',
          'content/content-main.js'
        ]
      });
      await chrome.tabs.sendMessage(targetTabId, { type: 'SET_RECORDING_ACTIVE', active: true });
    } catch (injectErr) {
      console.warn('[AgentQA Background] Could not dynamically inject script:', injectErr);
    }
  }

  return { activeTabId: targetTabId, stepsCount: 1 };
}

async function handleStopRecording() {
  const { recordedSteps = [], activeTabId } = await chrome.storage.session.get([
    'recordedSteps',
    'activeTabId'
  ]);

  await chrome.storage.session.set({
    recordingState: 'idle',
    activeTabId: null
  });

  await updateBadge('idle');

  if (activeTabId) {
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'SET_RECORDING_ACTIVE', active: false });
    } catch (_) {}
  }

  return recordedSteps;
}

async function handlePauseRecording() {
  await chrome.storage.session.set({ recordingState: 'paused' });
  await updateBadge('paused');
}

async function handleResumeRecording() {
  await chrome.storage.session.set({ recordingState: 'recording' });
  await updateBadge('recording');
}

async function handleRecordStep(tabId, step) {
  const { recordingState, activeTabId, recordedSteps = [] } = await chrome.storage.session.get([
    'recordingState',
    'activeTabId',
    'recordedSteps'
  ]);

  if (recordingState !== 'recording' || activeTabId !== tabId) return;

  // Append new step and persist
  const updatedSteps = [...recordedSteps, step];
  await chrome.storage.session.set({ recordedSteps: updatedSteps });
}

async function updateBadge(state) {
  if (state === 'recording') {
    await chrome.action.setBadgeText({ text: 'REC' });
    await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
  } else if (state === 'paused') {
    await chrome.action.setBadgeText({ text: 'PAUS' });
    await chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// Track SPA navigations natively (pushState, replaceState, hashchange)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return; // Main frame only
  const { recordingState, activeTabId, recordedSteps = [] } = await chrome.storage.session.get([
    'recordingState',
    'activeTabId',
    'recordedSteps'
  ]);

  if (recordingState === 'recording' && activeTabId === details.tabId) {
    // Avoid duplicate navigate step if URL is unchanged
    const lastStep = recordedSteps[recordedSteps.length - 1];
    if (lastStep && lastStep.type === 'navigate' && lastStep.url === details.url) {
      return;
    }

    const navStep = {
      id: 'step_spa_' + Date.now(),
      type: 'navigate',
      url: details.url,
      timestamp: Date.now()
    };
    await chrome.storage.session.set({ recordedSteps: [...recordedSteps, navStep] });
  }
});

// Track MPA cross-page navigations on the recorded tab
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  // Ignore reloads and history traversals already caught by historyStateUpdated
  if (['reload', 'auto_subframe'].includes(details.transitionType)) return;

  const { recordingState, activeTabId, recordedSteps = [] } = await chrome.storage.session.get([
    'recordingState',
    'activeTabId',
    'recordedSteps'
  ]);

  if (recordingState === 'recording' && activeTabId === details.tabId) {
    const lastStep = recordedSteps[recordedSteps.length - 1];
    if (lastStep && lastStep.type === 'navigate' && lastStep.url === details.url) {
      return;
    }

    const navStep = {
      id: 'step_mpa_' + Date.now(),
      type: 'navigate',
      url: details.url,
      timestamp: Date.now()
    };
    await chrome.storage.session.set({ recordedSteps: [...recordedSteps, navStep] });
  }
});
