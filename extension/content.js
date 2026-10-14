(() => {
  if (globalThis.__opencodeChrome?.version === 6) return;
  globalThis.__opencodeChrome?.dispose?.();
  globalThis.__opencodeChrome?.setEnabled?.(false);
  let refs = new Map(),
    refCounter = 0,
    snapshotURL;
  let snapshotRevision = 0;
  const documentID = crypto.randomUUID();
  let controlHost, controlShadow, cursor, target, status, idleTimer;
  let enabled = true,
    cursorShown = false,
    controlRevision = 0;
  const cancelledActions = new Set();
  function setEnabled(value) {
    if (enabled !== value) controlRevision++;
    enabled = value;
    if (!value) {
      controlHost?.remove();
      clearTimeout(idleTimer);
      return;
    }
    if (controlHost?.isConnected) return;
    controlHost = document.createElement('div');
    controlHost.id = 'opencode-agent-overlay';
    controlHost.setAttribute('aria-hidden', 'true');
    controlHost.style.cssText =
      'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    controlShadow = controlHost.attachShadow({ mode: 'open' });
    // This is static extension UI; no page text is inserted as HTML.
    controlShadow.innerHTML = `
      <style>
        :host { pointer-events:none; }
        * { box-sizing:border-box; pointer-events:none!important; }
        .indicator { position:fixed; top:14px; right:14px; display:flex; gap:9px; align-items:center;
          padding:9px 13px; border:1px solid #fb923c; border-radius:24px; background:#24170ff2;
          color:#ffedd5; box-shadow:0 2px 16px #0004; font:600 12px/1.3 system-ui,sans-serif; }
        .dot { width:8px; height:8px; border-radius:50%; background:#fb923c; box-shadow:0 0 0 4px #fb923c25; }
        .cursor { position:fixed; top:0; left:0; opacity:0; transform:translate3d(50vw,50vh,0);
          transition:transform 240ms cubic-bezier(.2,.75,.25,1),opacity 150ms; filter:drop-shadow(0 2px 3px #0005); }
        .cursor svg { display:block; width:28px; height:34px; overflow:visible; }
        .cursor-label { position:absolute; top:29px; left:19px; padding:3px 7px; border-radius:5px;
          color:#fff; background:#c2410c; font:600 11px/1.2 system-ui,sans-serif; white-space:nowrap; }
        .target { position:fixed; border:2px solid #fb923c; border-radius:6px; background:#fb923c18;
          box-shadow:0 0 0 4px #fb923c15; opacity:0; transition:opacity 150ms; }
        .ring { position:absolute; top:-14px; left:-14px; width:32px; height:32px; border:2px solid #fb923c;
          border-radius:50%; background:#fb923c22; opacity:0; }
        .pulse { animation:pulse 600ms ease-out; }
        @keyframes pulse { 0% { opacity:1; transform:scale(.6); } 100% { opacity:0; transform:scale(2); } }
      </style>
      <div class="indicator"><span class="dot"></span><span class="status">OpenCode · Tab under agent control</span></div>
      <div class="target"></div>
      <div class="cursor"><span class="ring"></span>
        <svg viewBox="0 0 28 34"><path d="M2 2 L2 26 L8.5 20 L14 31 L19 28.5 L13.5 18 L23 18 Z" fill="#f97316" stroke="#fff7ed" stroke-width="2" stroke-linejoin="round"/></svg>
        <span class="cursor-label">OpenCode</span>
      </div>`;
    cursor = controlShadow.querySelector('.cursor');
    target = controlShadow.querySelector('.target');
    status = controlShadow.querySelector('.status');
    document.documentElement.append(controlHost);
    cursorShown = false;
  }
  function activity(label) {
    if (!enabled) return;
    setEnabled(true);
    clearTimeout(idleTimer);
    status.textContent = `OpenCode · ${label}`;
    idleTimer = setTimeout(() => {
      status.textContent = 'OpenCode · Tab under agent control';
      target.style.opacity = '0';
    }, 1800);
  }
  async function pointAt(element, label, commandID) {
    if (!enabled) throw new Error('Browser access is disabled.');
    const revision = controlRevision;
    activity(label);
    const rect = element.getBoundingClientRect();
    const x = Math.max(4, Math.min(innerWidth - 32, rect.left + rect.width / 2));
    const y = Math.max(4, Math.min(innerHeight - 38, rect.top + rect.height / 2));
    if (!cursorShown) {
      cursor.style.opacity = '1';
      cursorShown = true;
    }
    cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
    Object.assign(target.style, {
      left: `${rect.left - 3}px`,
      top: `${rect.top - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
      opacity: '1',
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (commandID && cancelledActions.has(commandID))
      throw new Error('Browser action cancelled before execution.');
    if (!enabled || revision !== controlRevision)
      throw new Error('Browser access was disabled before the action.');
    const ring = controlShadow.querySelector('.ring');
    ring.classList.remove('pulse');
    void ring.offsetWidth;
    ring.classList.add('pulse');
  }
  setEnabled(true);
  function visible(element) {
    const style = getComputedStyle(element);
    return (
      element.getClientRects().length > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  }
  function clickPoint(element) {
    for (const rect of element.getClientRects()) {
      const left = Math.max(0, rect.left),
        top = Math.max(0, rect.top),
        right = Math.min(innerWidth, rect.right),
        bottom = Math.min(innerHeight, rect.bottom);
      if (right <= left || bottom <= top) continue;
      const x = (left + right) / 2,
        y = (top + bottom) / 2,
        hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit))) return { x, y };
    }
    throw new Error('Click target is outside the viewport or covered by another element.');
  }
  function uniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }
  function selectorFor(element) {
    const parts = [];
    for (let current = element; current && parts.length < 16; current = current.parentElement) {
      for (const attribute of ['id', 'data-testid', 'aria-label']) {
        const value = current.getAttribute(attribute);
        if (!value || /[\r\n]/.test(value)) continue;
        const prefix = `[${attribute}=${JSON.stringify(value)}]`;
        const selector = [prefix, ...parts].join(' > ');
        if (uniqueSelector(prefix) && uniqueSelector(selector)) return selector;
      }
      const siblings = [...(current.parentElement?.children || [current])].filter(
        (sibling) => sibling.localName === current.localName,
      );
      parts.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
      const selector = parts.join(' > ');
      if (uniqueSelector(selector)) return selector;
    }
  }
  function validateClick(args) {
    if (args.commandID && cancelledActions.has(args.commandID))
      throw new Error('Browser action cancelled before execution.');
    if (!enabled) throw new Error('Browser access is disabled.');
    const element = refs.get(args.ref);
    if (
      args.documentID !== documentID ||
      args.snapshotRevision !== snapshotRevision ||
      args.controlRevision !== controlRevision ||
      snapshotURL !== location.href ||
      !element?.isConnected ||
      !visible(element) ||
      element.matches(':disabled') ||
      element.closest('[aria-disabled="true"],[inert]')
    )
      throw new Error('Click target changed or became disabled. Call read_page again.');
    const point = clickPoint(element);
    if (point.x !== args.x || point.y !== args.y)
      throw new Error('Click target moved. Call read_page again.');
    return { valid: true };
  }
  function run(tool, args = {}) {
    if (args.commandID && cancelledActions.has(args.commandID))
      throw new Error('Browser action cancelled before execution.');
    if (!enabled) throw new Error('Browser access is disabled.');
    if (tool === 'resolve_target') {
      const matches = document.querySelectorAll(args.selector);
      if (matches.length !== 1 || !visible(matches[0]))
        throw new Error('Recorded selector must match exactly one visible element.');
      const element = matches[0];
      if (args.rejectPassword && element.type === 'password')
        throw new Error('Password fields cannot be included in a replayable recording.');
      snapshotRevision++;
      snapshotURL = location.href;
      refs = new Map();
      const ref = `e${++refCounter}`;
      refs.set(ref, element);
      return { ref, documentID };
    }
    if (tool === 'inspect_conditions') {
      return {
        passed: args.checks.every((check) => {
          if (check.url && location.href !== new URL(check.url).href) return false;
          if (!check.selector) return !!check.url;
          const elements = document.querySelectorAll(check.selector);
          if (!elements.length)
            return (
              check.visible === false &&
              check.text === undefined &&
              check.value === undefined &&
              check.checked === undefined
            );
          if (elements.length !== 1) return false;
          const element = elements[0];
          if (check.visible !== undefined && visible(element) !== check.visible) return false;
          if (
            check.text !== undefined &&
            (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim() !==
              check.text
          )
            return false;
          if (
            check.value !== undefined &&
            (element.type === 'password' || element.value !== check.value)
          )
            return false;
          if (check.checked !== undefined && element.checked !== check.checked) return false;
          return true;
        }),
      };
    }
    if (tool === 'read_page') {
      activity('Reading page');
      refs = new Map();
      snapshotRevision++;
      snapshotURL = location.href;
      const elements = [];
      for (const el of document.querySelectorAll(
        'a[href],button,input,textarea,select,[role="button"],[contenteditable="true"]',
      )) {
        if (!visible(el) || elements.length >= 300) continue;
        const ref = `e${++refCounter}`;
        refs.set(ref, el);
        const entry = {
          ref,
          tag: el.tagName.toLowerCase(),
          type: el.type || el.getAttribute('role'),
          label: (
            el.getAttribute('aria-label') ||
            el.labels?.[0]?.innerText ||
            el.innerText ||
            el.placeholder ||
            el.name ||
            ''
          ).slice(0, 300),
          disabled: !!el.disabled,
        };
        entry.selector = selectorFor(el);
        if (el.matches('input,textarea,select') && el.type !== 'password')
          entry.value = el.value?.slice(0, 2000);
        if (el.matches('select'))
          entry.options = [...el.options]
            .slice(0, 100)
            .map((o) => ({ value: o.value, text: o.text }));
        if (el.matches('input[type="checkbox"],input[type="radio"]')) entry.checked = el.checked;
        if (el.matches('a')) entry.href = el.href;
        elements.push(entry);
      }
      return {
        documentID,
        title: document.title,
        url: location.href,
        text: (document.body?.innerText || '').slice(0, 40000),
        elements,
      };
    }
    if (tool === 'scroll') {
      activity('Scrolling');
      cursor.style.opacity = '1';
      cursorShown = true;
      cursor.style.transform = `translate3d(${innerWidth / 2}px,${args.deltaY >= 0 ? innerHeight * 0.75 : innerHeight * 0.25}px,0)`;
      window.scrollBy({ top: args.deltaY, behavior: 'instant' });
      return { scrollY: window.scrollY };
    }
    if (args.documentID !== documentID || snapshotURL !== location.href)
      throw new Error('Page changed. Call read_page again.');
    const el = refs.get(args.ref);
    const revision = snapshotRevision;
    if (!el || !el.isConnected || !visible(el))
      throw new Error('Element ref expired. Call read_page again.');
    if (el.disabled) throw new Error('Element is disabled');
    el.scrollIntoView({ block: 'center' });
    return (async () => {
      await pointAt(
        el,
        { click: 'Clicking', type: 'Typing', select: 'Selecting', check: 'Checking' }[tool] ||
          'Working',
        args.commandID,
      );
      if (
        revision !== snapshotRevision ||
        !el.isConnected ||
        snapshotURL !== location.href ||
        !visible(el) ||
        el.disabled
      )
        throw new Error('Page changed before the action. Call read_page again.');
      if (tool === 'click') {
        const target = { ...clickPoint(el), documentID, snapshotRevision, controlRevision };
        validateClick({ ...args, ...target });
        return { clickTarget: target };
      } else if (tool === 'type') {
        if (el.matches('input,textarea')) {
          if (
            el.readOnly ||
            (el.tagName === 'INPUT' &&
              ['checkbox', 'radio', 'file', 'submit', 'button', 'hidden'].includes(el.type))
          )
            throw new Error('Element is not a text input');
          el.focus();
          const prototype =
            el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, args.text);
        } else if (el.isContentEditable) {
          el.focus();
          el.textContent = args.text;
        } else throw new Error('Element is not editable');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (tool === 'select') {
        if (
          !el.matches('select') ||
          ![...el.options].some((o) => o.value === args.value && !o.disabled)
        )
          throw new Error('Dropdown option not found');
        el.value = args.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (tool === 'check') {
        if (!el.matches('input[type="checkbox"],input[type="radio"]'))
          throw new Error('Element is not a checkbox or radio');
        if (el.checked !== args.checked) el.click();
        if (el.checked !== args.checked)
          throw new Error('Page did not accept the requested checked state');
      } else throw new Error('Unknown browser action');
      return { ok: true, url: location.href };
    })();
  }
  const onMessage = (message, sender, respond) => {
    if (sender.id !== globalThis.chrome?.runtime?.id) return;
    if (message.type === 'opencode-disable') setEnabled(false);
    else if (message.type === 'opencode-cancel' && typeof message.id === 'string') {
      cancelledActions.add(message.id);
      if (cancelledActions.size > 100)
        cancelledActions.delete(cancelledActions.values().next().value);
    } else return;
    respond?.({ ok: true });
  };
  globalThis.chrome?.runtime?.onMessage?.addListener(onMessage);
  globalThis.__opencodeChrome = {
    version: 6,
    run,
    validateClick,
    setEnabled,
    dispose: () => {
      setEnabled(false);
      globalThis.chrome?.runtime?.onMessage?.removeListener(onMessage);
    },
  };
})();
