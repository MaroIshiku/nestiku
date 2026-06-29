export const state = {
  app: null,
  setup: null,
  authenticated: false,
  user: null,
  settings: null,
  links: [],
  searchEngines: {},
  themes: ['lavender', 'mint', 'sky', 'amber', 'rose', 'graphite'],
  modes: ['system', 'light', 'dark'],
  weather: null,
  editingLink: -1,
  linkPage: 0,
  activeAdminTab: 'settings',
  clockTimer: null,
  weatherTimer: null
};

export const THEME_LABELS = {
  lavender: 'Lavender',
  mint: 'Mint',
  sky: 'Sky',
  amber: 'Amber',
  rose: 'Rose',
  graphite: 'Graphite'
};

export const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
export const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
