import { $, $$ } from './dom.js';
import { icon } from './icons.js';

let currentBackHandler = null;
let globalHandlersBound = false;

export function sheetHeader(title, { back = false } = {}) {
  const backButton = back
    ? `<button class="button text sheet-back" type="button" data-back data-sheet-action="back">${icon('back')}<span>Zurueck</span></button>`
    : '<span></span>';
  return `
    <div class="sheet-head">
      ${backButton}
      <h2>${title}</h2>
      <button class="icon-button" type="button" data-close data-sheet-action="close" aria-label="Schliessen">${icon('close')}</button>
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
  document.addEventListener('keydown', escapeToClose);
  $('[data-close]', node)?.focus();
}

export function closeSheet() {
  $$('.sheet-backdrop').forEach((node) => {
    node.removeEventListener('click', handleSheetClick);
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
