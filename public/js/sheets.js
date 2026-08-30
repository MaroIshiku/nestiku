import { $, $$ } from './dom.js';
import { icon } from './icons.js';

let currentBackHandler = null;
let globalHandlersBound = false;
let returnFocus = null;

export function sheetHeader(title, { back = false } = {}) {
  const backButton = back
    ? `<button class="button text sheet-back" type="button" data-back data-sheet-action="back">${icon('back')}<span>Back</span></button>`
    : '<span></span>';
  return `
    <div class="sheet-head">
      ${backButton}
      <h2 id="nestiku-sheet-title">${title}</h2>
      <button class="icon-button" type="button" data-close data-sheet-action="close" aria-label="Close">${icon('close')}</button>
    </div>
  `;
}

export function openSheet(html, { onBack = null } = {}) {
  bindGlobalSheetHandlers();
  const trigger = document.activeElement;
  closeSheet(false);
  returnFocus = trigger instanceof HTMLElement ? trigger : null;
  currentBackHandler = onBack;
  const node = document.createElement('div');
  node.className = 'psu-backdrop';
  node.innerHTML = `<section class="psu-sheet nestiku-sheet" role="dialog" aria-modal="true" aria-labelledby="nestiku-sheet-title">${html}</section>`;
  document.body.append(node);
  node.addEventListener('click', handleSheetClick);
  node.addEventListener('pointerdown', handleSheetCommand, true);
  document.addEventListener('keydown', handleSheetKeydown);
  $('[data-close]', node)?.focus();
}

export function closeSheet(restoreFocus = true) {
  $$('.psu-backdrop').forEach((node) => {
    node.removeEventListener('click', handleSheetClick);
    node.removeEventListener('pointerdown', handleSheetCommand, true);
    node.remove();
  });
  currentBackHandler = null;
  document.removeEventListener('keydown', handleSheetKeydown);
  if (restoreFocus && returnFocus?.isConnected) returnFocus.focus();
  returnFocus = null;
}

function handleSheetClick(event) {
  if (event.target === event.currentTarget) {
    closeSheet();
  }
}

function handleSheetCommand(event) {
  if (event.target.closest('[data-sheet-action="close"]')) {
    event.preventDefault();
    closeSheet();
    return;
  }
  if (event.target.closest('[data-sheet-action="back"]')) {
    event.preventDefault();
    const back = currentBackHandler;
    closeSheet();
    if (back) back();
  }
}

function bindGlobalSheetHandlers() {
  if (globalHandlersBound) return;
  globalHandlersBound = true;
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-action="close"]')) {
      closeSheet();
      return;
    }
    if (event.target.closest('[data-sheet-action="back"]')) {
      const back = currentBackHandler;
      closeSheet();
      if (back) back();
    }
  }, true);
}

function handleSheetKeydown(event) {
  if (event.key === 'Escape') {
    closeSheet();
    return;
  }
  if (event.key !== 'Tab') return;
  const sheet = $('.psu-sheet');
  if (!sheet) return;
  const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', sheet)
    .filter((item) => !item.hidden && item.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
