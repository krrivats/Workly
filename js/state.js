/**
 * Workly - Centralized Application State
 */

import { DEFAULT_LOCATIONS, DEFAULT_SETTINGS, DEFAULT_HOME_STATE } from './storage.js';

const STORAGE_THEME_KEY = 'workly_theme_preference';

const getSavedTheme = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_THEME_KEY) || 'system' : 'system';
  } catch (e) {
    return 'system';
  }
};

const initialState = {
  currentScreen: 'home',
  theme: getSavedTheme(),
  
  // Home demo state
  home: { ...DEFAULT_HOME_STATE },

  // Calendar state (0-indexed month: 8 = September)
  calendar: {
    year: 2026,
    month: 8,
    selectedDay: 30
  },

  // Stats state
  stats: {
    period: 'month' // 'week' | 'month'
  },

  // Locations state
  locations: [...DEFAULT_LOCATIONS],
  editingLocation: null,
  deletingLocationId: null,

  // Settings state
  settings: { ...DEFAULT_SETTINGS },

  storageStatus: 'Initializing IndexedDB...'
};

class StateStore {
  constructor(defaults) {
    this._state = { ...defaults };
    this._listeners = new Set();
  }

  /**
   * Get current state snapshot
   * @returns {Object}
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Update state partially and notify listeners
   * @param {Object} partialState 
   */
  setState(partialState) {
    const prevState = { ...this._state };
    this._state = { ...this._state, ...partialState };

    if (partialState.theme && partialState.theme !== prevState.theme) {
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_THEME_KEY, partialState.theme);
        }
      } catch (e) {
        console.warn('[StateStore] Theme save error:', e);
      }
    }

    this._notify(prevState);
  }

  /**
   * Subscribe to state change notifications
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _notify(prevState) {
    const currentState = this.getState();
    this._listeners.forEach((listener) => {
      try {
        listener(currentState, prevState);
      } catch (err) {
        console.error('[StateStore] Error in subscriber listener:', err);
      }
    });
  }
}

export const store = new StateStore(initialState);
