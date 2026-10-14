/**
 * AgentQA - DOM Event Recorder
 * Captures user interactions during the capturing phase, pierces Shadow DOM,
 * collapses keystrokes, and passes structured steps to the background coordinator.
 */

(function (global) {
  'use strict';

  class DOMEventRecorder {
    constructor(onRecordStep) {
      this.onRecordStep = onRecordStep;
      this.isRecording = false;
      this.inputBufferTimer = null;
      this.lastBufferedInput = null;

      this.boundHandleClick = this.handleClick.bind(this);
      this.boundHandleInput = this.handleInput.bind(this);
      this.boundHandleChange = this.handleChange.bind(this);
      this.boundHandleKeyDown = this.handleKeyDown.bind(this);
      this.boundHandleScroll = this.handleScroll.bind(this);
      this.boundHandleSubmit = this.handleSubmit.bind(this);
      this.boundFlush = this.flushBufferedInput.bind(this);
      this.scrollBufferTimer = null;
    }

    start() {
      if (this.isRecording) return;
      this.isRecording = true;

      // CRITICAL: useCapture = true ensures intercepting before stopPropagation()
      window.addEventListener('click', this.boundHandleClick, true);
      window.addEventListener('input', this.boundHandleInput, true);
      window.addEventListener('change', this.boundHandleChange, true);
      window.addEventListener('keydown', this.boundHandleKeyDown, true);
      window.addEventListener('scroll', this.boundHandleScroll, true);
      window.addEventListener('submit', this.boundHandleSubmit, true);
      window.addEventListener('pagehide', this.boundFlush, true);
      window.addEventListener('beforeunload', this.boundFlush, true);

      console.debug('[AgentQA] Recorder started on', window.location.href);
    }

    stop() {
      if (!this.isRecording) return;
      this.flushBufferedInput();
      this.isRecording = false;

      window.removeEventListener('click', this.boundHandleClick, true);
      window.removeEventListener('input', this.boundHandleInput, true);
      window.removeEventListener('change', this.boundHandleChange, true);
      window.removeEventListener('keydown', this.boundHandleKeyDown, true);
      window.removeEventListener('scroll', this.boundHandleScroll, true);
      window.removeEventListener('submit', this.boundHandleSubmit, true);
      window.removeEventListener('pagehide', this.boundFlush, true);
      window.removeEventListener('beforeunload', this.boundFlush, true);

      console.debug('[AgentQA] Recorder stopped.');
    }

    handleScroll(event) {
      if (!this.isRecording) return;
      clearTimeout(this.scrollBufferTimer);
      this.scrollBufferTimer = setTimeout(() => {
        const scrollX = window.scrollX || window.pageXOffset || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        this.onRecordStep({
          id: 'step_scroll_' + Date.now(),
          type: 'scroll',
          target: 'main',
          scrollX: Math.round(scrollX),
          scrollY: Math.round(scrollY),
          url: window.location.href,
          timestamp: Date.now()
        });
      }, 350);
    }

    handleSubmit(event) {
      if (!this.isRecording || !event.isTrusted) return;
      this.flushBufferedInput();
      const path = (event.composedPath && event.composedPath()) || [event.target];
      const form = path[0];
      const selectors = global.AgentQASelectorEngine.generateSelectorPriorities(form);

      this.onRecordStep({
        id: 'step_submit_' + Date.now(),
        type: 'submit',
        target: 'main',
        selectors: selectors,
        url: window.location.href,
        timestamp: Date.now()
      });
    }

    handleClick(event) {
      if (!this.isRecording) return;
      if (!event.isTrusted) return;

      // Shadow DOM piercing: composedPath()[0] is the true internal node
      const path = (event.composedPath && event.composedPath()) || [event.target];
      const target = path[0];

      // Prevent self-capture of recorder overlay / toolbar UI
      if (this.isSelfUI(path)) return;

      // Flush any pending text before registering click
      this.flushBufferedInput();

      // Find semantic clickable element
      const clickable = (target.closest && target.closest('button, a, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="tab"]')) || target;

      const rect = clickable.getBoundingClientRect ? clickable.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
      const offsetX = Math.round(event.clientX - (rect.left || 0));
      const offsetY = Math.round(event.clientY - (rect.top || 0));

      const selectors = global.AgentQASelectorEngine.generateSelectorPriorities(clickable);

      const step = {
        id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'click',
        target: 'main',
        selectors: selectors,
        offsetX: Math.max(0, offsetX),
        offsetY: Math.max(0, offsetY),
        button: event.button === 2 ? 'secondary' : (event.button === 1 ? 'middle' : 'primary'),
        modifiers: this.getModifiers(event),
        elementInfo: {
          tagName: clickable.tagName ? clickable.tagName.toLowerCase() : '',
          textPreview: ((clickable.innerText || clickable.textContent || '').trim()).substring(0, 50),
          role: clickable.getAttribute ? clickable.getAttribute('role') : null,
          ariaLabel: clickable.getAttribute ? clickable.getAttribute('aria-label') : null,
          title: clickable.getAttribute ? clickable.getAttribute('title') : null,
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          }
        },
        url: window.location.href,
        timestamp: Date.now()
      };

      this.onRecordStep(step);
    }

    handleInput(event) {
      if (!this.isRecording || !event.isTrusted) return;
      const path = (event.composedPath && event.composedPath()) || [event.target];
      const target = path[0];
      if (this.isSelfUI(path)) return;

      // Skip non-text inputs (handled by 'change' event instead)
      if (['checkbox', 'radio', 'file', 'color', 'range'].includes(target.type)) return;

      const isPassword = target.type === 'password' || (target.getAttribute && target.getAttribute('autocomplete') === 'current-password');
      const val = isPassword ? '********' : (target.value || '');

      const selectors = global.AgentQASelectorEngine.generateSelectorPriorities(target);

      this.lastBufferedInput = {
        id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: 'change',
        target: 'main',
        selectors: selectors,
        value: val,
        isMasked: isPassword,
        elementInfo: {
          tagName: target.tagName ? target.tagName.toLowerCase() : '',
          type: target.type || 'text',
          name: target.name || null,
          placeholder: target.placeholder || null
        },
        url: window.location.href,
        timestamp: Date.now()
      };

      // Debounce 400ms to collapse individual keystrokes into a single atomic action
      clearTimeout(this.inputBufferTimer);
      this.inputBufferTimer = setTimeout(() => {
        this.flushBufferedInput();
      }, 400);
    }

    handleChange(event) {
      if (!this.isRecording || !event.isTrusted) return;
      const path = (event.composedPath && event.composedPath()) || [event.target];
      const target = path[0];
      if (this.isSelfUI(path)) return;

      const selectors = global.AgentQASelectorEngine.generateSelectorPriorities(target);

      if (['checkbox', 'radio'].includes(target.type)) {
        this.flushBufferedInput();
        this.onRecordStep({
          id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'click',
          target: 'main',
          selectors: selectors,
          checked: target.checked,
          elementInfo: {
            tagName: 'input',
            type: target.type,
            name: target.name || null
          },
          url: window.location.href,
          timestamp: Date.now()
        });
      } else if (target.tagName && target.tagName.toLowerCase() === 'select') {
        this.flushBufferedInput();
        this.onRecordStep({
          id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'change',
          target: 'main',
          selectors: selectors,
          value: target.value,
          selectedText: target.options && target.selectedIndex >= 0 ? target.options[target.selectedIndex].text : '',
          elementInfo: {
            tagName: 'select',
            name: target.name || null
          },
          url: window.location.href,
          timestamp: Date.now()
        });
      }
    }

    handleKeyDown(event) {
      if (!this.isRecording || !event.isTrusted) return;

      const actionableKeys = ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'Backspace'];
      if (actionableKeys.includes(event.key)) {
        this.flushBufferedInput();

        this.onRecordStep({
          id: 'step_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          type: 'keyDown',
          target: 'main',
          key: event.key,
          modifiers: this.getModifiers(event),
          url: window.location.href,
          timestamp: Date.now()
        });
      }
    }

    flushBufferedInput() {
      if (this.lastBufferedInput) {
        clearTimeout(this.inputBufferTimer);
        this.onRecordStep(this.lastBufferedInput);
        this.lastBufferedInput = null;
      }
    }

    isSelfUI(path) {
      for (const el of path) {
        if (el.dataset && el.dataset.agentqaUi) return true;
        if (el.id === 'agentqa-recorder-overlay') return true;
      }
      return false;
    }

    getModifiers(event) {
      const mods = [];
      if (event.ctrlKey) mods.push('Control');
      if (event.shiftKey) mods.push('Shift');
      if (event.altKey) mods.push('Alt');
      if (event.metaKey) mods.push('Meta');
      return mods;
    }
  }

  global.AgentQADOMEventRecorder = DOMEventRecorder;
})(typeof window !== 'undefined' ? window : this);
