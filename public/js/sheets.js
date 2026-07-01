import { $, $$ } from './dom.js';
import { icon } from './icons.js';

let currentBackHandler = null;
let globalHandlersBound = false;

export function sheetHeader(title, { back = false } = {}) {
  const backButton = back
    ? `<button class="button text sheet-back" type="button" data-back data-sheet-action="back">${icon('back')}<span>Back</span></button>`
    : '<span></span>';
  return `
    <div class="sheet-head">
      ${backButton}
      <h2>${title}</h2>
      <a class="icon-button" href="/?v=20260701b" aria-label="Close">${icon('close')}</a>
    </div>
  `;
}

export function openSheet(html, { onBack = null } = {}) {
  bindGlobalSheetHandlers();
  closeSheet();
  currentBackHandler = onBack;
  const node = document.createElement('div');
  node.className = 'sheet-backdrop';
  node.innerHTML = `<section class="sheet" role="dialog" aria-modal="true">${html}</section>`;
  document.body.append(node);
  node.addEventListener('click', handleSheetClick);
  node.addEventListener('pointerdown', handleSheetCommand, true);
  document.addEventListener('keydown', escapeToClose);
  $('[data-close]', node)?.focus();
}

export function closeSheet() {
  $$('.sheet-backdrop').forEach((node) => {
    node.removeEventListener('click', handleSheetClick);
    node.removeEventListener('pointerdown', handleSheetCommand, true);
    node.remove();
  });
  currentBackHandler = null;
  document.removeEventListener('keydown', escapeToClose);
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

function escapeToClose(event) {
  if (event.key === 'Escape') closeSheet();
}
