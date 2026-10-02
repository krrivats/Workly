/**
 * Workly - Utility Helpers
 */

export const $ = (selector, context = document) => context.querySelector(selector);
export const $$ = (selector, context = document) => context.querySelectorAll(selector);

/**
 * Formats total seconds into HH:MM:SS format
 */
export function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return [hrs, mins, secs]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}

/**
 * Formats date into 12-hour AM/PM string (e.g., 09:32 AM)
 */
export function formatTimeAMPM(date = new Date()) {
  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  const minutesStr = String(minutes).padStart(2, '0');
  return `${hoursStr}:${minutesStr} ${ampm}`;
}

/**
 * Gets the user's system color scheme preference ('dark' or 'light')
 */
export function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Applies theme attribute to documentElement
 */
export function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/**
 * Shows a toast message
 */
export function showToast(message, type = 'info', duration = 3000) {
  const container = $('#toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-message toast-${type}`;
  
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠️' : type === 'error' ? '✕' : 'ℹ️';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-text">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px)';
    toast.style.transition = 'all 0.2s ease-out';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/**
 * Open Modal / Bottom Sheet
 */
export function openModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

/**
 * Close Modal / Bottom Sheet
 */
export function closeModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/**
 * Escape HTML
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, (match) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return map[match];
  });
}
