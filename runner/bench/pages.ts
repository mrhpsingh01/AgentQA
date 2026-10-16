/**
 * Six UI patterns for the mutation benchmark. Each is a function of a Variant, so the SAME page can be
 * rendered "before" (what the test was written against) and "after" (what the UI became):
 *
 *   login form · checkout form · data table with row actions · modal dialog · navbar · dynamic list
 *
 * Layout is identical between variants (wrappers use `display:contents`); only markup identity - ids, test ids,
 * classes, labels, nesting - and, for negative cases, behaviour or presence of controls change. Behaviour is
 * wired through a hidden `data-k` hook that survives a refactor, as event handlers do in real apps.
 */

import { createHash } from 'node:crypto';

export type Pattern = 'login' | 'checkout' | 'table' | 'modal' | 'navbar' | 'list';

export interface Variant {
  id: (key: string) => string;
  tid: (key: string) => string;
  cls: (key: string) => string;
  label: (key: string, original: string) => string;
  /** wrap every control in extra containers (changes the structural path, not the layout) */
  wrap: boolean;
  /** controls that no longer exist */
  removed: Set<string>;
  /** extra controls (decoys) inserted next to the removed one: key -> label */
  decoys: Record<string, string>;
  /** the action silently does nothing (a real application bug) */
  brokenAction: boolean;
  /** render the control `lateKey` only after this many ms (late render) */
  delayMs: number;
  lateKey: string;
}

const short = (kind: string, key: string, salt: string) => kind + createHash('sha1').update(kind + key + salt).digest('hex').slice(0, 6);

export const ORIGINAL_VARIANT: Variant = {
  id: (k) => k,
  tid: (k) => k,
  cls: (k) => `btn-${k}`,
  label: (_k, original) => original,
  wrap: false,
  removed: new Set(),
  decoys: {},
  brokenAction: false,
  delayMs: 0,
  lateKey: '',
};

export interface Mutations {
  ids?: boolean;
  testids?: boolean;
  classes?: boolean;
  labels?: Record<string, string>;
  wrap?: boolean;
  removed?: string[];
  decoys?: Record<string, string>;
  brokenAction?: boolean;
  delayMs?: number;
  lateKey?: string;
  salt?: string;
}

export function mutate(m: Mutations): Variant {
  const salt = m.salt ?? 'v2';
  return {
    id: m.ids ? (k) => short('e', k, salt) : ORIGINAL_VARIANT.id,
    tid: m.testids ? (k) => short('t', k, salt) : ORIGINAL_VARIANT.tid,
    cls: m.classes ? (k) => short('c', k, salt) : ORIGINAL_VARIANT.cls,
    label: (k, o) => m.labels?.[k] ?? o,
    wrap: !!m.wrap,
    removed: new Set(m.removed ?? []),
    decoys: m.decoys ?? {},
    brokenAction: !!m.brokenAction,
    delayMs: m.delayMs ?? 0,
    lateKey: m.lateKey ?? '',
  };
}

const CSS = `body{margin:0;font:15px/1.4 system-ui,sans-serif;color:#1d2433}main{padding:32px;width:620px}
button,input{font:inherit;padding:8px 14px;border:1px solid #b9c0cc;border-radius:6px;background:#f3f4f7}
input{width:260px;background:#fff}.w{display:contents}nav{display:flex;gap:20px;padding:14px 32px;border-bottom:1px solid #dde1e8}
table{border-collapse:collapse;width:560px}td{padding:8px 10px;border-bottom:1px solid #e3e6ec}
.modal{display:none;position:fixed;left:140px;top:140px;width:380px;padding:22px;background:#fff;border:1px solid #888;box-shadow:0 8px 24px #0003}
[data-out]{margin-top:22px;font-weight:600;min-height:22px}`;

class Page {
  private control = 0;
  constructor(private readonly v: Variant) {}

  /** a control with the variant's identity; `key` is its stable logical name */
  btn(key: string, original: string, tag: 'button' | 'a' = 'button', extra = ''): string {
    const v = this.v;
    if (v.removed.has(key)) return '';
    const attrs = `id="${v.id(key)}" data-testid="${v.tid(key)}" class="${v.cls(key)}" data-k="${key}" ${extra}`;
    const body = tag === 'a'
      ? `<a ${attrs} href="#/${key}">${v.label(key, original)}</a>`
      : `<button ${attrs} type="button">${v.label(key, original)}</button>`;
    const html = v.wrap ? `<div class="w"><span class="w">${body}</span></div>` : body;
    return v.delayMs > 0 && v.lateKey === key ? `<template data-late>${html}</template>` : html;
  }

  input(key: string, placeholder: string, type = 'text'): string {
    const v = this.v;
    if (v.removed.has(key)) return '';
    const el = `<input id="${v.id(key)}" data-testid="${v.tid(key)}" class="${v.cls(key)}" data-k="${key}" name="${key}" type="${type}" placeholder="${placeholder}">`;
    return v.wrap ? `<div class="w"><span class="w">${el}</span></div>` : el;
  }

  decoys(): string {
    return Object.entries(this.v.decoys).map(([k, label]) => this.btn(k, label)).join('');
  }
}

const doc = (body: string, script: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}<script>${script}</script></body></html>`;

const hook = (): string => `const q=(k)=>document.querySelector('[data-k="'+k+'"]');const on=(k,fn)=>{const e=q(k);if(e)e.addEventListener('click',fn)};const out=document.querySelector('[data-out]');`;

/** Wrap the page script so the primary control can render late (L1 scenarios). */
const late = (v: Variant, script: string) =>
  v.delayMs > 0 ? `setTimeout(()=>{document.querySelectorAll('template[data-late]').forEach(t=>t.replaceWith(t.content));${script}},${v.delayMs});` : script;

export function render(pattern: Pattern, v: Variant): string {
  const p = new Page(v);
  const broken = v.brokenAction;
  switch (pattern) {
    case 'login': {
      const form = `<main><h1>Sign in</h1><div style="margin:10px 0">${p.input('user', 'Username')}</div>
        <div style="margin:10px 0">${p.input('pass', 'Password', 'password')}</div>
        <div style="margin:18px 0;display:flex;gap:12px">${p.btn('forgot', 'Forgot password')}${p.decoys()}${p.btn('submit', 'Sign in')}</div>
        <div data-out></div></main>`;
      const js = `${hook()}on('submit',()=>{${broken ? '' : "if(q('user').value==='alice'&&q('pass').value==='s3cret')out.textContent='Welcome back, alice';"}});
        on('later',()=>{out.textContent='Account created'});on('forgot',()=>{out.textContent='Reset link sent'});`;
      return doc(form, js);
    }
    case 'checkout': {
      const form = `<main><h1>Checkout</h1><div style="margin:10px 0">${p.input('email', 'you@example.com', 'email')}</div>
        <div style="margin:18px 0;display:flex;gap:12px">${p.btn('cancel', 'Cancel')}${p.decoys()}${p.btn('place', 'Place order')}</div>
        <div data-out></div></main>`;
      const js = `${hook()}${late(v, `on('place',()=>{${broken ? '' : "out.textContent='Order confirmed for '+q('email').value;"}});`)}
        on('cancel',()=>{out.textContent='Order cancelled'});on('later',()=>{out.textContent='Saved for later'});`;
      return doc(form, js);
    }
    case 'table': {
      const row = (i: number) => `<tr data-row="${i}"><td>Order ${i}</td><td data-status>Open</td><td>${p.btn(`archive${i}`, 'Archive')}${i === 2 ? p.decoys() : ''}${p.btn(`delete${i}`, 'Delete')}</td></tr>`;
      const html = `<main><h1>Orders</h1><table>${[1, 2, 3].map(row).join('')}</table><div data-out></div></main>`;
      const js = `${hook()}[1,2,3].forEach(i=>{on('archive'+i,()=>{${broken ? '' : "document.querySelector('[data-row=\"'+i+'\"] [data-status]').textContent='Archived';"}});
        on('delete'+i,()=>{document.querySelector('[data-row=\"'+i+'\"]').remove()});});`;
      return doc(html, js);
    }
    case 'modal': {
      const html = `<main><h1>Profile</h1>${p.btn('open', 'Open settings')}
        <div class="modal" id="dlg"><h2>Settings</h2>${p.input('name', 'Display name')}
          <div style="display:flex;gap:12px;margin-top:16px">${p.btn('close', 'Close')}${p.decoys()}${p.btn('save', 'Save')}</div></div>
        <div data-out></div></main>`;
      const js = `${hook()}const dlg=document.getElementById('dlg');on('open',()=>{dlg.style.display='block'});
        on('close',()=>{dlg.style.display='none';out.textContent='Closed without saving'});
        on('save',()=>{${broken ? '' : "out.textContent='Saved '+q('name').value;dlg.style.display='none';"}});on('apply',()=>{out.textContent='Applied preview'});`;
      return doc(html, js);
    }
    case 'navbar': {
      const html = `<nav>${p.btn('products', 'Products', 'a')}${p.btn('pricing', 'Pricing', 'a')}${p.btn('docs', 'Docs', 'a')}${p.decoys()}${p.btn('account', 'Account', 'a')}</nav>
        <main><h1 data-out>Home</h1></main>`;
      const js = `${hook()}const titles={products:'Our products',pricing:'Pricing plans',docs:'Documentation',account:'Your account',blog:'Latest posts'};
        document.querySelectorAll('a[data-k]').forEach(a=>a.addEventListener('click',(e)=>{e.preventDefault();${broken ? '' : "out.textContent=titles[a.dataset.k]||a.dataset.k;"}}));`;
      return doc(html, js);
    }
    case 'list': {
      const html = `<main><h1>Todo</h1><div style="display:flex;gap:10px">${p.input('item', 'New item')}${p.btn('clear', 'Clear all')}${p.decoys()}${p.btn('add', 'Add')}</div>
        <ul id="items" data-out></ul></main>`;
      const js = `${hook()}const ul=document.getElementById('items');${late(v, `on('add',()=>{${broken ? '' : "const li=document.createElement('li');li.textContent=q('item').value;ul.appendChild(li);"}});`)}
        on('clear',()=>{ul.innerHTML=''});`;
      return doc(html, js);
    }
  }
}

export const PATTERNS: Pattern[] = ['login', 'checkout', 'table', 'modal', 'navbar', 'list'];
