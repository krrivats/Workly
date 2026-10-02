console.log("WORKLY JS LOADED");

/**
 * Workly - Single Self-Contained Controller & Application Core
 * Works identically on both file:/// protocol and http/https environments.
 */

/* ==========================================================================
   1. UTILITIES & HELPERS
   ========================================================================== */

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => context.querySelectorAll(selector);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Formats year, month (0-indexed), and day into "YYYY-MM-DD"
 */
function formatDateKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Formats Date into "D Mon" (e.g. "28 Sep")
 */
function formatShortDate(date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

/**
 * Formats total seconds into "Xh Ym"
 */
function formatHoursMins(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return '0h 00m';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hrs}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Formats total seconds into HH:MM:SS format
 */
function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hrs, mins, secs]
    .map(v => String(v).padStart(2, '0'))
    .join(':');
}

/**
 * Formats date into 12-hour AM/PM string (e.g., 09:32 AM)
 */
function formatTimeAMPM(date = new Date()) {
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
function getSystemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Applies theme attribute to documentElement
 */
function applyTheme(theme) {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

/**
 * Shows a toast message
 */
function showToast(message, type = 'info', duration = 3000) {
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
function openModal(modalId) {
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
function closeModal(modalId) {
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
function escapeHTML(str) {
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

/* ==========================================================================
   1B. WORK SETTINGS & WFO REQUIREMENT CALCULATION ENGINE (Phase 3)
   ========================================================================== */

/**
 * Custom rounding rule required by Workly:
 * fraction <= 0.5 -> round DOWN
 * fraction > 0.5  -> round UP
 * 
 * Examples:
 * 12.3 -> 12
 * 12.4 -> 12
 * 12.5 -> 12
 * 12.6 -> 13
 * 12.7 -> 13
 * 12.8 -> 13
 * 12.9 -> 13
 */
function customRoundWfo(value) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  const whole = Math.floor(value);
  // Guard against floating point representation errors (e.g. 18.5 * 0.6 = 11.100000000000001)
  const fraction = Math.round((value - whole) * 100000) / 100000;
  return fraction > 0.5 ? whole + 1 : whole;
}

/**
 * Checks if a date falls on one of the user-configured working days.
 * Supports both full names ('Monday') and abbreviations ('mon').
 */
function isDaySelectedWorkingDay(date, workingDays = []) {
  if (!workingDays || !Array.isArray(workingDays) || workingDays.length === 0) return false;
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayIndex = date.getDay();
  const dayFullName = dayNames[dayIndex];
  const dayShortName = dayFullName.slice(0, 3).toLowerCase();

  return workingDays.some((w) => {
    const norm = String(w).trim().toLowerCase();
    return norm === dayFullName.toLowerCase() || norm === dayShortName;
  });
}

/**
 * Calculates raw and rounded WFO requirement directly from numeric inputs
 */
function calculateWfoFromCounts(workingDaysCount, holidaysCount = 0, fullLeaveCount = 0, halfLeaveCount = 0, percentage = 60) {
  const eligibleWorkingDays = Math.max(0, workingDaysCount - holidaysCount - fullLeaveCount - (0.5 * halfLeaveCount));
  const rawWfoDays = eligibleWorkingDays * (percentage / 100);
  const requiredDays = customRoundWfo(rawWfoDays);
  return {
    workingDays: workingDaysCount,
    holidays: holidaysCount,
    fullLeave: fullLeaveCount,
    halfLeave: halfLeaveCount,
    eligibleWorkingDays,
    rawWfoDays,
    requiredDays
  };
}

/**
 * Monthly Overrides Architecture (Section 8)
 * Returns the effective work settings for a given month.
 */
function getEffectiveWorkSettings(settings, year, month) {
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const override = settings?.monthlyOverrides?.[monthKey] || {};

  return {
    ...settings,
    ...override,
    targetHoursPerWfoDay: override.targetHoursPerWfoDay ?? override.targetHours ?? settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6,
    targetHours: override.targetHoursPerWfoDay ?? override.targetHours ?? settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6,
    wfoRequirementMode: override.wfoRequirementMode ?? override.wfoMode ?? settings.wfoRequirementMode ?? settings.wfoMode ?? 'percentage',
    wfoMode: override.wfoRequirementMode ?? override.wfoMode ?? settings.wfoRequirementMode ?? settings.wfoMode ?? 'percentage',
    wfoPercentage: override.wfoPercentage ?? override.autoPercentage ?? settings.wfoPercentage ?? settings.autoPercentage ?? 60,
    autoPercentage: override.wfoPercentage ?? override.autoPercentage ?? settings.wfoPercentage ?? settings.autoPercentage ?? 60,
    manualWfoDays: override.manualWfoDays ?? override.manualDays ?? settings.manualWfoDays ?? settings.manualDays ?? 12,
    manualDays: override.manualWfoDays ?? override.manualDays ?? settings.manualWfoDays ?? settings.manualDays ?? 12,
    workingDays: override.workingDays ?? settings.workingDays ?? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  };
}

/**
 * Calculates the monthly WFO requirement for a given year and month (0-indexed).
 * Reads Calendar's stored daily records (Section 14).
 * Works dynamically for any month (Section 7).
 */
function calculateMonthlyWfoRequirement(year, month, settings = {}, dailyRecords = {}) {
  const effectiveSettings = getEffectiveWorkSettings(settings, year, month);
  const mode = effectiveSettings.wfoRequirementMode || effectiveSettings.wfoMode || 'percentage';

  if (mode === 'manual') {
    const manualDays = effectiveSettings.manualWfoDays ?? effectiveSettings.manualDays ?? 12;
    const requiredDays = Math.max(0, parseInt(manualDays, 10) || 0);
    return {
      mode: 'manual',
      requiredDays,
      rawWfoDays: requiredDays,
      eligibleWorkingDays: null,
      workingDaysCount: 0,
      holidaysCount: 0,
      fullLeaveCount: 0,
      halfLeaveCount: 0
    };
  }

  // Automatic percentage mode
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
  const configuredWorkingDays = effectiveSettings.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const percentage = effectiveSettings.wfoPercentage ?? effectiveSettings.autoPercentage ?? 60;

  let workingDaysCount = 0;
  let holidaysCount = 0;
  let fullLeaveCount = 0;
  let halfLeaveCount = 0;

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const curDate = new Date(year, month, day);
    const isWorkDay = isDaySelectedWorkingDay(curDate, configuredWorkingDays);

    if (isWorkDay) {
      workingDaysCount++;
      const key = formatDateKey(year, month, day);
      const rec = dailyRecords[key];
      if (rec) {
        if (rec.status === 'holiday') {
          holidaysCount++;
        } else if (rec.status === 'leave-full' || rec.status === 'full-day-leave') {
          fullLeaveCount++;
        } else if (rec.status === 'leave-half' || rec.status === 'half-day-leave') {
          halfLeaveCount++;
        }
      }
    }
  }

  const calculation = calculateWfoFromCounts(workingDaysCount, holidaysCount, fullLeaveCount, halfLeaveCount, percentage);

  return {
    mode: 'percentage',
    ...calculation,
    workingDaysCount,
    holidaysCount,
    fullLeaveCount,
    halfLeaveCount
  };
}

/**
 * Validates work settings inputs.
 * Returns array of user-friendly error strings.
 */
function validateWorkSettings(targetHours, mode, autoPercent, manualDays, workingDays) {
  const errors = [];
  if (typeof targetHours !== 'number' || isNaN(targetHours) || targetHours <= 0) {
    errors.push('Target average hours must be greater than 0.');
  }
  if (mode === 'percentage') {
    if (typeof autoPercent !== 'number' || isNaN(autoPercent) || autoPercent < 0 || autoPercent > 100) {
      errors.push('WFO percentage must be between 0% and 100%.');
    }
  } else if (mode === 'manual') {
    if (typeof manualDays !== 'number' || isNaN(manualDays) || manualDays < 0) {
      errors.push('Manual WFO days must be greater than or equal to 0.');
    }
  }
  if (!workingDays || !Array.isArray(workingDays) || workingDays.length === 0) {
    errors.push('At least one working day must be selected.');
  }
  return errors;
}

/**
 * Section 18: Calculation Test Cases runner
 */
function runCalculationTestCases() {
  const results = [];

  // Case 1: Working: 20, Hol: 0, Leave: 0, Pct: 60% => 20 * 0.60 = 12 => Expected: 12
  const c1 = calculateWfoFromCounts(20, 0, 0, 0, 60);
  results.push({
    caseNum: 1,
    description: '20 working days, 0 hol, 0 leave, 60%',
    expected: 12,
    actual: c1.requiredDays,
    passed: c1.requiredDays === 12
  });

  // Case 2: Working: 21, Hol: 1, Leave: 0, Pct: 60% => (21 - 1) * 0.60 = 12 => Expected: 12
  const c2 = calculateWfoFromCounts(21, 1, 0, 0, 60);
  results.push({
    caseNum: 2,
    description: '21 working days, 1 holiday, 0 leave, 60%',
    expected: 12,
    actual: c2.requiredDays,
    passed: c2.requiredDays === 12
  });

  // Case 3: Working: 21, Hol: 1, Full leave: 1, Pct: 60% => (21 - 1 - 1) * 0.60 = 11.4 => Expected: 11
  const c3 = calculateWfoFromCounts(21, 1, 1, 0, 60);
  results.push({
    caseNum: 3,
    description: '21 working days, 1 holiday, 1 full leave, 60%',
    expected: 11,
    actual: c3.requiredDays,
    passed: c3.requiredDays === 11
  });

  // Case 4: Raw result: 12.5 => Expected: 12
  const c4 = customRoundWfo(12.5);
  results.push({
    caseNum: 4,
    description: 'Raw result 12.5 custom round (fraction <= 0.5 rounds down)',
    expected: 12,
    actual: c4,
    passed: c4 === 12
  });

  // Case 5: Raw result: 12.6 => Expected: 13
  const c5 = customRoundWfo(12.6);
  results.push({
    caseNum: 5,
    description: 'Raw result 12.6 custom round (fraction > 0.5 rounds up)',
    expected: 13,
    actual: c5,
    passed: c5 === 13
  });

  // Case 6: Working: 22, Hol: 2, Full leave: 1, Half leave: 1, Pct: 60% => 18.5 * 0.60 = 11.1 => Expected: 11
  const c6 = calculateWfoFromCounts(22, 2, 1, 1, 60);
  results.push({
    caseNum: 6,
    description: '22 working days, 2 hol, 1 full leave, 1 half leave (0.5), 60%',
    expected: 11,
    actual: c6.requiredDays,
    passed: c6.requiredDays === 11
  });

  console.log('[Workly Phase 3] Section 18 Calculation Test Cases:');
  console.table(results);
  return results;
}

window.WorklyCalculation = {
  customRoundWfo,
  isDaySelectedWorkingDay,
  calculateWfoFromCounts,
  getEffectiveWorkSettings,
  calculateMonthlyWfoRequirement,
  calculateCurrentMonthWfo: (s, r, d = new Date()) => calculateMonthlyWfoRequirement(d.getFullYear(), d.getMonth(), s, r),
  validateWorkSettings,
  runCalculationTestCases
};

window.applyCustomRounding = customRoundWfo;
window.customRoundWfo = customRoundWfo;
window.calculateMonthlyWfoRequirement = calculateMonthlyWfoRequirement;

/* ==========================================================================
   1C. LOCATION MANAGEMENT & GPS HELPERS (Phase 4)
   ========================================================================== */

/**
 * Priority rank mapping for Section 23 sorting
 */
const PRIORITY_ORDER = {
  'Highest': 1,
  'High': 2,
  'Normal': 3,
  'Medium': 3, // backward compatibility
  'Low': 4
};

/**
 * Sorts locations list (Section 23):
 * 1. Active locations first, inactive locations below.
 * 2. Within each group, sort by Priority: Highest > High > Normal > Low.
 */
function sortLocationsList(locations = []) {
  return [...locations].sort((a, b) => {
    // Active first
    const aActive = a.active !== false ? 1 : 0;
    const bActive = b.active !== false ? 1 : 0;
    if (aActive !== bActive) {
      return bActive - aActive; // 1 before 0
    }

    // Priority sort
    const aRank = PRIORITY_ORDER[a.priority] || 3;
    const bRank = PRIORITY_ORDER[b.priority] || 3;
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    // Secondary alphabetical by name
    return (a.name || '').localeCompare(b.name || '');
  });
}

const GPS_STATUS = {
  OFF: 'off',
  WAITING: 'waiting',
  ACTIVE: 'active',
  LOW_ACCURACY: 'low_accuracy',
  DENIED: 'denied',
  UNAVAILABLE: 'unavailable',
  PROMPT: 'prompt'
};

let currentGpsStatus = GPS_STATUS.OFF;
let lastGpsErrorMessage = '';
let activeGpsPromise = null;
let cachedPermissionStatus = null;
let permissionStatusListenerAttached = false;
let isTrackingStarting = false;

/**
 * Queries and observes the browser geolocation permission state via Permissions API.
 * Returns: 'granted' | 'denied' | 'prompt' | 'unavailable' | 'unknown'
 */
async function queryLocationPermissionState() {
  if (!navigator.geolocation) {
    return 'unavailable';
  }
  if (navigator.permissions && typeof navigator.permissions.query === 'function') {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      cachedPermissionStatus = status.state; // 'granted' | 'denied' | 'prompt'

      if (!permissionStatusListenerAttached && status) {
        permissionStatusListenerAttached = true;
        status.onchange = () => {
          cachedPermissionStatus = status.state;
          handleLocationPermissionChange(status.state);
        };
      }
      return status.state;
    } catch (err) {
      console.warn('[Workly] Geolocation permission query error:', err);
    }
  }
  return 'unknown';
}

/**
 * Handles browser-level permission status changes dynamically
 */
function handleLocationPermissionChange(newState) {
  if (newState === 'granted') {
    const state = store.getState();
    if (state.settings?.autoTracking && gpsWatchId === null) {
      startAutomaticTracking(true);
    }
  } else if (newState === 'denied') {
    stopAutomaticTracking(true);
    currentGpsStatus = GPS_STATUS.DENIED;
    lastGpsErrorMessage = 'Location permission is denied in browser settings.';
    updateGpsStatusUI();
  } else if (newState === 'prompt') {
    currentGpsStatus = GPS_STATUS.WAITING;
    updateGpsStatusUI();
  }
}

/**
 * Geolocation capture with centralized permission checking & duplicate request prevention
 */
function captureCurrentGpsCoordinates() {
  if (activeGpsPromise) {
    return activeGpsPromise;
  }

  activeGpsPromise = (async () => {
    if (!navigator.geolocation) {
      throw {
        code: -1,
        message: 'Geolocation is not supported by your browser.'
      };
    }

    const permState = await queryLocationPermissionState();
    if (permState === 'denied') {
      currentGpsStatus = GPS_STATUS.DENIED;
      updateGpsStatusUI();
      throw {
        code: 1,
        message: 'Location permission was denied. Please allow location access in browser settings.'
      };
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          cachedPermissionStatus = 'granted';
          resolve({
            latitude: parseFloat(position.coords.latitude.toFixed(6)),
            longitude: parseFloat(position.coords.longitude.toFixed(6)),
            accuracy: Math.round(position.coords.accuracy)
          });
        },
        (error) => {
          let msg = 'Your current location could not be determined.';
          if (error.code === error.PERMISSION_DENIED) {
            cachedPermissionStatus = 'denied';
            currentGpsStatus = GPS_STATUS.DENIED;
            updateGpsStatusUI();
            msg = 'Location permission was denied. Please allow location access in browser settings.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Location request timed out. Please try again.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'Your current location could not be determined.';
          }
          reject({ code: error.code, message: msg });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  })().finally(() => {
    activeGpsPromise = null;
  });

  return activeGpsPromise;
}

/**
 * Validates location form inputs (Section 19 & 20)
 */
function validateLocationInput(name, lat, lng, radius, target, grace, existingLocations = [], editingLocId = null) {
  const errors = [];

  // Name required
  if (!name || name.trim() === '') {
    errors.push('Location name is required.');
  }

  // Latitude: -90 to +90
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
    errors.push('Latitude must be a valid number between -90 and +90.');
  }

  // Longitude: -180 to +180
  if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
    errors.push('Longitude must be a valid number between -180 and +180.');
  }

  // Radius: 20m to 5000m
  if (typeof radius !== 'number' || isNaN(radius) || radius < 20 || radius > 5000) {
    errors.push('Radius must be between 20m and 5000m.');
  }

  // Target hours: >= 0
  if (typeof target !== 'number' || isNaN(target) || target < 0) {
    errors.push('Target hours must be 0 or greater.');
  }

  // Grace period: >= 0
  if (typeof grace !== 'number' || isNaN(grace) || grace < 0) {
    errors.push('Grace period must be 0 minutes or greater.');
  }

  // Duplicate check (Section 20):
  // If another active location has same name and same coordinates
  if (name && !isNaN(lat) && !isNaN(lng)) {
    const isDuplicate = existingLocations.some((loc) => {
      if (editingLocId && loc.id === editingLocId) return false;
      if (!loc.active) return false;
      const sameName = (loc.name || '').trim().toLowerCase() === name.trim().toLowerCase();
      const locLat = loc.latitude ?? loc.lat;
      const locLng = loc.longitude ?? loc.lng;
      const sameCoords = Math.abs(locLat - lat) < 0.00001 && Math.abs(locLng - lng) < 0.00001;
      return sameName && sameCoords;
    });

    if (isDuplicate) {
      errors.push('A location with this name and coordinates already exists.');
    }
  }

  return errors;
}

window.WorklyLocation = {
  sortLocationsList,
  captureCurrentGpsCoordinates,
  validateLocationInput
};

/* ==========================================================================
   1D. AUTOMATIC TRACKING & GPS ENGINE (Phase 5)
   ========================================================================== */

/**
 * Background location reliability depends on browser and operating system behavior.
 */

const MAX_ACCEPTABLE_ACCURACY_METERS = 80; // Safeguard: reject enter/exit transitions if accuracy is extremely poor
const DEFAULT_SIMULATED_ACCURACY = 10;

let gpsWatchId = null;
let lastGpsPosition = null;
let currentDetectedLocation = null;
let previousDetectedLocationId = null;
let pendingExit = null; // { locationId, locationName, startedAt, gracePeriodMinutes }
let manualOverrideUntilExit = false;
let isSimulationActive = false;
let exitCheckIntervalId = null;

/**
 * Calculates great-circle distance between two points in meters using Haversine formula (Section 5)
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return Infinity;
  const R = 6371e3; // Earth radius in meters
  const toRad = deg => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10;
}

/**
 * Evaluates coordinates against all active saved locations (Section 7, 8, 11)
 * Applies priority sorting (Highest > High > Normal > Low)
 */
function evaluatePositionAgainstLocations(latitude, longitude, accuracy) {
  const state = store.getState();
  const activeLocations = (state.locations || []).filter(l => l.active !== false);

  const matched = [];
  for (const loc of activeLocations) {
    const locLat = loc.latitude ?? loc.lat;
    const locLng = loc.longitude ?? loc.lng;
    const radius = loc.radiusMeters ?? loc.radius ?? 100;
    const dist = calculateDistance(latitude, longitude, locLat, locLng);

    if (dist <= radius) {
      const priorityRank = PRIORITY_ORDER[loc.priority] || 3;
      matched.push({
        location: loc,
        distance: dist,
        priorityRank
      });
    }
  }

  if (matched.length === 0) {
    let nearestLoc = null;
    let minDistance = Infinity;
    for (const loc of activeLocations) {
      const locLat = loc.latitude ?? loc.lat;
      const locLng = loc.longitude ?? loc.lng;
      const dist = calculateDistance(latitude, longitude, locLat, locLng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestLoc = loc;
      }
    }
    return {
      inside: false,
      selectedLocation: null,
      nearestLocation: nearestLoc,
      distanceToNearest: minDistance
    };
  }

  // Inside one or more locations: Choose highest priority location
  matched.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    return a.distance - b.distance;
  });

  return {
    inside: true,
    selectedLocation: matched[0].location,
    distanceToLocation: matched[0].distance,
    allMatched: matched
  };
}

/**
 * Core Geolocation Engine: processes every GPS position (real or simulated)
 */
function processGpsPosition(position, isSimulated = false) {
  if (!position || !position.coords) return;

  const lat = parseFloat(position.coords.latitude);
  const lng = parseFloat(position.coords.longitude);
  const acc = Math.round(position.coords.accuracy || 10);
  const ts = position.timestamp || Date.now();

  lastGpsPosition = { latitude: lat, longitude: lng, accuracy: acc, timestamp: ts };

  // Accuracy safeguard (Section 6)
  if (acc > MAX_ACCEPTABLE_ACCURACY_METERS) {
    currentGpsStatus = GPS_STATUS.LOW_ACCURACY;
    updateGpsStatusUI();
    updateGpsDebugUI();
    return;
  }

  currentGpsStatus = GPS_STATUS.ACTIVE;

  const evalResult = evaluatePositionAgainstLocations(lat, lng, acc);
  const detected = evalResult.selectedLocation;
  currentDetectedLocation = detected;

  const isInsideOffice = detected && detected.type === 'office';
  const activeOffice = isInsideOffice ? detected : null;

  // Manual Override (Section 19): If user manually checked out while still inside office
  if (manualOverrideUntilExit) {
    if (isInsideOffice) {
      updateGpsStatusUI();
      updateGpsDebugUI();
      return;
    } else {
      // User has physically exited the office geofence: clear override
      manualOverrideUntilExit = false;
    }
  }

  const state = store.getState();
  const todayKey = getTodayDateKey(new Date(ts));
  const session = state.activeSession;
  const isUserIn = session && session.date === todayKey && session.status === 'in';

  if (isInsideOffice) {
    // INSIDE OFFICE RADIUS
    if (pendingExit) {
      console.log('[Workly GPS] User returned to office within grace period. Cancelled pending exit.');
      pendingExit = null;
    }

    if (!isUserIn) {
      // Automatic IN event (Section 10)
      recordAttendanceIn({
        source: 'auto',
        locationId: activeOffice.id,
        locationName: activeOffice.name,
        timestamp: ts
      });
      showToast(`🟢 Auto checked in: ${activeOffice.name}`, 'success');
    }
    // If already IN: do not create another IN, do not reset timer (Section 11)
    previousDetectedLocationId = activeOffice.id;
  } else {
    // OUTSIDE OFFICE RADIUS
    if (isUserIn) {
      // Start pending exit grace period if not already running (Section 12, 13)
      if (!pendingExit) {
        const officeLoc = (state.locations || []).find(l => l.id === session.locationId) ||
                          (state.locations || []).find(l => l.type === 'office');
        const graceMinutes = (officeLoc && (officeLoc.gracePeriodMinutes ?? officeLoc.gracePeriod)) ??
                             state.settings.gracePeriod ?? 10;
        pendingExit = {
          locationId: officeLoc ? officeLoc.id : 'loc-1',
          locationName: officeLoc ? officeLoc.name : 'Office HQ',
          startedAt: ts,
          gracePeriodMinutes: graceMinutes
        };
        console.log(`[Workly GPS] Left office radius. Pending exit started. Grace: ${graceMinutes}m`);
      } else {
        checkPendingExitExpiry(ts);
      }
    }
    previousDetectedLocationId = detected ? detected.id : null;
  }

  updateGpsStatusUI();
  updateGpsDebugUI();
}

/**
 * Checks if pending exit grace period has expired
 */
function checkPendingExitExpiry(nowTs = Date.now()) {
  if (!pendingExit) return { active: false, expired: false };
  const elapsedMs = nowTs - pendingExit.startedAt;
  const graceMs = pendingExit.gracePeriodMinutes * 60 * 1000;
  const expired = elapsedMs >= graceMs;

  if (expired) {
    confirmAutoOut(nowTs);
  }
  return { active: true, expired, elapsedMs, remainingMs: Math.max(0, graceMs - elapsedMs) };
}

/**
 * Confirms Automatic OUT after grace period expires (Section 14)
 */
function confirmAutoOut(exitTimestamp = Date.now()) {
  if (!pendingExit) return;
  const { locationId, locationName } = pendingExit;
  pendingExit = null;

  const state = store.getState();
  const session = state.activeSession;
  const todayKey = getTodayDateKey(new Date(exitTimestamp));

  if (session && session.date === todayKey && session.status === 'in') {
    recordAttendanceOut({
      source: 'auto',
      locationId,
      locationName,
      timestamp: exitTimestamp
    });
    showToast(`⚪ Auto checked out from ${locationName} (Grace period completed)`, 'info');
  }
  updateGpsStatusUI();
  updateGpsDebugUI();
}

/**
 * Immediately confirms pending exit for testing/simulation
 */
function confirmPendingExitNow() {
  if (pendingExit) {
    confirmAutoOut(Date.now());
  }
}

/**
 * Starts automatic location tracking via navigator.geolocation.watchPosition (Section 3)
 * Guards against duplicate watchers and respects browser permission state
 * @param {boolean} isUserExplicitAction - true if user explicitly enabled tracking or requested GPS
 */
async function startAutomaticTracking(isUserExplicitAction = false) {
  const state = store.getState();
  if (!state.settings.autoTracking) {
    stopAutomaticTracking();
    currentGpsStatus = GPS_STATUS.OFF;
    updateGpsStatusUI();
    return;
  }

  if (gpsWatchId !== null) {
    return; // Watcher already running, prevent duplicate
  }

  if (!navigator.geolocation) {
    currentGpsStatus = GPS_STATUS.UNAVAILABLE;
    lastGpsErrorMessage = 'Geolocation is not supported by your browser.';
    updateGpsStatusUI();
    return;
  }

  if (isTrackingStarting) {
    return; // Request already being initiated, prevent duplicate parallel calls
  }

  isTrackingStarting = true;

  try {
    const permState = await queryLocationPermissionState();

    if (permState === 'denied') {
      currentGpsStatus = GPS_STATUS.DENIED;
      lastGpsErrorMessage = 'Location permission is denied in browser settings.';
      updateGpsStatusUI();
      if (isUserExplicitAction) {
        showToast('Location permission is denied in browser settings. Please enable it to use tracking.', 'warning');
      }
      return;
    }

    if (permState === 'prompt' && !isUserExplicitAction) {
      // Permission has not been decided yet.
      // Do not trigger a browser prompt on refresh / page load.
      // Request location only when GPS functionality actually needs it.
      currentGpsStatus = GPS_STATUS.WAITING;
      lastGpsErrorMessage = 'Location permission not requested yet.';
      updateGpsStatusUI();
      return;
    }

    // Either permState is 'granted', or isUserExplicitAction is true, or Permissions API is unsupported ('unknown')
    currentGpsStatus = GPS_STATUS.WAITING;
    updateGpsStatusUI();

    gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        cachedPermissionStatus = 'granted';
        if (!isSimulationActive) {
          processGpsPosition(position, false);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          cachedPermissionStatus = 'denied';
          currentGpsStatus = GPS_STATUS.DENIED;
          lastGpsErrorMessage = 'Location permission is required for automatic tracking.';
          if (isUserExplicitAction) {
            showToast('Location permission was denied. Please allow location access in browser settings.', 'warning');
          }
          stopAutomaticTracking(true);
        } else if (error.code === error.TIMEOUT) {
          currentGpsStatus = GPS_STATUS.UNAVAILABLE;
          lastGpsErrorMessage = 'Location unavailable or timed out.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          currentGpsStatus = GPS_STATUS.UNAVAILABLE;
          lastGpsErrorMessage = 'Location unavailable.';
        } else {
          currentGpsStatus = GPS_STATUS.UNAVAILABLE;
          lastGpsErrorMessage = 'Location unavailable.';
        }
        updateGpsStatusUI();
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );

    if (!exitCheckIntervalId) {
      exitCheckIntervalId = setInterval(() => {
        checkPendingExitExpiry();
        updateGpsDebugUI();
      }, 1000);
    }
  } catch (err) {
    currentGpsStatus = GPS_STATUS.UNAVAILABLE;
    updateGpsStatusUI();
  } finally {
    isTrackingStarting = false;
  }
}

/**
 * Stops automatic location tracking and clears watchers (Section 3)
 */
function stopAutomaticTracking(retainStatus = false) {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (exitCheckIntervalId) {
    clearInterval(exitCheckIntervalId);
    exitCheckIntervalId = null;
  }
  pendingExit = null;
  if (!retainStatus) {
    currentGpsStatus = GPS_STATUS.OFF;
  }
  updateGpsStatusUI();
  updateGpsDebugUI();
}

/**
 * Simulator methods (Section 24)
 */
function simulatePosition(lat, lng, accuracy = DEFAULT_SIMULATED_ACCURACY) {
  isSimulationActive = true;
  const simulatedPos = {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: accuracy
    },
    timestamp: Date.now()
  };
  processGpsPosition(simulatedPos, true);
  updateGpsStatusUI();
  updateGpsDebugUI();
}

function updateGpsDebugUI() {}

/**
 * Updates UI status indicators (Section 20)
 */
function updateGpsStatusUI() {
  const homeGps = $('#home-gps-status-indicator');
  const setGps = $('#settings-gps-status-indicator');

  let statusText = '📍 Location tracking active';
  if (currentGpsStatus === GPS_STATUS.OFF) {
    statusText = '📍 Location tracking OFF';
  } else if (currentGpsStatus === GPS_STATUS.WAITING) {
    statusText = '📍 Waiting for location...';
  } else if (currentGpsStatus === GPS_STATUS.LOW_ACCURACY) {
    statusText = '🟡 GPS accuracy low';
  } else if (currentGpsStatus === GPS_STATUS.DENIED) {
    statusText = '🔴 Location permission denied';
  } else if (currentGpsStatus === GPS_STATUS.UNAVAILABLE) {
    statusText = '🔴 Location unavailable';
  } else if (currentGpsStatus === GPS_STATUS.ACTIVE) {
    statusText = '🟢 Location tracking active';
  }

  if (homeGps) homeGps.textContent = statusText;
  if (setGps) setGps.textContent = statusText;
}

window.WorklyTracking = {
  calculateDistance,
  evaluatePositionAgainstLocations,
  processGpsPosition,
  simulatePosition,
  checkPendingExitExpiry,
  confirmAutoOut,
  confirmPendingExitNow,
  startAutomaticTracking,
  stopAutomaticTracking,
  getPendingExit: () => pendingExit,
  setPendingExit: (pe) => { pendingExit = pe; },
  queryLocationPermissionState,
  getPermissionStatus: () => cachedPermissionStatus,
  getGpsState: () => ({
    status: currentGpsStatus,
    position: lastGpsPosition,
    detectedLocation: currentDetectedLocation,
    pendingExit: pendingExit,
    manualOverride: manualOverrideUntilExit,
    watchId: gpsWatchId
  })
};

window.WorklyGps = window.WorklyTracking;

/* ==========================================================================
   1E. NOTIFICATIONS ENGINE (Phase 6)
   ========================================================================== */

let dailyNotificationState = {
  date: '',
  entrySent: false,
  exitSent: false,
  targetSent: false,
  reminderSent: false,
  lastWeeklySent: 0
};

/**
 * Gets browser notification permission status (Section 1)
 */
function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * Requests browser notification permission when user explicitly enables notifications
 */
async function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    showToast('Notifications are not supported by this browser.', 'warning');
    updateNotificationPermissionUI();
    return 'unsupported';
  }

  try {
    const perm = await Notification.requestPermission();
    updateNotificationPermissionUI();
    if (perm === 'granted') {
      showToast('Notifications enabled!', 'success');
    } else if (perm === 'denied') {
      showToast('Notifications are blocked. Enable them in browser settings.', 'warning');
    }
    return perm;
  } catch (err) {
    console.warn('[Workly Notification] Permission request error:', err);
    updateNotificationPermissionUI();
    return getNotificationPermission();
  }
}

/**
 * Updates Notification Permission Status UI in Settings screen
 */
function updateNotificationPermissionUI() {
  const permBadge = $('#notify-perm-status');
  const alertEl = $('#notify-perm-alert');
  const btnEnable = $('#btn-enable-notifications');
  const perm = getNotificationPermission();

  if (permBadge) {
    if (perm === 'granted') {
      permBadge.textContent = 'Granted';
      permBadge.className = 'badge badge-success';
    } else if (perm === 'denied') {
      permBadge.textContent = 'Denied';
      permBadge.className = 'badge badge-danger';
    } else if (perm === 'unsupported') {
      permBadge.textContent = 'Unsupported';
      permBadge.className = 'badge badge-neutral';
    } else {
      permBadge.textContent = 'Not requested';
      permBadge.className = 'badge badge-neutral';
    }
  }

  if (btnEnable) {
    btnEnable.style.display = perm === 'granted' ? 'none' : 'inline-block';
    if (perm === 'unsupported') {
      btnEnable.disabled = true;
      btnEnable.textContent = 'Unsupported';
    } else {
      btnEnable.disabled = false;
      btnEnable.textContent = 'Enable Notifications';
    }
  }

  if (alertEl) {
    if (perm === 'denied') {
      alertEl.textContent = 'Notifications are blocked. Enable them in browser settings.';
      alertEl.style.display = 'block';
    } else if (perm === 'unsupported') {
      alertEl.textContent = 'Notifications are not supported by this browser.';
      alertEl.style.display = 'block';
    } else {
      alertEl.style.display = 'none';
      alertEl.textContent = '';
    }
  }
}

/**
 * Ensures daily notification state is reset for a new date (Section 14 & 15)
 */
function syncDailyNotificationDate() {
  const todayKey = getTodayDateKey();
  if (dailyNotificationState.date !== todayKey) {
    dailyNotificationState = {
      date: todayKey,
      entrySent: false,
      exitSent: false,
      targetSent: false,
      reminderSent: false,
      lastWeeklySent: dailyNotificationState.lastWeeklySent || 0
    };
    saveData('workly_notification_state', dailyNotificationState);
  }
}

/**
 * Formats reminder threshold minutes into human-readable text (Section 7)
 */
function formatReminderThresholdText(mins) {
  if (mins === 60) return '1 hour';
  if (mins === 120) return '2 hours';
  if (mins % 60 === 0) return `${mins / 60} hours`;
  if (mins > 60) return `${Math.floor(mins / 60)} hour ${mins % 60} mins`;
  return `${mins} minutes`;
}

/**
 * Dispatches notification with master switch, sub-setting, and deduplication checks
 */
function dispatchNotification(title, options = {}, type = null, force = false) {
  const settings = store.getState().settings;

  // Master Notifications check (Section 2)
  if (!settings.notifyMaster && !force) {
    return false;
  }

  // Individual notification type toggle check
  if (type === 'entry' && !settings.notifyEntry && !force) return false;
  if (type === 'exit' && !settings.notifyExit && !force) return false;
  if (type === 'target' && !settings.notifyTarget && !force) return false;
  if (type === 'reminder' && !settings.notifyReminder && !force) return false;
  if (type === 'wfo_progress' && !settings.notifyMonthly && !settings.notifyWfoProgress && !force) return false;

  syncDailyNotificationDate();

  // Deduplication check (Section 14)
  if (!force) {
    if (type === 'entry' && dailyNotificationState.entrySent) return false;
    if (type === 'exit' && dailyNotificationState.exitSent) return false;
    if (type === 'target' && dailyNotificationState.targetSent) return false;
    if (type === 'reminder' && dailyNotificationState.reminderSent) return false;
    if (type === 'wfo_progress') {
      const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
      if (settings.wfoReminderFreq === 'off') return false;
      if (Date.now() - (dailyNotificationState.lastWeeklySent || 0) < oneWeekMs) return false;
    }
  }

  // Update deduplication markers
  if (type === 'entry') {
    dailyNotificationState.entrySent = true;
    dailyNotificationState.exitSent = false;
  } else if (type === 'exit') {
    dailyNotificationState.exitSent = true;
    dailyNotificationState.entrySent = false;
  } else if (type === 'target') {
    dailyNotificationState.targetSent = true;
  } else if (type === 'reminder') {
    dailyNotificationState.reminderSent = true;
  } else if (type === 'wfo_progress') {
    dailyNotificationState.lastWeeklySent = Date.now();
  }

  saveData('workly_notification_state', dailyNotificationState);

  // Send Browser Notification or fallback to in-app toast
  const bodyText = options.body || '';
  let browserSent = false;
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: './icon.png',
        badge: './icon.png',
        ...options
      });
      browserSent = true;
    } catch (e) {
      console.warn('[Workly Notification] Browser Notification error:', e);
    }
  }

  // Log in-memory for testing and debugging
  if (!window._worklyNotificationLog) window._worklyNotificationLog = [];
  window._worklyNotificationLog.push({
    title,
    body: bodyText,
    type,
    timestamp: Date.now(),
    browserSent
  });

  // Also show a toast notification so user has visible feedback
  showToast(`${title}: ${bodyText.replace(/\n/g, ' ')}`, type === 'target' ? 'success' : 'info');

  return true;
}

/**
 * Checks and sends weekly WFO progress reminder (Section 9 & 10)
 */
function checkWeeklyWfoReminder(force = false) {
  const state = store.getState();
  const settings = state.settings;
  const records = state.dailyRecords || {};

  // Count actual WFO attendance days in current month
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  let attendedDays = 0;

  Object.values(records).forEach((r) => {
    if (!r.date) return;
    const [y, m] = r.date.split('-').map(Number);
    if (y === currentYear && (m - 1) === currentMonth) {
      if (r.status === 'wfo' || (r.firstInTimestamp && r.status !== 'holiday' && !r.status.startsWith('leave'))) {
        attendedDays += 1;
      }
    }
  });

  const calculation = typeof calculateMonthlyWfoRequirement === 'function'
    ? calculateMonthlyWfoRequirement(currentYear, currentMonth, settings, records)
    : (window.WorklyCalculation?.calculateCurrentMonthWfo?.(settings, records, today));
  const requiredDays = calculation ? calculation.requiredDays : (settings.manualWfoDays ?? 12);
  const remainingDays = Math.max(0, requiredDays - attendedDays);

  const title = 'Workly';
  const body = `WFO progress: ${attendedDays} of ${requiredDays} days completed. ${remainingDays} days remaining.`;

  return dispatchNotification(title, { body }, 'wfo_progress', force);
}

window.WorklyNotification = {
  getPermission: getNotificationPermission,
  requestPermission: requestNotificationPermission,
  dispatchNotification,
  checkWeeklyWfoReminder,
  getDailyNotificationState: () => ({ ...dailyNotificationState }),
  resetDailyNotificationState: () => {
    const todayKey = getTodayDateKey();
    dailyNotificationState = {
      date: todayKey,
      entrySent: false,
      exitSent: false,
      targetSent: false,
      reminderSent: false,
      lastWeeklySent: 0
    };
    saveData('workly_notification_state', dailyNotificationState);
  }
};

/* ==========================================================================
   2. STORAGE LAYER (IndexedDB with robust fallback)
   ========================================================================== */

const DB_NAME = 'WorklyDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_data';

let dbInstance = null;

const DEFAULT_LOCATIONS = [];

const DEFAULT_SETTINGS = {
  targetHoursPerWfoDay: 6,
  targetHours: 6, // backwards compatibility alias
  wfoRequirementMode: 'percentage', // 'percentage' | 'manual'
  wfoMode: 'percentage', // backwards compatibility alias
  wfoPercentage: 60,
  autoPercentage: 60, // backwards compatibility alias
  manualWfoDays: 12,
  manualDays: 12, // backwards compatibility alias
  workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  monthlyOverrides: {},
  autoTracking: true,
  manualTracking: true,
  gracePeriod: 10,
  notifyMaster: true,
  notifyEntry: true,
  notifyExit: true,
  notifyTarget: true,
  notifyReminder: true,
  reminderThreshold: 60,
  notifyMonthly: true,
  notifyWfoProgress: true,
  wfoReminderFreq: 'weekly',
  theme: 'system'
};

const DEFAULT_HOME_STATE = {
  status: 'OUTSIDE OFFICE', // 'IN OFFICE' | 'OUTSIDE OFFICE'
  checkInTime: '--:-- AM',
  checkOutTime: '--:-- PM',
  timerSeconds: 0,
  timerRunning: false,
  targetSeconds: 21600, // 06:00:00
  wfoDaysCurrent: 0,
  wfoDaysTarget: 12,
  avgHours: '00h 00m',
  targetHours: '06h 00m'
};

function createFallbackStorage() {
  return {
    isFallback: true,
    getItem: (k) => {
      try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
    },
    setItem: (k, v) => {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    },
    removeItem: (k) => {
      try { localStorage.removeItem(k); } catch (e) {}
    },
    clear: () => {
      try { localStorage.clear(); } catch (e) {}
    }
  };
}

function initStorage() {
  return new Promise((resolve) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }

    if (typeof indexedDB === 'undefined') {
      dbInstance = createFallbackStorage();
      return resolve(dbInstance);
    }

    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        console.log('[Storage] IndexedDB initialized successfully.');
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn('[Storage] IndexedDB error, falling back to localStorage:', event.target?.error);
        dbInstance = createFallbackStorage();
        resolve(dbInstance);
      };
    } catch (err) {
      console.warn('[Storage] IndexedDB exception, falling back to localStorage:', err);
      dbInstance = createFallbackStorage();
      resolve(dbInstance);
    }
  });
}

async function saveData(key, value) {
  const db = await initStorage();
  if (db.isFallback) {
    db.setItem(key, value);
    return;
  }
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const storeObj = tx.objectStore(STORE_NAME);
      const request = storeObj.put({ key, value, timestamp: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
    } catch (e) {
      createFallbackStorage().setItem(key, value);
      resolve();
    }
  });
}

async function loadData(key) {
  const db = await initStorage();
  if (db.isFallback) {
    return db.getItem(key);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const storeObj = tx.objectStore(STORE_NAME);
      const request = storeObj.get(key);
      request.onsuccess = (event) => {
        const result = event.target.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => {
        resolve(createFallbackStorage().getItem(key));
      };
    } catch (e) {
      resolve(createFallbackStorage().getItem(key));
    }
  });
}

async function deleteData(key) {
  const db = await initStorage();
  if (db.isFallback) {
    db.removeItem(key);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const storeObj = tx.objectStore(STORE_NAME);
      const request = storeObj.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch (e) {
      createFallbackStorage().removeItem(key);
      resolve();
    }
  });
}

async function clearAllData() {
  const db = await initStorage();
  if (db.isFallback) {
    db.clear();
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const storeObj = tx.objectStore(STORE_NAME);
      const request = storeObj.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch (e) {
      createFallbackStorage().clear();
      resolve();
    }
  });
}

async function testStorage() {
  const testKey = 'workly_storage_test';
  const testValue = { status: 'ok', timestamp: Date.now() };

  try {
    await saveData(testKey, testValue);
    const retrieved = await loadData(testKey);

    if (retrieved && retrieved.status === 'ok') {
      const mode = (dbInstance && dbInstance.isFallback) ? 'localStorage' : 'IndexedDB';
      return {
        success: true,
        message: `${mode} test passed cleanly at ${new Date(retrieved.timestamp).toLocaleTimeString()}`
      };
    } else {
      return {
        success: false,
        message: 'Storage test failed: Retrieved value mismatch.'
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `Storage test error: ${err.message}`
    };
  }
}

/* ==========================================================================
   3. CENTRALIZED APPLICATION STATE
   ========================================================================== */

const STORAGE_THEME_KEY = 'workly_theme_preference';

const getSavedTheme = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_THEME_KEY) || 'system' : 'system';
  } catch (e) {
    return 'system';
  }
};

const _initDate = new Date();
const initialState = {
  currentScreen: 'home',
  theme: getSavedTheme(),
  home: { ...DEFAULT_HOME_STATE },

  // Active office session persisted across reload:
  activeSession: null,

  // Daily records: { "YYYY-MM-DD": { date, status, notes, holidayName, leaveReason, leaveType, firstIn, lastOut, totalSeconds } }
  dailyRecords: {},

  // Calendar view state
  calendar: {
    year: _initDate.getFullYear(),
    month: _initDate.getMonth(),
    selectedDay: _initDate.getDate()
  },

  // Statistics view state with navigable reference date
  stats: {
    period: 'month', // 'week' | 'month'
    year: _initDate.getFullYear(),
    month: _initDate.getMonth(),
    day: _initDate.getDate()
  },

  locations: [...DEFAULT_LOCATIONS],
  editingLocation: null,
  deletingLocationId: null,
  settings: { ...DEFAULT_SETTINGS },
  storageStatus: 'Initializing storage...'
};

class StateStore {
  constructor(defaults) {
    this._state = { ...defaults };
    this._listeners = new Set();
  }

  getState() {
    return { ...this._state };
  }

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

const store = new StateStore(initialState);
if (typeof window !== 'undefined') {
  window.store = store;
}

/* ==========================================================================
   4. LIVE HOME TIMER (Timestamp-Based with Automatic Refresh)
   ========================================================================== */

let liveTimerInterval = null;

/**
 * Returns today's date formatted as YYYY-MM-DD
 */
function getTodayDateKey(date = new Date()) {
  return formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Updates context-aware disabled states for action buttons
 * When OUTSIDE: I'M IN is active, I'M LEAVING is disabled
 * When IN: I'M IN is disabled, I'M LEAVING is active
 */
function updateButtonStates(isUserIn) {
  const checkInBtn = $('#btn-check-in');
  const checkOutBtn = $('#btn-check-out');

  if (checkInBtn) {
    checkInBtn.disabled = isUserIn;
    if (isUserIn) {
      checkInBtn.setAttribute('aria-disabled', 'true');
    } else {
      checkInBtn.removeAttribute('aria-disabled');
    }
  }

  if (checkOutBtn) {
    checkOutBtn.disabled = !isUserIn;
    if (!isUserIn) {
      checkOutBtn.setAttribute('aria-disabled', 'true');
    } else {
      checkOutBtn.removeAttribute('aria-disabled');
    }
  }
}

/**
 * Starts the live timer interval if an active session exists
 * Calculates elapsed time strictly using timestamps to prevent drift
 */
function startLiveTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }

  updateLiveTimerUI();
  liveTimerInterval = setInterval(() => {
    updateLiveTimerUI();
  }, 1000);
  window.liveTimerInterval = liveTimerInterval;
}

/**
 * Stops the live timer interval
 */
function stopLiveTimer() {
  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }
  window.liveTimerInterval = null;
  updateLiveTimerUI();
}

/**
 * Updates the Home screen timer and remaining / extra elements based on timestamp difference
 * Follows continuous daily office period: FIRST IN of the day -> LAST OUT of the day
 */
function updateLiveTimerUI() {
  const state = store.getState();
  const todayKey = getTodayDateKey();
  const targetDailyHours = state.settings.targetHoursPerWfoDay ?? state.settings.targetHours ?? 6;
  const targetDailySec = targetDailyHours * 3600;

  // Make sure notification state is synced for today (midnight reset check)
  syncDailyNotificationDate();

  const timerDigitsEl = $('#home-timer-digits');
  const targetDigitsEl = $('#home-target-digits');
  const completionTimeEl = $('#home-completion-time');
  const remainingLabelEl = $('#home-remaining-label');
  const remainingDigitsEl = $('#home-remaining-digits');
  const targetBannerEl = $('#home-target-achieved-banner');
  const targetAchievedSubEl = $('#home-target-achieved-sub');
  const statusBadge = $('#home-status-badge');
  const checkInTimeEl = $('#home-checkin-time');
  const timeLabelEl = $('#home-time-label');

  // Today's Status section elements (Section 11, 12, 13)
  const todayFirstInEl = $('#home-today-first-in');
  const todayLastOutEl = $('#home-today-last-out');
  const todayWfoCountedEl = $('#home-today-wfo-counted');
  const todayWorkedEl = $('#home-today-worked');
  const todayTargetEl = $('#home-today-target');
  const todayTargetStatusEl = $('#home-today-target-status');
  const todayMetricLabelEl = $('#home-today-metric-label');
  const todayMetricValEl = $('#home-today-metric-val');

  if (targetDigitsEl) {
    targetDigitsEl.textContent = formatDuration(targetDailySec);
  }
  if (todayTargetEl) {
    todayTargetEl.textContent = formatHoursMins(targetDailySec);
  }

  const session = state.activeSession;
  const todayRecord = state.dailyRecords[todayKey] || null;

  // Session belongs to today and status is 'in'
  const isSessionToday = session && session.date === todayKey;
  const isUserIn = isSessionToday && session.status === 'in';

  // Target Completion Time calculation (Original First IN + Target duration)
  const hasTodayAttendance = (isSessionToday && session.firstInTimestamp) || (todayRecord && todayRecord.firstInTimestamp);
  const originalFirstInTs = hasTodayAttendance ? ((isSessionToday && session.firstInTimestamp) || todayRecord.firstInTimestamp) : null;
  if (completionTimeEl) {
    if (originalFirstInTs) {
      const targetCompletionTs = originalFirstInTs + (targetDailySec * 1000);
      completionTimeEl.textContent = formatTimeAMPM(new Date(targetCompletionTs));
    } else {
      completionTimeEl.textContent = '--';
    }
  }

  if (isUserIn) {
    // CURRENTLY IN OFFICE - elapsed office time = Date.now() - firstInTimestamp
    const now = Date.now();
    const firstInTs = session.firstInTimestamp || (todayRecord && todayRecord.firstInTimestamp) || now;
    const firstInStr = session.firstIn || (todayRecord && todayRecord.firstIn) || formatTimeAMPM(new Date(firstInTs));
    const workedToday = Math.max(0, Math.floor((now - firstInTs) / 1000));
    const remainingSeconds = targetDailySec - workedToday;

    if (timerDigitsEl) {
      timerDigitsEl.textContent = formatDuration(workedToday);
    }

    if (timeLabelEl) timeLabelEl.textContent = 'Since';
    if (checkInTimeEl) checkInTimeEl.textContent = firstInStr;

    if (statusBadge) {
      statusBadge.innerHTML = `<span class="badge-dot pulse-green" aria-hidden="true"></span> IN OFFICE`;
      statusBadge.className = 'badge badge-success';
    }

    const detectionModeEl = $('#home-detection-mode');
    if (detectionModeEl) {
      const isAuto = session.mode === 'auto' || session.source === 'auto';
      detectionModeEl.textContent = isAuto ? 'Detected automatically' : 'Checked in manually';
      detectionModeEl.style.display = 'block';
    }

    // Phase 6: Target Achieved Notification (Section 5 & 6)
    if (workedToday >= targetDailySec && !dailyNotificationState.targetSent) {
      const targetLabel = `${targetDailyHours}-hour target achieved.`;
      dispatchNotification(
        'Workly',
        { body: `🎯 ${targetLabel}\nYou can leave the office.` },
        'target'
      );
    }

    // Phase 6: Remaining-Time Reminder Notification (Section 7 & 8)
    const reminderThresholdMins = state.settings.reminderThreshold ?? 60;
    const reminderThresholdSec = reminderThresholdMins * 60;
    if (remainingSeconds > 0 && remainingSeconds <= reminderThresholdSec && !dailyNotificationState.reminderSent) {
      const timeText = formatReminderThresholdText(reminderThresholdMins);
      dispatchNotification(
        'Workly',
        { body: `⏳ ${timeText} remaining.\nTarget: ${targetDailyHours} hours.` },
        'reminder'
      );
    }

    if (remainingSeconds > 0) {
      // Still working towards target: display Remaining HH:MM:SS
      if (targetAchievedSubEl) targetAchievedSubEl.style.display = 'none';
      if (remainingLabelEl) remainingLabelEl.textContent = 'Remaining';
      if (remainingDigitsEl) {
        remainingDigitsEl.textContent = formatDuration(remainingSeconds);
        remainingDigitsEl.style.color = 'var(--color-warning-text)';
      }
      if (targetBannerEl) targetBannerEl.style.display = 'none';

      // Target Status Card (Below Target)
      if (todayTargetStatusEl) {
        todayTargetStatusEl.className = 'badge badge-warning';
        todayTargetStatusEl.textContent = '⚠ Not achieved';
      }
      if (todayMetricLabelEl) todayMetricLabelEl.textContent = 'Remaining';
      if (todayMetricValEl) todayMetricValEl.textContent = formatHoursMins(remainingSeconds);
    } else {
      // TARGET ACHIEVED! Display Target achieved 00:00:00 and Extra HH:MM:SS
      const extraSeconds = Math.abs(remainingSeconds);
      if (targetAchievedSubEl) {
        targetAchievedSubEl.textContent = 'Target achieved 00:00:00';
        targetAchievedSubEl.style.display = 'block';
      }
      if (remainingLabelEl) remainingLabelEl.textContent = 'Extra';
      if (remainingDigitsEl) {
        remainingDigitsEl.textContent = formatDuration(extraSeconds);
        remainingDigitsEl.style.color = 'var(--color-success-text)';
      }
      if (targetBannerEl) targetBannerEl.style.display = 'block';

      // Target Status Card (At or Above Target)
      if (todayTargetStatusEl) {
        todayTargetStatusEl.className = 'badge badge-success';
        todayTargetStatusEl.textContent = '✓ Achieved';
      }
      if (todayMetricLabelEl) todayMetricLabelEl.textContent = 'Extra';
      if (todayMetricValEl) todayMetricValEl.textContent = formatHoursMins(extraSeconds);
    }

    // Today's Status updates
    if (todayFirstInEl) todayFirstInEl.textContent = firstInStr;
    if (todayLastOutEl) todayLastOutEl.textContent = session.lastOut || (todayRecord && todayRecord.lastOut) || '--';
    if (todayWfoCountedEl) {
      todayWfoCountedEl.className = 'badge badge-success';
      todayWfoCountedEl.textContent = '✓ Yes';
    }
    if (todayWorkedEl) {
      todayWorkedEl.textContent = formatHoursMins(workedToday);
    }
  } else {
    // CURRENTLY OUTSIDE OFFICE
    if (statusBadge) {
      statusBadge.innerHTML = `<span class="badge-dot" aria-hidden="true"></span> OUTSIDE OFFICE`;
      statusBadge.className = 'badge badge-neutral';
    }

    const detectionModeEl = $('#home-detection-mode');
    if (detectionModeEl) {
      detectionModeEl.style.display = 'none';
    }

    // Check if there was attendance recorded for today
    const hasTodayAttendance = (isSessionToday && session.firstInTimestamp) || (todayRecord && todayRecord.firstInTimestamp);

    if (hasTodayAttendance) {
      const firstInTs = (isSessionToday && session.firstInTimestamp) || todayRecord.firstInTimestamp;
      const lastOutTs = (isSessionToday && session.lastOutTimestamp) || todayRecord.lastOutTimestamp || firstInTs;
      const firstInStr = (isSessionToday && session.firstIn) || todayRecord.firstIn || formatTimeAMPM(new Date(firstInTs));
      const lastOutStr = (isSessionToday && session.lastOut) || todayRecord.lastOut || formatTimeAMPM(new Date(lastOutTs));

      // Calculate total office time = lastOutTimestamp - firstInTimestamp
      const workedToday = Math.max(0, Math.floor((lastOutTs - firstInTs) / 1000));
      const remainingSeconds = targetDailySec - workedToday;

      if (timeLabelEl) timeLabelEl.textContent = 'Last OUT';
      if (checkInTimeEl) checkInTimeEl.textContent = lastOutStr;

      if (timerDigitsEl) {
        timerDigitsEl.textContent = formatDuration(workedToday);
      }

      if (remainingSeconds > 0) {
        if (targetAchievedSubEl) targetAchievedSubEl.style.display = 'none';
        if (remainingLabelEl) remainingLabelEl.textContent = 'Remaining';
        if (remainingDigitsEl) {
          remainingDigitsEl.textContent = formatDuration(remainingSeconds);
          remainingDigitsEl.style.color = 'var(--color-text-secondary)';
        }
        if (targetBannerEl) targetBannerEl.style.display = 'none';

        if (todayTargetStatusEl) {
          todayTargetStatusEl.className = 'badge badge-warning';
          todayTargetStatusEl.textContent = '⚠ Not achieved';
        }
        if (todayMetricLabelEl) todayMetricLabelEl.textContent = 'Remaining';
        if (todayMetricValEl) todayMetricValEl.textContent = formatHoursMins(remainingSeconds);
      } else {
        const extraSeconds = Math.abs(remainingSeconds);
        if (targetAchievedSubEl) {
          targetAchievedSubEl.textContent = 'Target achieved 00:00:00';
          targetAchievedSubEl.style.display = 'block';
        }
        if (remainingLabelEl) remainingLabelEl.textContent = 'Extra';
        if (remainingDigitsEl) {
          remainingDigitsEl.textContent = formatDuration(extraSeconds);
          remainingDigitsEl.style.color = 'var(--color-success-text)';
        }
        if (targetBannerEl) targetBannerEl.style.display = 'block';

        if (todayTargetStatusEl) {
          todayTargetStatusEl.className = 'badge badge-success';
          todayTargetStatusEl.textContent = '✓ Achieved';
        }
        if (todayMetricLabelEl) todayMetricLabelEl.textContent = 'Extra';
        if (todayMetricValEl) todayMetricValEl.textContent = formatHoursMins(extraSeconds);
      }

      if (todayFirstInEl) todayFirstInEl.textContent = firstInStr;
      if (todayLastOutEl) todayLastOutEl.textContent = lastOutStr;
      if (todayWfoCountedEl) {
        todayWfoCountedEl.className = 'badge badge-success';
        todayWfoCountedEl.textContent = '✓ Yes';
      }
      if (todayWorkedEl) {
        todayWorkedEl.textContent = formatHoursMins(workedToday);
      }
    } else {
      // No attendance logged today
      if (timeLabelEl) timeLabelEl.textContent = 'Status';
      if (checkInTimeEl) checkInTimeEl.textContent = 'Not Checked In';

      if (timerDigitsEl) timerDigitsEl.textContent = '00:00:00';

      if (targetAchievedSubEl) targetAchievedSubEl.style.display = 'none';
      if (remainingLabelEl) remainingLabelEl.textContent = 'Remaining';
      if (remainingDigitsEl) {
        remainingDigitsEl.textContent = formatDuration(targetDailySec);
        remainingDigitsEl.style.color = 'var(--color-text-secondary)';
      }
      if (targetBannerEl) targetBannerEl.style.display = 'none';

      if (todayFirstInEl) todayFirstInEl.textContent = '--';
      if (todayLastOutEl) todayLastOutEl.textContent = '--';
      if (todayWfoCountedEl) {
        todayWfoCountedEl.className = 'badge badge-neutral';
        todayWfoCountedEl.textContent = 'No';
      }
      if (todayWorkedEl) {
        todayWorkedEl.textContent = '00h 00m';
      }
      if (todayTargetStatusEl) {
        todayTargetStatusEl.className = 'badge badge-neutral';
        todayTargetStatusEl.textContent = 'Not achieved';
      }
      if (todayMetricLabelEl) todayMetricLabelEl.textContent = 'Remaining';
      if (todayMetricValEl) todayMetricValEl.textContent = formatHoursMins(targetDailySec);
    }
  }

  // Update context-aware button states
  updateButtonStates(isUserIn);
  updateGpsStatusUI();
}

/* ==========================================================================
   5. APPLICATION CONTROLLER
   ========================================================================== */

// Check DOM initialization and execute
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });
} else {
  initApp();
}

async function initApp() {
  console.log("WORKLY INIT START");
  console.log('[Workly] Bootstrapping Application...');

  // 1. Load saved settings, locations, homeState, dailyRecords, and activeSession from storage
  await loadPersistedData();

  // 2. Setup Navigation Routing
  setupNavigation();

  // 3. Setup Theme
  setupTheme();

  // 4. Setup Screen Handlers
  setupHomeActions();
  setupCalendarActions();
  setupStatsActions();
  setupLocationActions();
  setupSettingsActions();
  setupServiceWorker();

  // 5. Subscribe UI updates to state changes
  store.subscribe(renderUI);

  // Initial UI Render
  renderUI(store.getState(), {});

  // Start live timer if active session was persisted and is currently IN today
  const session = store.getState().activeSession;
  const todayKey = getTodayDateKey();
  if (session && session.date === todayKey && session.status === 'in') {
    startLiveTimer();
  } else {
    updateLiveTimerUI();
  }

  // 6. Start Automatic Tracking if enabled in settings (Section 2, 3)
  if (store.getState().settings.autoTracking) {
    startAutomaticTracking(false);
  } else {
    stopAutomaticTracking();
  }

  // 7. Notifications initialization (Section 1, 9)
  updateNotificationPermissionUI();
  checkWeeklyWfoReminder();

  // Run storage health check silently
  runStorageHealthCheck();
}

/**
 * Load saved data from storage
 */
async function loadPersistedData() {
  try {
    const savedSettings = await loadData('workly_settings');
    const savedLocations = await loadData('workly_locations');
    const savedHomeState = await loadData('workly_home_state');
    const savedDailyRecords = await loadData('workly_daily_records');
    const savedSession = await loadData('workly_active_session');
    const savedNotifState = await loadData('workly_notification_state');

    const update = {};
    if (savedSettings) {
      update.settings = {
        ...DEFAULT_SETTINGS,
        ...savedSettings,
        targetHoursPerWfoDay: savedSettings.targetHoursPerWfoDay ?? savedSettings.targetHours ?? 6,
        targetHours: savedSettings.targetHoursPerWfoDay ?? savedSettings.targetHours ?? 6,
        wfoRequirementMode: savedSettings.wfoRequirementMode ?? savedSettings.wfoMode ?? 'percentage',
        wfoMode: savedSettings.wfoRequirementMode ?? savedSettings.wfoMode ?? 'percentage',
        wfoPercentage: savedSettings.wfoPercentage ?? savedSettings.autoPercentage ?? 60,
        autoPercentage: savedSettings.wfoPercentage ?? savedSettings.autoPercentage ?? 60,
        manualWfoDays: savedSettings.manualWfoDays ?? savedSettings.manualDays ?? 12,
        manualDays: savedSettings.manualWfoDays ?? savedSettings.manualDays ?? 12,
        workingDays: Array.isArray(savedSettings.workingDays) && savedSettings.workingDays.length > 0
          ? savedSettings.workingDays
          : DEFAULT_SETTINGS.workingDays,
        monthlyOverrides: savedSettings.monthlyOverrides || {}
      };
    }
    let locationsChanged = false;
    if (savedLocations && Array.isArray(savedLocations)) {
      const realLocations = savedLocations
        .filter(loc => {
          if (loc.isDemo) { locationsChanged = true; return false; }
          return true;
        })
        .map(loc => ({
          id: loc.id,
          name: loc.name,
          type: loc.type || 'office',
          latitude: loc.latitude ?? loc.lat ?? 0,
          longitude: loc.longitude ?? loc.lng ?? 0,
          lat: loc.latitude ?? loc.lat ?? 0,
          lng: loc.longitude ?? loc.lng ?? 0,
          radiusMeters: loc.radiusMeters ?? loc.radius ?? 100,
          radius: loc.radiusMeters ?? loc.radius ?? 100,
          targetHours: loc.targetHours ?? 0,
          priority: loc.priority || 'Normal',
          gracePeriodMinutes: loc.gracePeriodMinutes ?? loc.gracePeriod ?? 10,
          gracePeriod: loc.gracePeriodMinutes ?? loc.gracePeriod ?? 10,
          active: loc.active !== false,
          isDemo: false
        }));
      update.locations = realLocations;
      if (locationsChanged || realLocations.length !== savedLocations.length) {
        await saveData('workly_locations', realLocations);
      }
    }

    if (savedDailyRecords && typeof savedDailyRecords === 'object') {
      const cleanDaily = {};
      let hadDemoRecords = false;
      for (const [key, rec] of Object.entries(savedDailyRecords)) {
        const isDemo = !!(
          rec && (
            rec.isDemo === true ||
            (typeof rec.notes === 'string' && (
              rec.notes.includes('DEMO ONLY') ||
              rec.notes.includes('DEMO OFFICE SESSION') ||
              rec.notes.includes('DEMO')
            ))
          )
        );
        if (!isDemo) {
          cleanDaily[key] = rec;
        } else {
          hadDemoRecords = true;
        }
      }
      update.dailyRecords = cleanDaily;
      if (hadDemoRecords) {
        await saveData('workly_daily_records', cleanDaily);
      }
    }

    if (savedSession) {
      const isDemoSession = !!(
        savedSession.isDemo === true ||
        (typeof savedSession.notes === 'string' && savedSession.notes.includes('DEMO'))
      );
      const todayKey = getTodayDateKey();
      if (!isDemoSession && savedSession.date === todayKey) {
        update.activeSession = savedSession;
      } else {
        await saveData('workly_active_session', null);
        update.activeSession = null;
      }
    }

    if (savedHomeState) {
      if (!update.activeSession || update.activeSession.status !== 'in') {
        savedHomeState.status = 'OUTSIDE OFFICE';
        savedHomeState.timerSeconds = 0;
        savedHomeState.timerRunning = false;
      }
      update.home = {
        ...DEFAULT_HOME_STATE,
        ...savedHomeState
      };
    }

    if (savedNotifState && typeof savedNotifState === 'object') {
      const todayKey = getTodayDateKey();
      if (savedNotifState.date === todayKey) {
        dailyNotificationState = {
          date: todayKey,
          entrySent: !!savedNotifState.entrySent,
          exitSent: !!savedNotifState.exitSent,
          targetSent: !!savedNotifState.targetSent,
          reminderSent: !!savedNotifState.reminderSent,
          lastWeeklySent: savedNotifState.lastWeeklySent || 0
        };
      } else {
        // Midnight crossed: reset daily notification markers (Section 15)
        dailyNotificationState = {
          date: todayKey,
          entrySent: false,
          exitSent: false,
          targetSent: false,
          reminderSent: false,
          lastWeeklySent: savedNotifState.lastWeeklySent || 0
        };
        await saveData('workly_notification_state', dailyNotificationState);
      }
    } else {
      syncDailyNotificationDate();
    }

    if (Object.keys(update).length > 0) {
      store.setState(update);
    }
  } catch (err) {
    console.warn('[Workly] Error loading stored data:', err);
  }
}

/**
 * Setup Navigation with event delegation and hash routing
 */
function setupNavigation() {
  document.addEventListener('click', (event) => {
    const navBtn = event.target.closest('[data-screen]');
    if (!navBtn) return;
    event.preventDefault();
    const targetScreen = navBtn.dataset.screen;
    console.log('Navigation clicked:', targetScreen);
    navigateToScreen(targetScreen);
  });

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['home', 'calendar', 'statistics', 'locations', 'settings'].includes(hash)) {
      store.setState({ currentScreen: hash });
    }
  });

  const initialHash = window.location.hash.replace('#', '');
  if (['home', 'calendar', 'statistics', 'locations', 'settings'].includes(initialHash)) {
    store.setState({ currentScreen: initialHash });
  }
}

function navigateToScreen(screenName) {
  if (['home', 'calendar', 'statistics', 'locations', 'settings'].includes(screenName)) {
    window.location.hash = screenName;
    store.setState({ currentScreen: screenName });
  }
}

/**
 * Setup Theme Handling
 */
function setupTheme() {
  const currentState = store.getState();
  applyTheme(currentState.theme);

  const headerThemeBtn = $('#header-theme-toggle');
  if (headerThemeBtn) {
    headerThemeBtn.addEventListener('click', () => {
      const state = store.getState();
      const nextTheme = state.theme === 'dark' ? 'light' : state.theme === 'light' ? 'system' : 'dark';
      store.setState({ theme: nextTheme });
      applyTheme(nextTheme);
      showToast(`Theme changed to ${nextTheme}`, 'info');
    });
  }
}

/**
 * Records attendance check-in event (Manual or Automatic)
 * Implements First-IN of the day / Returning to office rules
 */
async function recordAttendanceIn({
  source = 'manual',
  locationId = 'loc-1',
  locationName = 'Office HQ',
  timestamp = Date.now()
} = {}) {
  const now = timestamp;
  const todayKey = getTodayDateKey(new Date(now));
  const state = store.getState();
  const session = state.activeSession;
  const todayRecord = state.dailyRecords[todayKey] || null;

  const isSessionToday = session && session.date === todayKey;
  const isUserIn = isSessionToday && session.status === 'in';

  // Guard: If user is ALREADY IN, do nothing (Section 11)
  if (isUserIn) {
    return false;
  }

  // Check if user already checked in earlier today (returning to office)
  const existingFirstInTs = (isSessionToday && session.firstInTimestamp) || (todayRecord && todayRecord.firstInTimestamp);
  const existingFirstInStr = (isSessionToday && session.firstIn) || (todayRecord && todayRecord.firstIn);
  const existingEvents = todayRecord?.events || (existingFirstInTs ? [{ type: 'IN', source: 'unknown', locationId, timestamp: existingFirstInTs }] : []);

  let activeSession;
  let updatedDailyRecord;

  if (existingFirstInTs) {
    // RULE 4 & 16: RETURNING TO OFFICE
    // Keep original firstInTimestamp, update status to IN, resume timer from original first IN
    const newEvents = [...existingEvents, { type: 'IN', source, locationId, timestamp: now }];
    const firstInFormatted = existingFirstInStr || formatTimeAMPM(new Date(existingFirstInTs));

    activeSession = {
      status: 'in',
      date: todayKey,
      firstInTimestamp: existingFirstInTs,
      lastOutTimestamp: (isSessionToday && session.lastOutTimestamp) || todayRecord?.lastOutTimestamp || null,
      firstIn: firstInFormatted,
      lastOut: (isSessionToday && session.lastOut) || todayRecord?.lastOut || '',
      mode: source,
      source: source,
      locationId: locationId,
      locationName: locationName,
      isDemo: !!(session && session.isDemo)
    };

    updatedDailyRecord = {
      ...(todayRecord || {}),
      date: todayKey,
      status: 'wfo',
      firstInTimestamp: existingFirstInTs,
      lastOutTimestamp: activeSession.lastOutTimestamp,
      firstIn: firstInFormatted,
      lastOut: activeSession.lastOut,
      events: newEvents,
      isDemo: !!(session && session.isDemo)
    };
  } else {
    // RULE 2 & 10: First IN of the day
    const firstInStr = formatTimeAMPM(new Date(now));
    const newEvents = [{ type: 'IN', source, locationId, timestamp: now }];

    activeSession = {
      status: 'in',
      date: todayKey,
      firstInTimestamp: now,
      lastOutTimestamp: null,
      firstIn: firstInStr,
      lastOut: '',
      mode: source,
      source: source,
      locationId: locationId,
      locationName: locationName,
      isDemo: false
    };

    updatedDailyRecord = {
      ...(todayRecord || {}),
      date: todayKey,
      status: 'wfo',
      firstInTimestamp: now,
      lastOutTimestamp: null,
      firstIn: firstInStr,
      lastOut: '',
      totalSeconds: 0,
      events: newEvents,
      notes: todayRecord?.notes || '',
      holidayName: todayRecord?.holidayName || '',
      leaveReason: todayRecord?.leaveReason || '',
      leaveType: todayRecord?.leaveType || '',
      isDemo: false
    };
  }

  const updatedDailyRecords = {
    ...state.dailyRecords,
    [todayKey]: updatedDailyRecord
  };

  store.setState({
    activeSession: activeSession,
    dailyRecords: updatedDailyRecords
  });

  await saveData('workly_active_session', activeSession);
  await saveData('workly_daily_records', updatedDailyRecords);
  startLiveTimer();

  // Phase 6: Office Entry Notification (Section 3 & 16)
  const firstInDisplay = activeSession.firstIn || formatTimeAMPM(new Date(now));
  dispatchNotification(
    'Workly',
    { body: `🏢 You're in the office.\nStarted at ${firstInDisplay}.` },
    'entry'
  );

  return true;
}

/**
 * Records attendance check-out event (Manual or Automatic)
 * Implements First-IN -> Last-OUT total elapsed calculation
 */
async function recordAttendanceOut({
  source = 'manual',
  locationId = 'loc-1',
  locationName = 'Office HQ',
  timestamp = Date.now()
} = {}) {
  const now = timestamp;
  const todayKey = getTodayDateKey(new Date(now));
  const state = store.getState();
  const session = state.activeSession;
  const todayRecord = state.dailyRecords[todayKey] || null;

  const isSessionToday = session && session.date === todayKey;
  const isUserIn = isSessionToday && session.status === 'in';

  // Guard: If user is ALREADY OUTSIDE, do nothing
  if (!isUserIn) {
    return false;
  }

  const outStr = formatTimeAMPM(new Date(now));
  const firstInTs = (isSessionToday && session.firstInTimestamp) || (todayRecord && todayRecord.firstInTimestamp) || now;
  const firstInStr = (isSessionToday && session.firstIn) || (todayRecord && todayRecord.firstIn) || formatTimeAMPM(new Date(firstInTs));
  const existingEvents = todayRecord?.events || [{ type: 'IN', source: 'unknown', locationId, timestamp: firstInTs }];
  const newEvents = [...existingEvents, { type: 'OUT', source, locationId, timestamp: now }];

  // RULE 1 & 15: First IN of the day -> Last OUT of the day
  const totalElapsed = Math.max(0, Math.floor((now - firstInTs) / 1000));

  const updatedSession = {
    status: 'out',
    date: todayKey,
    firstInTimestamp: firstInTs,
    lastOutTimestamp: now,
    firstIn: firstInStr,
    lastOut: outStr,
    mode: source,
    source: source,
    locationId: locationId,
    locationName: locationName,
    isDemo: !!(session && session.isDemo)
  };

  const updatedRecord = {
    ...(todayRecord || {}),
    date: todayKey,
    status: 'wfo',
    firstInTimestamp: firstInTs,
    lastOutTimestamp: now,
    firstIn: firstInStr,
    lastOut: outStr,
    totalSeconds: totalElapsed,
    events: newEvents,
    isDemo: !!(session && session.isDemo)
  };

  const updatedDailyRecords = {
    ...state.dailyRecords,
    [todayKey]: updatedRecord
  };

  store.setState({
    activeSession: updatedSession,
    dailyRecords: updatedDailyRecords
  });

  await saveData('workly_active_session', updatedSession);
  await saveData('workly_daily_records', updatedDailyRecords);
  stopLiveTimer();

  // Phase 6: Office Exit Notification (Section 4 & 16)
  dispatchNotification(
    'Workly',
    { body: `🚪 You've left the office.\nLast OUT: ${outStr}.` },
    'exit'
  );

  return true;
}

/**
 * Setup Home Screen Live Actions: I'm In / I'm Leaving
 */
function setupHomeActions() {
  const checkInBtn = $('#btn-check-in');
  const checkOutBtn = $('#btn-check-out');

  if (checkInBtn) {
    checkInBtn.addEventListener('click', async () => {
      manualOverrideUntilExit = false;
      const success = await recordAttendanceIn({ source: 'manual' });
      if (success) {
        showToast('Checked in! Live timer started.', 'success');
      } else {
        showToast('Already checked in.', 'info');
      }
    });
  }

  if (checkOutBtn) {
    checkOutBtn.addEventListener('click', async () => {
      // Manual Override (Section 19): If user manually checks out while inside office,
      // maintain override so GPS doesn't fight manual action until physically exiting
      if (currentDetectedLocation && currentDetectedLocation.type === 'office') {
        manualOverrideUntilExit = true;
      }
      const success = await recordAttendanceOut({ source: 'manual' });
      if (success) {
        const outStr = formatTimeAMPM(new Date());
        showToast(`Checked out at ${outStr}. Timer stopped.`, 'info');
      }
    });
  }
}

/**
 * Setup Calendar Actions: Navigation, Status change, Save, Clear
 */
function setupCalendarActions() {
  const prevMonthBtn = $('#btn-cal-prev');
  const nextMonthBtn = $('#btn-cal-next');

  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      const { calendar } = store.getState();
      let newMonth = calendar.month - 1;
      let newYear = calendar.year;
      if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }
      store.setState({ calendar: { ...calendar, year: newYear, month: newMonth } });
    });
  }

  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      const { calendar } = store.getState();
      let newMonth = calendar.month + 1;
      let newYear = calendar.year;
      if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      }
      store.setState({ calendar: { ...calendar, year: newYear, month: newMonth } });
    });
  }

  const statusSelect = $('#cal-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', () => {
      updateCalendarFieldVisibility(statusSelect.value);
    });
  }

  const saveBtn = $('#btn-save-cal-day');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const { calendar } = store.getState();
      const dateKey = formatDateKey(calendar.year, calendar.month, calendar.selectedDay);
      const selectedStatus = $('#cal-status-select')?.value || 'normal';
      const holidayName = $('#cal-input-holiday-name')?.value.trim() || '';
      const leaveReason = $('#cal-input-leave-reason')?.value.trim() || '';
      const notes = $('#cal-input-notes')?.value.trim() || '';

      await saveCalendarDayDetails(dateKey, {
        status: selectedStatus,
        notes: notes,
        holidayName: selectedStatus === 'holiday' ? holidayName : '',
        leaveReason: (selectedStatus === 'leave-full' || selectedStatus === 'leave-half') ? leaveReason : '',
        leaveType: selectedStatus === 'leave-half' ? 'half-day' : selectedStatus === 'leave-full' ? 'full-day' : ''
      });

      showToast(`Saved details for ${calendar.selectedDay} ${MONTH_NAMES[calendar.month]}`, 'success');
    });
  }

  const clearBtn = $('#btn-clear-cal-day');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const { calendar, dailyRecords } = store.getState();
      const dateKey = formatDateKey(calendar.year, calendar.month, calendar.selectedDay);

      const existingRecord = dailyRecords[dateKey] || {};
      const clearedRecord = {
        date: dateKey,
        status: 'normal',
        notes: existingRecord.notes || '',
        holidayName: '',
        leaveReason: '',
        leaveType: '',
        firstIn: '',
        lastOut: '',
        totalSeconds: 0,
        isDemo: false
      };

      const newDailyRecords = {
        ...dailyRecords,
        [dateKey]: clearedRecord
      };

      store.setState({ dailyRecords: newDailyRecords });
      saveData('workly_daily_records', newDailyRecords);

      if ($('#cal-status-select')) $('#cal-status-select').value = 'normal';
      if ($('#cal-input-holiday-name')) $('#cal-input-holiday-name').value = '';
      if ($('#cal-input-leave-reason')) $('#cal-input-leave-reason').value = '';
      updateCalendarFieldVisibility('normal');

      showToast(`Status reset to Normal for ${calendar.selectedDay} ${MONTH_NAMES[calendar.month]}`, 'info');
    });
  }
}

/**
 * Save day details (notes, status, holiday, leave) cleanly with zero fake data
 */
async function saveCalendarDayDetails(dateKey, details = {}) {
  const { dailyRecords } = store.getState();
  const existingRecord = dailyRecords[dateKey] || {};

  const updatedRecord = {
    date: dateKey,
    status: details.status || existingRecord.status || 'normal',
    notes: details.notes !== undefined ? details.notes : (existingRecord.notes || ''),
    holidayName: details.holidayName !== undefined ? details.holidayName : (existingRecord.holidayName || ''),
    leaveReason: details.leaveReason !== undefined ? details.leaveReason : (existingRecord.leaveReason || ''),
    leaveType: details.leaveType !== undefined ? details.leaveType : (existingRecord.leaveType || ''),
    firstIn: existingRecord.firstIn || '',
    lastOut: existingRecord.lastOut || '',
    totalSeconds: existingRecord.totalSeconds || 0,
    isDemo: false
  };

  const newDailyRecords = {
    ...dailyRecords,
    [dateKey]: updatedRecord
  };

  store.setState({ dailyRecords: newDailyRecords });
  await saveData('workly_daily_records', newDailyRecords);
  return updatedRecord;
}

window.saveCalendarDayDetails = saveCalendarDayDetails;
window.saveDayDetails = saveCalendarDayDetails;


function updateCalendarFieldVisibility(status) {
  const holidayField = $('#cal-field-holiday');
  const leaveField = $('#cal-field-leave');

  if (holidayField) {
    holidayField.style.display = status === 'holiday' ? 'block' : 'none';
  }

  if (leaveField) {
    leaveField.style.display = (status === 'leave-full' || status === 'leave-half') ? 'block' : 'none';
  }
}

/**
 * Setup Statistics Screen Actions
 */
function setupStatsActions() {
  const periodWeekBtn = $('#stats-period-week');
  const periodMonthBtn = $('#stats-period-month');
  const prevBtn = $('#btn-stats-prev');
  const nextBtn = $('#btn-stats-next');

  if (periodWeekBtn) {
    periodWeekBtn.addEventListener('click', () => {
      const { stats } = store.getState();
      store.setState({ stats: { ...stats, period: 'week' } });
    });
  }

  if (periodMonthBtn) {
    periodMonthBtn.addEventListener('click', () => {
      const { stats } = store.getState();
      store.setState({ stats: { ...stats, period: 'month' } });
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const { stats } = store.getState();
      if (stats.period === 'week') {
        const d = new Date(stats.year, stats.month, stats.day - 7);
        store.setState({ stats: { ...stats, year: d.getFullYear(), month: d.getMonth(), day: d.getDate() } });
      } else {
        let m = stats.month - 1;
        let y = stats.year;
        if (m < 0) {
          m = 11;
          y -= 1;
        }
        store.setState({ stats: { ...stats, year: y, month: m } });
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const { stats } = store.getState();
      if (stats.period === 'week') {
        const d = new Date(stats.year, stats.month, stats.day + 7);
        store.setState({ stats: { ...stats, year: d.getFullYear(), month: d.getMonth(), day: d.getDate() } });
      } else {
        let m = stats.month + 1;
        let y = stats.year;
        if (m > 11) {
          m = 0;
          y += 1;
        }
        store.setState({ stats: { ...stats, year: y, month: m } });
      }
    });
  }
}

/**
 * Setup Locations Screen Modal Actions & Form Handlers
 */
let lastDetectedGps = null;

/**
 * Setup Locations Screen Modal Actions & Form Handlers
 */
function setupLocationActions() {
  const addLocBtn = $('#btn-add-location');
  const modal = $('#modal-location-form');
  const closeBtn = $('#btn-close-loc-modal');
  const cancelBtn = $('#btn-cancel-loc-modal');
  const form = $('#form-location');

  const confirmDeleteModal = $('#modal-confirm-delete-loc');
  const cancelDeleteBtn = $('#btn-cancel-delete-loc');
  const confirmDeleteBtn = $('#btn-confirm-delete-loc');

  // Utility Section: Current Location
  const btnGetCurrentGps = $('#btn-get-current-gps');
  const currentGpsDisplay = $('#current-gps-display');
  const currentGpsLat = $('#current-gps-lat');
  const currentGpsLng = $('#current-gps-lng');
  const currentGpsAcc = $('#current-gps-acc');
  const btnUseDetectedGps = $('#btn-use-detected-gps');

  if (btnGetCurrentGps) {
    btnGetCurrentGps.addEventListener('click', async () => {
      try {
        btnGetCurrentGps.disabled = true;
        btnGetCurrentGps.innerHTML = '<span>⏳ Detecting...</span>';
        const coords = await captureCurrentGpsCoordinates();
        lastDetectedGps = coords;
        if (currentGpsDisplay) currentGpsDisplay.style.display = 'block';
        if (currentGpsLat) currentGpsLat.textContent = coords.latitude.toFixed(5);
        if (currentGpsLng) currentGpsLng.textContent = coords.longitude.toFixed(5);
        if (currentGpsAcc) currentGpsAcc.textContent = `±${coords.accuracy}m`;
        showToast(`Location detected (Accuracy: ±${coords.accuracy}m)`, 'success');
      } catch (err) {
        showToast(err.message || 'Unable to retrieve location.', 'error');
      } finally {
        btnGetCurrentGps.disabled = false;
        btnGetCurrentGps.innerHTML = '<span>📍 Get My Location</span>';
      }
    });
  }

  if (btnUseDetectedGps) {
    btnUseDetectedGps.addEventListener('click', () => {
      store.setState({ editingLocation: null });
      openLocationModal(null);
    });
  }

  if (addLocBtn) {
    addLocBtn.addEventListener('click', () => {
      store.setState({ editingLocation: null });
      openLocationModal(null);
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', () => closeModal('modal-location-form'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal('modal-location-form'));

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal('modal-location-form');
    });
  }

  // Inside Modal: Use My Current Location button
  const btnUseGpsCoords = $('#btn-use-gps-coords');
  const gpsAccuracyDisplay = $('#gps-coords-accuracy');
  if (btnUseGpsCoords) {
    btnUseGpsCoords.addEventListener('click', async () => {
      const alertEl = $('#loc-validation-alert');
      try {
        btnUseGpsCoords.disabled = true;
        btnUseGpsCoords.innerHTML = '<span>⏳ Retrieving location...</span>';
        const coords = await captureCurrentGpsCoordinates();
        lastDetectedGps = coords;
        const inputLat = $('#input-loc-lat');
        const inputLng = $('#input-loc-lng');
        if (inputLat) inputLat.value = coords.latitude;
        if (inputLng) inputLng.value = coords.longitude;
        if (gpsAccuracyDisplay) {
          gpsAccuracyDisplay.textContent = `Captured accuracy: ±${coords.accuracy}m`;
          gpsAccuracyDisplay.style.display = 'block';
        }
        if (alertEl) {
          alertEl.style.display = 'none';
          alertEl.innerHTML = '';
        }
        showToast(`Captured coordinates (±${coords.accuracy}m)`, 'success');
      } catch (err) {
        if (alertEl) {
          alertEl.textContent = err.message || 'Location error occurred.';
          alertEl.style.display = 'block';
        }
        showToast(err.message || 'Location error occurred.', 'error');
      } finally {
        btnUseGpsCoords.disabled = false;
        btnUseGpsCoords.innerHTML = '<span>📍 Use My Current Location</span>';
      }
    });
  }

  // Location Type dropdown change: Apply defaults (Section 6)
  const selectType = $('#select-loc-type');
  if (selectType) {
    selectType.addEventListener('change', () => {
      const type = selectType.value;
      const inputTarget = $('#input-loc-target');
      const selectPriority = $('#select-loc-priority');
      const inputRadius = $('#input-loc-radius');
      const presetRadius = $('#select-loc-radius-preset');
      const selectGrace = $('#select-loc-grace');

      if (type === 'office') {
        if (inputTarget) inputTarget.value = '6';
        if (selectPriority) selectPriority.value = 'Highest';
        if (inputRadius) inputRadius.value = '100';
        if (presetRadius) presetRadius.value = '100';
        if (selectGrace) selectGrace.value = '10';
      } else {
        if (inputTarget) inputTarget.value = '0';
        if (selectPriority) selectPriority.value = 'Normal';
        if (inputRadius) inputRadius.value = '100';
        if (presetRadius) presetRadius.value = '100';
        if (selectGrace) selectGrace.value = '10';
      }
    });
  }

  // Radius preset vs custom input synchronization
  const presetRadius = $('#select-loc-radius-preset');
  const inputRadius = $('#input-loc-radius');
  if (presetRadius && inputRadius) {
    presetRadius.addEventListener('change', () => {
      if (presetRadius.value !== 'custom') {
        inputRadius.value = presetRadius.value;
      }
    });
    inputRadius.addEventListener('input', () => {
      const val = inputRadius.value.trim();
      const match = ['50', '100', '150', '200', '300', '500'].includes(val);
      presetRadius.value = match ? val : 'custom';
    });
  }

  // Form Submission & Validation (Section 19 & 20)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const locName = ($('#input-loc-name')?.value || '').trim();
      const locType = $('#select-loc-type')?.value || 'office';
      const lat = parseFloat($('#input-loc-lat')?.value);
      const lng = parseFloat($('#input-loc-lng')?.value);
      const radius = parseInt($('#input-loc-radius')?.value, 10);
      const targetHours = parseFloat($('#input-loc-target')?.value) || 0;
      const priority = $('#select-loc-priority')?.value || 'Normal';
      const gracePeriod = parseInt($('#select-loc-grace')?.value, 10) || 0;
      const active = $('#checkbox-loc-active')?.checked !== false;

      const currentState = store.getState();
      const editingId = currentState.editingLocation ? currentState.editingLocation.id : null;

      // Validate inputs
      const errors = validateLocationInput(locName, lat, lng, radius, targetHours, gracePeriod, currentState.locations, editingId);
      const alertEl = $('#loc-validation-alert');

      if (errors.length > 0) {
        if (alertEl) {
          alertEl.innerHTML = errors.map(err => `• ${escapeHTML(err)}`).join('<br>');
          alertEl.style.display = 'block';
        }
        showToast(errors[0], 'error');
        return;
      }

      if (alertEl) {
        alertEl.style.display = 'none';
        alertEl.innerHTML = '';
      }

      let updatedLocations = [...currentState.locations];

      if (currentState.editingLocation) {
        // Edit existing
        updatedLocations = updatedLocations.map((loc) => {
          if (loc.id === currentState.editingLocation.id) {
            return {
              ...loc,
              name: locName,
              type: locType,
              latitude: lat,
              longitude: lng,
              lat,
              lng,
              radiusMeters: radius,
              radius,
              targetHours,
              priority,
              gracePeriodMinutes: gracePeriod,
              gracePeriod,
              active
            };
          }
          return loc;
        });
        showToast(`Updated location "${locName}"`, 'success');
      } else {
        // Add new location
        const newLoc = {
          id: 'loc-' + Date.now(),
          name: locName,
          type: locType,
          latitude: lat,
          longitude: lng,
          lat,
          lng,
          radiusMeters: radius,
          radius,
          targetHours,
          priority,
          gracePeriodMinutes: gracePeriod,
          gracePeriod,
          active,
          isDemo: false
        };
        updatedLocations.push(newLoc);
        showToast(`Added location "${locName}"`, 'success');
      }

      store.setState({ locations: updatedLocations, editingLocation: null });
      saveData('workly_locations', updatedLocations);
      closeModal('modal-location-form');
    });
  }

  // Delete Confirmation Handlers (Section 15)
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => closeModal('modal-confirm-delete-loc'));
  if (confirmDeleteModal) {
    confirmDeleteModal.addEventListener('click', (e) => {
      if (e.target === confirmDeleteModal) closeModal('modal-confirm-delete-loc');
    });
  }

  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', () => {
      const { deletingLocationId, locations } = store.getState();
      if (deletingLocationId) {
        const targetLoc = locations.find(l => l.id === deletingLocationId);
        const locName = targetLoc ? targetLoc.name : 'Location';
        const updatedLocations = locations.filter(l => l.id !== deletingLocationId);
        store.setState({ locations: updatedLocations, deletingLocationId: null });
        saveData('workly_locations', updatedLocations);
        closeModal('modal-confirm-delete-loc');
        showToast(`Deleted "${locName}"`, 'warning');
      }
    });
  }
}

function openLocationModal(locationObj) {
  const title = $('#title-loc-modal');
  const inputName = $('#input-loc-name');
  const selectType = $('#select-loc-type');
  const inputLat = $('#input-loc-lat');
  const inputLng = $('#input-loc-lng');
  const presetRadius = $('#select-loc-radius-preset');
  const inputRadius = $('#input-loc-radius');
  const inputTarget = $('#input-loc-target');
  const selectPriority = $('#select-loc-priority');
  const selectGrace = $('#select-loc-grace');
  const checkActive = $('#checkbox-loc-active');
  const alertEl = $('#loc-validation-alert');
  const accDisplay = $('#gps-coords-accuracy');

  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }
  if (accDisplay) {
    accDisplay.style.display = 'none';
    accDisplay.textContent = '';
  }

  if (locationObj) {
    if (title) title.textContent = 'Edit Location';
    if (inputName) inputName.value = locationObj.name || '';
    if (selectType) selectType.value = locationObj.type || 'office';
    const lat = locationObj.latitude ?? locationObj.lat ?? 0;
    const lng = locationObj.longitude ?? locationObj.lng ?? 0;
    if (inputLat) inputLat.value = lat;
    if (inputLng) inputLng.value = lng;

    const rad = locationObj.radiusMeters ?? locationObj.radius ?? 100;
    if (inputRadius) inputRadius.value = rad;
    if (presetRadius) {
      const match = ['50', '100', '150', '200', '300', '500'].includes(String(rad));
      presetRadius.value = match ? String(rad) : 'custom';
    }

    if (inputTarget) inputTarget.value = locationObj.targetHours ?? 0;
    if (selectPriority) selectPriority.value = locationObj.priority || 'Normal';
    const grace = locationObj.gracePeriodMinutes ?? locationObj.gracePeriod ?? 10;
    if (selectGrace) selectGrace.value = String(grace);
    if (checkActive) checkActive.checked = locationObj.active !== false;
  } else {
    if (title) title.textContent = 'Add Location';
    if (inputName) inputName.value = '';
    if (selectType) selectType.value = 'office';

    if (lastDetectedGps) {
      if (inputLat) inputLat.value = lastDetectedGps.latitude;
      if (inputLng) inputLng.value = lastDetectedGps.longitude;
      if (accDisplay) {
        accDisplay.textContent = `Using detected coordinates (±${lastDetectedGps.accuracy}m)`;
        accDisplay.style.display = 'block';
      }
    } else {
      if (inputLat) inputLat.value = '';
      if (inputLng) inputLng.value = '';
    }

    if (inputRadius) inputRadius.value = '100';
    if (presetRadius) presetRadius.value = '100';
    if (inputTarget) inputTarget.value = '6';
    if (selectPriority) selectPriority.value = 'Highest';
    if (selectGrace) selectGrace.value = '10';
    if (checkActive) checkActive.checked = true;
  }

  openModal('modal-location-form');
}

/**
 * Setup Settings Screen Actions: Inputs, Demo Data, Demo Session, Export, Reset
 */
function setupSettingsActions() {
  // Helper to validate and save current UI state of Work Settings
  function handleSaveWorkSettings(silent = false) {
    const targetHoursInput = $('#set-target-hours');
    const autoRadio = $('#set-mode-auto');
    const manualRadio = $('#set-mode-manual');
    const autoPercentInput = $('#set-auto-percent');
    const manualDaysInput = $('#set-manual-days');
    const dayCheckboxes = $$('.set-working-day');
    const alertEl = $('#settings-validation-alert');

    const targetHours = parseFloat(targetHoursInput?.value);
    const mode = manualRadio?.checked ? 'manual' : 'percentage';
    const autoPercent = parseInt(autoPercentInput?.value, 10);
    const manualDays = parseInt(manualDaysInput?.value, 10);
    const activeDays = Array.from(dayCheckboxes).filter(c => c.checked).map(c => c.value);

    const errors = validateWorkSettings(targetHours, mode, autoPercent, manualDays, activeDays);

    if (errors.length > 0) {
      if (alertEl) {
        alertEl.innerHTML = errors.map(err => `• ${escapeHTML(err)}`).join('<br>');
        alertEl.style.display = 'block';
      }
      if (!silent) {
        showToast(errors[0], 'error');
      }
      return false;
    }

    if (alertEl) {
      alertEl.style.display = 'none';
      alertEl.innerHTML = '';
    }

    const currentSettings = store.getState().settings;
    const newSettings = {
      ...currentSettings,
      targetHoursPerWfoDay: targetHours,
      targetHours: targetHours,
      wfoRequirementMode: mode,
      wfoMode: mode,
      wfoPercentage: autoPercent,
      autoPercentage: autoPercent,
      manualWfoDays: manualDays,
      manualDays: manualDays,
      workingDays: activeDays
    };

    updateSettings(newSettings);
    if (!silent) {
      showToast('Work settings saved successfully', 'success');
    }
    updateLiveTimerUI();
    renderStatsScreen(store.getState().stats, store.getState().dailyRecords, newSettings);
    renderSettingsScreen(newSettings, store.getState().theme, store.getState().storageStatus, store.getState().dailyRecords);
    return true;
  }

  // Live preview refresh without triggering validation alerts
  function refreshCalculatedPreview() {
    const autoRadio = $('#set-mode-auto');
    const calculatedPreview = $('#set-calculated-preview');
    const autoPercentInput = $('#set-auto-percent');
    const dayCheckboxes = $$('.set-working-day');

    if (!calculatedPreview) return;
    const isAuto = autoRadio ? autoRadio.checked : true;
    if (!isAuto) {
      calculatedPreview.style.display = 'none';
      return;
    }

    const autoPercent = parseInt(autoPercentInput?.value, 10) || 60;
    const activeDays = Array.from(dayCheckboxes).filter(c => c.checked).map(c => c.value);
    const calState = store.getState().calendar;
    const tempSettings = {
      ...store.getState().settings,
      wfoRequirementMode: 'percentage',
      wfoPercentage: autoPercent,
      autoPercentage: autoPercent,
      workingDays: activeDays
    };
    const req = calculateMonthlyWfoRequirement(calState.year, calState.month, tempSettings, store.getState().dailyRecords);
    calculatedPreview.textContent = `Current calculated requirement: ${req.requiredDays} days`;
    calculatedPreview.style.display = 'block';
  }

  // Mode radio toggles
  const modeAutoRadio = $('#set-mode-auto');
  const modeManualRadio = $('#set-mode-manual');
  const rowAuto = $('#row-auto-percent');
  const rowManual = $('#row-manual-days');
  const explanationEl = $('#set-mode-explanation');

  function updateModeUI(mode) {
    const isAuto = mode === 'percentage';
    if (rowAuto) rowAuto.style.display = isAuto ? 'flex' : 'none';
    if (rowManual) rowManual.style.display = isAuto ? 'none' : 'flex';
    if (explanationEl) {
      explanationEl.textContent = isAuto
        ? 'Required WFO days are calculated from eligible working days.'
        : 'You choose the required number of WFO days.';
    }
    refreshCalculatedPreview();
  }

  if (modeAutoRadio) {
    modeAutoRadio.addEventListener('change', () => {
      if (modeAutoRadio.checked) {
        updateModeUI('percentage');
        handleSaveWorkSettings(true);
      }
    });
  }

  if (modeManualRadio) {
    modeManualRadio.addEventListener('change', () => {
      if (modeManualRadio.checked) {
        updateModeUI('manual');
        handleSaveWorkSettings(true);
      }
    });
  }

  // Input changes
  const targetHoursInput = $('#set-target-hours');
  if (targetHoursInput) {
    targetHoursInput.addEventListener('input', () => {
      handleSaveWorkSettings(true);
    });
  }

  const autoPercentInput = $('#set-auto-percent');
  if (autoPercentInput) {
    autoPercentInput.addEventListener('input', () => {
      refreshCalculatedPreview();
      handleSaveWorkSettings(true);
    });
  }

  const manualDaysInput = $('#set-manual-days');
  if (manualDaysInput) {
    manualDaysInput.addEventListener('input', () => {
      handleSaveWorkSettings(true);
    });
  }

  const dayCheckboxes = $$('.set-working-day');
  dayCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      refreshCalculatedPreview();
      handleSaveWorkSettings(true);
    });
  });

  // Save button
  const btnSave = $('#btn-save-settings');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      handleSaveWorkSettings(false);
    });
  }

  const autoTrackToggle = $('#set-auto-track');
  if (autoTrackToggle) {
    autoTrackToggle.addEventListener('change', (e) => {
      const isEnabled = e.target.checked;
      updateSettings({ autoTracking: isEnabled });
      if (isEnabled) {
        startAutomaticTracking(true);
        showToast('Automatic tracking enabled', 'success');
      } else {
        stopAutomaticTracking();
        showToast('Automatic tracking disabled', 'info');
      }
    });
  }

  const manualTrackToggle = $('#set-manual-track');
  if (manualTrackToggle) {
    manualTrackToggle.addEventListener('change', (e) => {
      updateSettings({ manualTracking: e.target.checked });
      showToast(`Manual tracking ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
    });
  }

  const graceSelect = $('#set-grace-period');
  if (graceSelect) {
    graceSelect.addEventListener('change', (e) => {
      updateSettings({ gracePeriod: parseInt(e.target.value, 10) || 10 });
      showToast('Grace period updated', 'info');
    });
  }

  // Notification Settings & Permission Actions (Section 1 & 2)
  const btnEnableNotify = $('#btn-enable-notifications');
  if (btnEnableNotify) {
    btnEnableNotify.addEventListener('click', async () => {
      await requestNotificationPermission();
    });
  }

  const masterNotifyToggle = $('#set-notify-master');
  const subsettingsContainer = $('#container-notify-subsettings');
  if (masterNotifyToggle) {
    masterNotifyToggle.addEventListener('change', (e) => {
      const isMasterOn = e.target.checked;
      updateSettings({ notifyMaster: isMasterOn });
      if (subsettingsContainer) {
        subsettingsContainer.style.display = isMasterOn ? 'block' : 'none';
      }
      showToast(`Master notifications ${isMasterOn ? 'enabled' : 'disabled'}`, 'info');
    });
  }

  const bindToggle = (id, key, name) => {
    const toggle = $(`#${id}`);
    if (toggle) {
      toggle.addEventListener('change', (e) => {
        updateSettings({ [key]: e.target.checked });
        showToast(`${name} ${e.target.checked ? 'enabled' : 'disabled'}`, 'info');
      });
    }
  };

  bindToggle('set-notify-entry', 'notifyEntry', 'Office entry alert');
  bindToggle('set-notify-exit', 'notifyExit', 'Office exit alert');
  bindToggle('set-notify-target', 'notifyTarget', 'Target achieved alert');
  bindToggle('set-notify-reminder', 'notifyReminder', 'Target reminder');
  bindToggle('set-notify-monthly', 'notifyWfoProgress', 'WFO progress reminder');

  const reminderThresholdSelect = $('#set-reminder-threshold');
  if (reminderThresholdSelect) {
    reminderThresholdSelect.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10) || 60;
      updateSettings({ reminderThreshold: val });
      showToast(`Reminder threshold set to ${val} mins`, 'info');
    });
  }

  const wfoFreqSelect = $('#set-wfo-reminder-freq');
  if (wfoFreqSelect) {
    wfoFreqSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      updateSettings({ wfoReminderFreq: val, notifyWfoProgress: val !== 'off' });
      showToast(`WFO progress reminder frequency: ${val}`, 'info');
    });
  }

  const themeSelect = $('#set-theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const newTheme = e.target.value;
      store.setState({ theme: newTheme });
      updateSettings({ theme: newTheme });
      applyTheme(newTheme);
      showToast(`Theme set to ${newTheme}`, 'info');
    });
  }

  // --- REAL DATA & BACKUP CONTROLS (PHASE 7) ---
  const exportBackupBtn = $('#btn-export-backup');
  const importBackupBtn = $('#btn-import-backup');
  const importInput = $('#input-import-backup');
  const exportCsvBtn = $('#btn-export-csv');
  const resetAllDataBtn = $('#btn-reset-all-data');

  if (exportBackupBtn) {
    exportBackupBtn.addEventListener('click', () => {
      exportBackupFile();
    });
  }

  if (importBackupBtn && importInput) {
    importBackupBtn.addEventListener('click', () => {
      importInput.click();
    });

    importInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        handleImportBackupFile(file);
      }
      importInput.value = '';
    });
  }

  // Modal: Import Backup Preview Listeners
  const cancelImportBtn = $('#btn-cancel-import-preview');
  const closeImportBtn = $('#btn-close-import-preview');
  const confirmRestoreBtn = $('#btn-confirm-import-restore');
  const modalImportPreview = $('#modal-import-preview');

  if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', () => {
      pendingImportBackup = null;
      closeModal('modal-import-preview');
    });
  }
  if (closeImportBtn) {
    closeImportBtn.addEventListener('click', () => {
      pendingImportBackup = null;
      closeModal('modal-import-preview');
    });
  }
  if (modalImportPreview) {
    modalImportPreview.addEventListener('click', (e) => {
      if (e.target === modalImportPreview) {
        pendingImportBackup = null;
        closeModal('modal-import-preview');
      }
    });
  }
  if (confirmRestoreBtn) {
    confirmRestoreBtn.addEventListener('click', async () => {
      await confirmRestoreBackup();
    });
  }

  // Modal: Export CSV Range Listeners
  const cancelExportCsvBtn = $('#btn-cancel-export-csv');
  const closeExportCsvBtn = $('#btn-close-export-csv');
  const confirmDownloadCsvBtn = $('#btn-confirm-download-csv');
  const modalExportCsv = $('#modal-export-csv');

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', () => {
      openModal('modal-export-csv');
    });
  }
  if (cancelExportCsvBtn) {
    cancelExportCsvBtn.addEventListener('click', () => closeModal('modal-export-csv'));
  }
  if (closeExportCsvBtn) {
    closeExportCsvBtn.addEventListener('click', () => closeModal('modal-export-csv'));
  }
  if (modalExportCsv) {
    modalExportCsv.addEventListener('click', (e) => {
      if (e.target === modalExportCsv) closeModal('modal-export-csv');
    });
  }
  if (confirmDownloadCsvBtn) {
    confirmDownloadCsvBtn.addEventListener('click', () => {
      const rangeSelect = $('#select-csv-range');
      const range = rangeSelect ? rangeSelect.value : 'current-month';
      exportAttendanceCSV(range);
      closeModal('modal-export-csv');
    });
  }

  // Modal: Confirm Reset All Data Listeners
  const cancelResetBtn = $('#btn-cancel-reset');
  const resetExportFirstBtn = $('#btn-reset-export-first');
  const confirmResetBtn = $('#btn-confirm-reset');
  const modalReset = $('#modal-confirm-reset');

  if (resetAllDataBtn) {
    resetAllDataBtn.addEventListener('click', () => {
      openModal('modal-confirm-reset');
    });
  }
  if (resetExportFirstBtn) {
    resetExportFirstBtn.addEventListener('click', () => {
      exportBackupFile();
    });
  }
  if (cancelResetBtn) {
    cancelResetBtn.addEventListener('click', () => closeModal('modal-confirm-reset'));
  }
  if (modalReset) {
    modalReset.addEventListener('click', (e) => {
      if (e.target === modalReset) closeModal('modal-confirm-reset');
    });
  }
  if (confirmResetBtn) {
    confirmResetBtn.addEventListener('click', async () => {
      const confirmed = window.confirm(
        'ARE YOU ABSOLUTELY SURE?\n\nThis will permanently delete all attendance, locations, and settings stored on this device. This action CANNOT be undone.'
      );
      if (confirmed) {
        await resetAllWorklyData();
      }
    });
  }
}

/* ==========================================================================
   5F. DATA BACKUP, RESTORE, CSV EXPORT & SUMMARY ENGINE
   ========================================================================== */

let pendingImportBackup = null;

/**
 * Generate full backup data object
 */
function generateBackupData() {
  const state = store.getState();
  const cleanDailyRecords = {};
  for (const [k, v] of Object.entries(state.dailyRecords || {})) {
    if (v && !v.isDemo && !(v.notes && v.notes.includes('DEMO'))) {
      cleanDailyRecords[k] = v;
    }
  }
  const cleanLocations = (state.locations || []).filter(l => !l.isDemo);

  return {
    app: 'Workly',
    version: '1.0.0',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      settings: state.settings || { ...DEFAULT_SETTINGS },
      locations: cleanLocations,
      dailyRecords: cleanDailyRecords,
      notifications: dailyNotificationState || {},
      activeSession: state.activeSession && !state.activeSession.isDemo ? state.activeSession : null
    }
  };
}

/**
 * Export backup to a JSON file named Workly_Backup_YYYY-MM-DD_HH-mm.json
 */
function exportBackupFile() {
  const backup = generateBackupData();
  const jsonStr = JSON.stringify(backup, null, 2);
  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const filename = `Workly_Backup_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}.json`;

  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  showToast(`Backup exported: ${filename}`, 'success');
}

/**
 * Validates a parsed backup object
 */
function validateBackupData(backup) {
  if (!backup || typeof backup !== 'object') return false;
  if (backup.app !== 'Workly') return false;
  if (typeof backup.schemaVersion !== 'number' || backup.schemaVersion !== 1) return false;
  if (!backup.data || typeof backup.data !== 'object') return false;

  const { settings, locations, dailyRecords } = backup.data;
  if (settings && typeof settings !== 'object') return false;

  if (locations) {
    if (!Array.isArray(locations)) return false;
    for (const loc of locations) {
      if (!loc || typeof loc !== 'object') return false;
      const lat = loc.latitude ?? loc.lat;
      const lng = loc.longitude ?? loc.lng;
      if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) return false;
      if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) return false;
    }
  }

  if (dailyRecords) {
    if (typeof dailyRecords !== 'object' || Array.isArray(dailyRecords)) return false;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    for (const [key, rec] of Object.entries(dailyRecords)) {
      if (!dateRegex.test(key)) return false;
      if (rec && typeof rec !== 'object') return false;
      if (rec && rec.firstInTimestamp && typeof rec.firstInTimestamp !== 'number') return false;
      if (rec && rec.lastOutTimestamp && typeof rec.lastOutTimestamp !== 'number') return false;
    }
  }

  return true;
}

/**
 * Handle user file selection for backup import
 */
function handleImportBackupFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (!validateBackupData(backup)) {
        showToast('This file is not a valid Workly backup.', 'error');
        return;
      }
      pendingImportBackup = backup;
      showImportPreviewModal(backup);
    } catch (err) {
      showToast('This file is not a valid Workly backup.', 'error');
    }
  };
  reader.onerror = () => {
    showToast('Failed to read selected file.', 'error');
  };
  reader.readAsText(file);
}

/**
 * Show import preview modal with metadata summary
 */
function showImportPreviewModal(backup) {
  const dateEl = $('#import-preview-date');
  const attEl = $('#import-preview-attendance');
  const locEl = $('#import-preview-locations');
  const calEl = $('#import-preview-calendar');
  const setEl = $('#import-preview-settings');

  if (dateEl) {
    if (backup.exportedAt) {
      const d = new Date(backup.exportedAt);
      dateEl.textContent = d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } else {
      dateEl.textContent = 'Unknown';
    }
  }

  const dailyRecords = backup.data.dailyRecords || {};
  const locations = backup.data.locations || [];
  const settings = backup.data.settings || null;

  const attendanceCount = Object.keys(dailyRecords).length;
  const locationCount = locations.length;
  const calendarCount = Object.values(dailyRecords).filter(
    r => r && (r.notes || r.status === 'holiday' || r.status?.startsWith('leave') || r.firstIn)
  ).length;

  if (attEl) attEl.textContent = String(attendanceCount);
  if (locEl) locEl.textContent = String(locationCount);
  if (calEl) calEl.textContent = String(calendarCount);
  if (setEl) setEl.textContent = settings ? 'Available' : 'Default';

  openModal('modal-import-preview');
}

/**
 * Confirm and execute restoration of backup data
 */
async function confirmRestoreBackup() {
  if (!pendingImportBackup) return;
  const backup = pendingImportBackup;
  try {
    const settings = backup.data.settings ? { ...DEFAULT_SETTINGS, ...backup.data.settings } : { ...DEFAULT_SETTINGS };
    const locations = Array.isArray(backup.data.locations) ? backup.data.locations.filter(l => !l.isDemo) : [];
    const dailyRecords = (backup.data.dailyRecords && typeof backup.data.dailyRecords === 'object') ? backup.data.dailyRecords : {};
    const activeSession = backup.data.activeSession && backup.data.activeSession.status === 'in' ? backup.data.activeSession : null;
    const notifications = backup.data.notifications || null;

    await saveData('workly_settings', settings);
    await saveData('workly_locations', locations);
    await saveData('workly_daily_records', dailyRecords);
    await saveData('workly_active_session', activeSession);
    if (notifications) {
      await saveData('workly_notification_state', notifications);
      dailyNotificationState = { ...notifications };
    }

    stopLiveTimer();
    store.setState({
      settings,
      locations,
      dailyRecords,
      activeSession,
      home: { ...DEFAULT_HOME_STATE }
    });

    if (activeSession && activeSession.status === 'in') {
      startLiveTimer();
    }

    closeModal('modal-import-preview');
    pendingImportBackup = null;
    updateDataSummaryUI();
    showToast('Backup restored successfully!', 'success');
  } catch (err) {
    showToast('Failed to restore backup: ' + err.message, 'error');
  }
}

/**
 * Export Attendance CSV
 */
function exportAttendanceCSV(range = 'current-month') {
  const state = store.getState();
  const dailyRecords = state.dailyRecords || {};
  const settings = state.settings || {};
  const targetDailyHours = settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6;

  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth();

  const entries = Object.entries(dailyRecords).filter(([dateKey, rec]) => {
    if (!rec || rec.isDemo || (rec.notes && rec.notes.includes('DEMO'))) return false;
    if (range === 'all') return true;

    const parts = dateKey.split('-').map(Number);
    if (parts.length < 3) return false;
    const recY = parts[0];
    const recM = parts[1] - 1;

    if (range === 'current-month') {
      return recY === curY && recM === curM;
    } else if (range === 'previous-month') {
      const prevM = curM === 0 ? 11 : curM - 1;
      const prevY = curM === 0 ? curY - 1 : curY;
      return recY === prevY && recM === prevM;
    }
    return true;
  });

  // Sort chronologically
  entries.sort(([a], [b]) => a.localeCompare(b));

  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '';
    const text = String(str);
    if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const headers = [
    'Date',
    'First IN',
    'Last OUT',
    'Total Office Time',
    'WFO Counted',
    'Target Hours',
    'Target Achieved',
    'Short Hours',
    'Extra Hours',
    'Status',
    'Location',
    'Notes'
  ];

  const rows = [headers.join(',')];

  for (const [dateKey, rec] of entries) {
    const firstIn = rec.firstIn || '--';
    const lastOut = rec.lastOut || '--';
    const totalSec = rec.totalSeconds || 0;
    const totalOfficeTime = formatDuration(totalSec);

    const isWfo = (rec.status === 'wfo' || rec.status === 'in' || rec.status === 'out' || totalSec > 0);
    const wfoCounted = isWfo ? 'Yes' : 'No';

    const targetSec = targetDailyHours * 3600;
    const targetAchieved = totalSec >= targetSec ? 'Yes' : 'No';
    const shortSec = Math.max(0, targetSec - totalSec);
    const extraSec = Math.max(0, totalSec - targetSec);
    const shortHours = shortSec > 0 ? formatDuration(shortSec) : '00:00:00';
    const extraHours = extraSec > 0 ? formatDuration(extraSec) : '00:00:00';

    let statusText = 'Normal';
    if (rec.status === 'wfo') statusText = 'WFO';
    else if (rec.status === 'holiday') statusText = 'Holiday';
    else if (rec.status === 'leave-full') statusText = 'Full-day Leave';
    else if (rec.status === 'leave-half') statusText = 'Half-day Leave';
    else if (rec.status) statusText = rec.status;

    const locationName = rec.locationName || '--';
    const notes = rec.notes || (rec.holidayName ? `Holiday: ${rec.holidayName}` : (rec.leaveReason ? `Leave: ${rec.leaveReason}` : ''));

    rows.push([
      escapeCsv(dateKey),
      escapeCsv(firstIn),
      escapeCsv(lastOut),
      escapeCsv(totalOfficeTime),
      escapeCsv(wfoCounted),
      escapeCsv(`${targetDailyHours}h`),
      escapeCsv(targetAchieved),
      escapeCsv(shortHours),
      escapeCsv(extraHours),
      escapeCsv(statusText),
      escapeCsv(locationName),
      escapeCsv(notes)
    ].join(','));
  }

  const csvContent = rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${curY}-${pad(curM + 1)}-${pad(now.getDate())}`;
  const filename = `Workly_Attendance_${range}_${dateStr}.csv`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);

  showToast(`Exported CSV (${entries.length} records): ${filename}`, 'success');
}

/**
 * Updates Data Summary card in Settings
 */
function updateDataSummaryUI() {
  const state = store.getState();
  const dailyRecords = state.dailyRecords || {};
  const locations = state.locations || [];

  const attEl = $('#backup-stat-attendance');
  const locEl = $('#backup-stat-locations');
  const calEl = $('#backup-stat-calendar');
  const earliestEl = $('#backup-stat-earliest');
  const latestEl = $('#backup-stat-latest');
  const sizeEl = $('#backup-stat-size');

  const cleanEntries = Object.entries(dailyRecords).filter(
    ([k, v]) => v && !v.isDemo && !(v.notes && v.notes.includes('DEMO'))
  );
  const attendanceCount = cleanEntries.filter(
    ([k, v]) => (v.totalSeconds && v.totalSeconds > 0) || v.status === 'wfo' || v.firstIn
  ).length;
  const locCount = locations.filter(l => !l.isDemo).length;
  const calendarCount = cleanEntries.length;

  if (attEl) attEl.textContent = String(attendanceCount);
  if (locEl) locEl.textContent = String(locCount);
  if (calEl) calEl.textContent = String(calendarCount);

  if (cleanEntries.length > 0) {
    cleanEntries.sort(([a], [b]) => a.localeCompare(b));
    const earliestKey = cleanEntries[0][0];
    const latestKey = cleanEntries[cleanEntries.length - 1][0];

    const formatKey = (k) => {
      const parts = k.split('-').map(Number);
      if (parts.length < 3) return k;
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    };

    if (earliestEl) earliestEl.textContent = formatKey(earliestKey);
    if (latestEl) latestEl.textContent = formatKey(latestKey);
  } else {
    if (earliestEl) earliestEl.textContent = 'No attendance records yet';
    if (latestEl) latestEl.textContent = 'No attendance records yet';
  }

  if (sizeEl) {
    try {
      const dump = JSON.stringify({
        settings: state.settings,
        locations: state.locations,
        dailyRecords: state.dailyRecords,
        activeSession: state.activeSession
      });
      const bytes = new Blob([dump]).size;
      const kb = (bytes / 1024).toFixed(1);
      sizeEl.textContent = `~${kb} KB`;
    } catch (e) {
      sizeEl.textContent = '~0 KB';
    }
  }
}

/**
 * Resets all Workly user data to clean initial state
 */
async function resetAllWorklyData() {
  try {
    await clearAllData();
    stopLiveTimer();
    store.setState({
      activeSession: null,
      home: { ...DEFAULT_HOME_STATE },
      dailyRecords: {},
      locations: [],
      settings: { ...DEFAULT_SETTINGS }
    });
    closeModal('modal-confirm-reset');
    updateDataSummaryUI();
    showToast('All Workly data has been permanently reset.', 'warning');
  } catch (err) {
    showToast('Failed to reset data: ' + err.message, 'error');
  }
}

window.WorklyBackup = {
  generateBackupData,
  exportBackupFile,
  validateBackupData,
  handleImportBackupFile,
  confirmRestoreBackup,
  exportAttendanceCSV,
  updateDataSummaryUI,
  resetAllWorklyData
};


function updateSettings(partialSettings) {
  const currentSettings = store.getState().settings;
  const newSettings = { ...currentSettings, ...partialSettings };
  store.setState({ settings: newSettings });
  saveData('workly_settings', newSettings);
}

/**
 * Service Worker Setup (only in HTTP/HTTPS contexts)
 */
function setupServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then((reg) => console.log('[Workly] SW registered:', reg.scope))
        .catch((err) => console.warn('[Workly] SW failed:', err));
    });
  }
}

/**
 * Run initial storage health check
 */
async function runStorageHealthCheck() {
  const result = await testStorage();
  store.setState({ storageStatus: result.message });
}

/* ==========================================================================
   6. UI RENDERER (Driven by State Store)
   ========================================================================== */

function renderUI(state, prevState) {
  // 1. Screen Switching & Active Navigation Item Highlight
  if (state.currentScreen !== prevState.currentScreen) {
    const screens = $$('.view-screen');
    screens.forEach((screen) => {
      if (screen.id === `view-${state.currentScreen}`) {
        screen.classList.add('active');
        screen.removeAttribute('hidden');
      } else {
        screen.classList.remove('active');
        screen.setAttribute('hidden', 'true');
      }
    });

    const navItems = $$('.nav-item');
    navItems.forEach((item) => {
      const isTarget = item.dataset.screen === state.currentScreen;
      item.classList.toggle('active', isTarget);
      item.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    const mainContent = $('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
  }

  // 2. Home Screen UI Render & Live Timer Sync
  renderHomeScreen();

  // 3. Calendar Screen UI Render
  renderCalendarScreen(state.calendar, state.dailyRecords, state.settings);

  // 4. Statistics Screen UI Render
  renderStatsScreen(state.stats, state.dailyRecords, state.settings);

  // 5. Locations Screen UI Render
  renderLocationsScreen(state.locations);

  // 6. Settings Screen UI Render
  renderSettingsScreen(state.settings, state.theme, state.storageStatus, state.dailyRecords);
}

/**
 * Render Home Screen
 */
function renderHomeScreen() {
  updateLiveTimerUI();
  const session = store.getState().activeSession;
  const todayKey = getTodayDateKey();
  if (session && session.date === todayKey && session.status === 'in' && !liveTimerInterval) {
    startLiveTimer();
  }
}

/**
 * Render Calendar Screen dynamically driven by real dailyRecords
 */
function renderCalendarScreen(calendarState, dailyRecords = {}, settings = {}) {
  const monthTitle = $('#cal-month-title');
  const gridContainer = $('#cal-days-grid');
  const detailDate = $('#cal-detail-date');
  const detailStatus = $('#cal-detail-status');
  const detailTimeIn = $('#cal-detail-time-in');
  const detailTimeOut = $('#cal-detail-time-out');
  const detailTotal = $('#cal-detail-total');
  const detailWfo = $('#cal-detail-wfo');

  const { year, month, selectedDay } = calendarState;
  const targetPerDay = (settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6) * 3600;

  if (monthTitle) {
    monthTitle.textContent = `${MONTH_NAMES[month]} ${year}`;
  }

  if (gridContainer) {
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();

    let cellsHTML = '';

    // Offset cells before first day
    for (let i = 0; i < firstDayOfWeek; i++) {
      cellsHTML += `<div class="calendar-cell status-gray" style="opacity: 0.15;" aria-hidden="true"></div>`;
    }

    // Month days
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dateKey = formatDateKey(year, month, day);
      const record = dailyRecords[dateKey];
      const isSelected = day === selectedDay;

      let statusClass = 'status-gray';
      let indicatorHTML = '';

      if (record) {
        if (record.status === 'holiday') {
          statusClass = 'status-blue';
          indicatorHTML = `<span class="cell-symbol" title="Holiday">H</span>`;
        } else if (record.status === 'leave-full') {
          statusClass = 'status-purple';
          indicatorHTML = `<span class="cell-symbol" title="Full Leave">L</span>`;
        } else if (record.status === 'leave-half') {
          statusClass = 'status-orange';
          indicatorHTML = `<span class="cell-symbol" title="Half Leave">½</span>`;
        } else if (record.status === 'wfo' || record.status === 'in' || record.status === 'out' || (record.firstInTimestamp && record.status !== 'holiday' && !record.status?.startsWith('leave'))) {
          const sec = record.totalSeconds || (record.firstInTimestamp && record.lastOutTimestamp ? Math.floor((record.lastOutTimestamp - record.firstInTimestamp) / 1000) : targetPerDay);
          if (sec >= targetPerDay) {
            statusClass = 'status-green';
            indicatorHTML = `<span class="cell-dot" title="Target Achieved"></span>`;
          } else {
            statusClass = 'status-yellow';
            indicatorHTML = `<span class="cell-dot" title="Target Missed"></span>`;
          }
        }
      }

      cellsHTML += `
        <div class="calendar-cell ${statusClass} ${isSelected ? 'selected' : ''}" data-day="${day}" role="button" aria-label="Day ${day}">
          <span>${day}</span>
          ${indicatorHTML}
        </div>
      `;
    }

    gridContainer.innerHTML = cellsHTML;

    // Attach click listeners to day cells
    const cells = $$('.calendar-cell[data-day]', gridContainer);
    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        const dayNum = parseInt(cell.dataset.day, 10);
        store.setState({ calendar: { ...calendarState, selectedDay: dayNum } });
      });
    });
  }

  // Update Selected Day Detail Panel
  const selDateKey = formatDateKey(year, month, selectedDay);
  const selRecord = dailyRecords[selDateKey] || null;

  if (detailDate) {
    detailDate.textContent = `${selectedDay} ${MONTH_NAMES[month]} ${year}`;
  }

  if (detailStatus) {
    if (!selRecord || selRecord.status === 'normal') {
      detailStatus.textContent = 'Normal';
      detailStatus.className = 'badge badge-neutral';
    } else if (selRecord.status === 'wfo') {
      const sec = selRecord.totalSeconds || targetPerDay;
      const achieved = sec >= targetPerDay;
      detailStatus.textContent = achieved ? 'WFO (Target Achieved)' : 'WFO (Target Missed)';
      detailStatus.className = `badge ${achieved ? 'badge-success' : 'badge-warning'}`;
    } else if (selRecord.status === 'holiday') {
      detailStatus.textContent = selRecord.holidayName ? `Holiday: ${selRecord.holidayName}` : 'Holiday';
      detailStatus.className = 'badge badge-leave';
    } else if (selRecord.status === 'leave-full') {
      detailStatus.textContent = selRecord.leaveReason ? `Leave: ${selRecord.leaveReason}` : 'Full-day Leave';
      detailStatus.className = 'badge badge-purple';
    } else if (selRecord.status === 'leave-half') {
      detailStatus.textContent = selRecord.leaveReason ? `Leave (½): ${selRecord.leaveReason}` : 'Half-day Leave';
      detailStatus.className = 'badge badge-orange';
    }
  }

  // Update Time Tracking Details
  if (detailTimeIn) detailTimeIn.textContent = (selRecord && selRecord.firstIn) ? selRecord.firstIn : '--';
  if (detailTimeOut) detailTimeOut.textContent = (selRecord && selRecord.lastOut) ? selRecord.lastOut : '--';
  if (detailTotal) detailTotal.textContent = (selRecord && selRecord.totalSeconds > 0) ? formatHoursMins(selRecord.totalSeconds) : '--';
  if (detailWfo) {
    if (selRecord && selRecord.status === 'wfo') {
      detailWfo.textContent = '✓ Counted';
      detailWfo.style.color = 'var(--color-success-text)';
    } else {
      detailWfo.textContent = 'Not Counted';
      detailWfo.style.color = 'var(--color-text-secondary)';
    }
  }

  // Update Day Details Form Fields
  const statusSelect = $('#cal-status-select');
  const holidayNameInput = $('#cal-input-holiday-name');
  const leaveReasonInput = $('#cal-input-leave-reason');
  const notesInput = $('#cal-input-notes');

  const activeStatus = selRecord?.status || 'normal';
  if (statusSelect) statusSelect.value = activeStatus;
  if (holidayNameInput) holidayNameInput.value = selRecord?.holidayName || '';
  if (leaveReasonInput) leaveReasonInput.value = selRecord?.leaveReason || '';
  if (notesInput) notesInput.value = selRecord?.notes || '';

  updateCalendarFieldVisibility(activeStatus);
}

/**
 * Render Statistics Screen dynamically calculated from real dailyRecords
 */
function renderStatsScreen(statsState, dailyRecords = {}, settings = {}) {
  const periodWeekBtn = $('#stats-period-week');
  const periodMonthBtn = $('#stats-period-month');
  const periodTitle = $('#stats-period-title');
  const dateRangeEl = $('#stats-date-range');

  const metricWfoDays = $('#stats-metric-wfo-days');
  const metricWfoSubtext = $('#stats-metric-wfo-subtext');
  const metricTotalHours = $('#stats-metric-total-hours');
  const metricAvgHours = $('#stats-metric-avg-hours');
  const metricTargetHours = $('#stats-metric-target-hours');
  const metricExtraHours = $('#stats-metric-extra-hours');
  const metricShortHours = $('#stats-metric-short-hours');

  const chartTitle = $('#stats-chart-title');
  const chartContainer = $('#stats-chart-container');
  const progressPercent = $('#stats-progress-percent');
  const progressTrack = $('#stats-progress-track');
  const progressSubtext = $('#stats-progress-subtext');

  const { period, year, month, day } = statsState;
  const targetDailyHours = settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6;
  const targetDailySec = targetDailyHours * 3600;

  if (periodWeekBtn && periodMonthBtn) {
    periodWeekBtn.classList.toggle('active', period === 'week');
    periodMonthBtn.classList.toggle('active', period === 'month');
  }

  if (period === 'week') {
    // --- WEEK MODE ---
    const refDate = new Date(year, month, day);
    const dayOfWeek = refDate.getDay();
    const mondayOffset = (dayOfWeek + 6) % 7; // Monday = 0, ..., Sunday = 6
    const monday = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - mondayOffset);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);

    const monStr = formatShortDate(monday);
    const sunStr = `${formatShortDate(sunday)} ${sunday.getFullYear()}`;

    if (periodTitle) periodTitle.textContent = `Week: ${monStr} – ${formatShortDate(sunday)}`;
    if (dateRangeEl) dateRangeEl.textContent = `${monStr} – ${sunStr}`;

    let wfoCount = 0;
    let totalOfficeSeconds = 0;
    let extraSeconds = 0;
    let shortSeconds = 0;

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekDayData = [];

    for (let i = 0; i < 7; i++) {
      const curDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const key = formatDateKey(curDate.getFullYear(), curDate.getMonth(), curDate.getDate());
      const rec = dailyRecords[key];

      const isWfoDay = rec && (rec.status === 'wfo' || rec.status === 'in' || rec.status === 'out' || (rec.firstInTimestamp && rec.status !== 'holiday' && !rec.status?.startsWith('leave')));

      let daySec = 0;
      if (isWfoDay) {
        wfoCount += 1;
        daySec = rec.totalSeconds > 0 ? rec.totalSeconds : (rec.firstInTimestamp && rec.lastOutTimestamp ? Math.floor((rec.lastOutTimestamp - rec.firstInTimestamp) / 1000) : targetDailySec);
        totalOfficeSeconds += daySec;

        const diff = daySec - targetDailySec;
        if (diff > 0) extraSeconds += diff;
        if (diff < 0) shortSeconds += Math.abs(diff);
      }

      weekDayData.push({
        label: dayLabels[i],
        seconds: daySec,
        isWfo: isWfoDay
      });
    }

    const avgSeconds = wfoCount > 0 ? Math.round(totalOfficeSeconds / wfoCount) : 0;

    if (metricWfoDays) metricWfoDays.textContent = String(wfoCount);
    if (metricWfoSubtext) metricWfoSubtext.textContent = 'Days logged this week';
    if (metricTotalHours) metricTotalHours.textContent = formatHoursMins(totalOfficeSeconds);
    if (metricAvgHours) metricAvgHours.textContent = formatHoursMins(avgSeconds);
    if (metricTargetHours) metricTargetHours.textContent = `${targetDailyHours}h 00m`;
    if (metricExtraHours) metricExtraHours.textContent = formatHoursMins(extraSeconds);
    if (metricShortHours) metricShortHours.textContent = formatHoursMins(shortSeconds);

    if (chartTitle) chartTitle.textContent = 'Weekly Hours Bar Chart';
    if (chartContainer) {
      chartContainer.innerHTML = weekDayData.map((item) => {
        const heightPct = Math.min(100, Math.round((item.seconds / (10 * 3600)) * 100));
        const color = item.seconds >= targetDailySec
          ? 'var(--color-success)'
          : item.seconds > 0
            ? 'var(--color-warning)'
            : 'var(--color-border)';

        return `
          <div class="chart-bar-column">
            <div class="chart-bar-fill" style="height: ${Math.max(6, heightPct)}%; background-color: ${color};" title="${item.label}: ${formatHoursMins(item.seconds)}"></div>
            <span class="chart-bar-label">${item.label}</span>
          </div>
        `;
      }).join('');
    }

    const weekTargetDays = 5;
    const weekProgressPct = Math.min(100, Math.round((wfoCount / weekTargetDays) * 100));
    if (progressPercent) progressPercent.textContent = `${weekProgressPct}%`;
    if (progressTrack) progressTrack.style.width = `${weekProgressPct}%`;
    if (progressSubtext) progressSubtext.textContent = `${wfoCount} / ${weekTargetDays} days completed towards weekly goal`;

  } else {
    // --- MONTH MODE ---
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const monthName = MONTH_NAMES[month];

    if (periodTitle) periodTitle.textContent = `${monthName} ${year}`;
    if (dateRangeEl) dateRangeEl.textContent = `1 ${monthName.slice(0, 3)} – ${totalDaysInMonth} ${monthName.slice(0, 3)} ${year}`;

    let wfoCount = 0;
    let totalOfficeSeconds = 0;
    let extraSeconds = 0;
    let shortSeconds = 0;

    const weekBuckets = [
      { label: 'W1', seconds: 0 },
      { label: 'W2', seconds: 0 },
      { label: 'W3', seconds: 0 },
      { label: 'W4', seconds: 0 },
      { label: 'W5', seconds: 0 }
    ];

    for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
      const key = formatDateKey(year, month, dayNum);
      const rec = dailyRecords[key];
      const isWfoDay = rec && (rec.status === 'wfo' || rec.status === 'in' || rec.status === 'out' || (rec.firstInTimestamp && rec.status !== 'holiday' && !rec.status?.startsWith('leave')));

      if (isWfoDay) {
        wfoCount += 1;
        const daySec = rec.totalSeconds > 0 ? rec.totalSeconds : (rec.firstInTimestamp && rec.lastOutTimestamp ? Math.floor((rec.lastOutTimestamp - rec.firstInTimestamp) / 1000) : targetDailySec);
        totalOfficeSeconds += daySec;

        const diff = daySec - targetDailySec;
        if (diff > 0) extraSeconds += diff;
        if (diff < 0) shortSeconds += Math.abs(diff);

        const bIdx = Math.min(4, Math.floor((dayNum - 1) / 7));
        weekBuckets[bIdx].seconds += daySec;
      }
    }

    const avgSeconds = wfoCount > 0 ? Math.round(totalOfficeSeconds / wfoCount) : 0;
    const reqResult = calculateMonthlyWfoRequirement(year, month, settings, dailyRecords);
    const targetWfoDays = reqResult.requiredDays;

    if (metricWfoDays) metricWfoDays.textContent = `${wfoCount} / ${targetWfoDays}`;
    if (metricWfoSubtext) metricWfoSubtext.textContent = 'Requirement progress';
    if (metricTotalHours) metricTotalHours.textContent = formatHoursMins(totalOfficeSeconds);
    if (metricAvgHours) metricAvgHours.textContent = formatHoursMins(avgSeconds);
    if (metricTargetHours) metricTargetHours.textContent = `${targetDailyHours}h 00m`;
    if (metricExtraHours) metricExtraHours.textContent = formatHoursMins(extraSeconds);
    if (metricShortHours) metricShortHours.textContent = formatHoursMins(shortSeconds);

    if (chartTitle) chartTitle.textContent = `${monthName} Weekly Breakdown`;
    if (chartContainer) {
      const maxWeekSec = 40 * 3600;
      chartContainer.innerHTML = weekBuckets.map((bucket) => {
        const heightPct = Math.min(100, Math.round((bucket.seconds / maxWeekSec) * 100));
        const color = bucket.seconds > 0 ? 'var(--color-success)' : 'var(--color-border)';
        return `
          <div class="chart-bar-column">
            <div class="chart-bar-fill" style="height: ${Math.max(6, heightPct)}%; background-color: ${color};" title="${bucket.label}: ${formatHoursMins(bucket.seconds)}"></div>
            <span class="chart-bar-label">${bucket.label}</span>
          </div>
        `;
      }).join('');
    }

    const monthProgressPct = targetWfoDays > 0 ? Math.min(100, Math.round((wfoCount / targetWfoDays) * 100)) : 0;
    if (progressPercent) progressPercent.textContent = `${monthProgressPct}%`;
    if (progressTrack) progressTrack.style.width = `${monthProgressPct}%`;
    if (progressSubtext) progressSubtext.textContent = `${wfoCount} / ${targetWfoDays} days completed towards monthly requirement`;
  }
}

/**
 * Render Locations Screen
 */
function renderLocationsScreen(locations) {
  const container = $('#locations-list');
  if (!container) return;

  if (!locations || locations.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align: center; padding: 2rem;">
        <p style="color: var(--color-text-secondary);">No work locations saved yet.</p>
      </div>
    `;
    return;
  }

  // Section 23: Display active locations first, then sort by priority (Highest > High > Normal > Low)
  const sortedLocations = sortLocationsList(locations);

  container.innerHTML = sortedLocations.map((loc) => {
    const icon = loc.type === 'office' ? '🏢' : loc.type === 'home' ? '🏠' : loc.type === 'client' ? '💼' : loc.type === 'gym' ? '🏋️' : '📍';
    const radiusVal = loc.radiusMeters || loc.radius || 100;
    const targetText = loc.targetHours > 0 ? `${loc.targetHours}h / day` : 'No target';
    const graceVal = loc.gracePeriodMinutes ?? loc.gracePeriod ?? 10;
    const priorityVal = loc.priority || 'Normal';
    const isActive = loc.active !== false;

    return `
      <article class="card location-item-card ${!isActive ? 'location-inactive' : ''}" style="${!isActive ? 'opacity: 0.65; border-color: var(--color-border);' : ''}">
        <div class="location-item-main">
          <div class="location-info-group">
            <div class="location-type-icon">
              ${icon}
            </div>
            <div>
              <div class="location-name" style="${!isActive ? 'color: var(--color-text-secondary);' : ''}">${escapeHTML(loc.name)}</div>
              <div class="location-subtext">
                ${radiusVal} m radius
              </div>
              <div class="location-subtext" style="margin-top: 2px;">
                Target: <strong>${targetText}</strong>
              </div>
              <div class="location-subtext" style="margin-top: 2px;">
                Priority: <strong>${priorityVal}</strong> • Grace period: <strong>${graceVal} min</strong>
              </div>
            </div>
          </div>
          <span class="badge ${isActive ? 'badge-success' : 'badge-neutral'}">
            ${isActive ? '● Active' : '● Inactive'}
          </span>
        </div>
        <div class="location-actions-row">
          <button class="btn btn-secondary btn-sm btn-edit-loc" data-id="${loc.id}">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-loc" data-id="${loc.id}">Delete</button>
        </div>
      </article>
    `;
  }).join('');

  const editBtns = $$('.btn-edit-loc', container);
  editBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const locId = btn.dataset.id;
      const targetLoc = locations.find(l => l.id === locId);
      if (targetLoc) {
        store.setState({ editingLocation: targetLoc });
        openLocationModal(targetLoc);
      }
    });
  });

  const deleteBtns = $$('.btn-delete-loc', container);
  deleteBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const locId = btn.dataset.id;
      const targetLoc = locations.find(l => l.id === locId);
      store.setState({ deletingLocationId: locId });
      const descEl = $('#desc-delete-loc-modal');
      if (descEl) {
        descEl.textContent = `Delete "${targetLoc ? targetLoc.name : 'this location'}"? This action cannot be undone.`;
      }
      openModal('modal-confirm-delete-loc');
    });
  });
}

/**
 * Render Settings Screen Controls
 */
function renderSettingsScreen(settings, theme, storageStatus, dailyRecords = {}) {
  const targetSelect = $('#set-target-hours');
  if (targetSelect) targetSelect.value = settings.targetHoursPerWfoDay ?? settings.targetHours ?? 6;

  const modeAuto = $('#set-mode-auto');
  const modeManual = $('#set-mode-manual');
  const mode = settings.wfoRequirementMode || settings.wfoMode || 'percentage';
  const isAuto = mode === 'percentage';

  if (modeAuto && modeManual) {
    modeAuto.checked = isAuto;
    modeManual.checked = !isAuto;
  }

  const autoRow = $('#row-auto-percent');
  const manualRow = $('#row-manual-days');
  if (autoRow) autoRow.style.display = isAuto ? 'flex' : 'none';
  if (manualRow) manualRow.style.display = isAuto ? 'none' : 'flex';

  const explanationEl = $('#set-mode-explanation');
  if (explanationEl) {
    explanationEl.textContent = isAuto
      ? 'Required WFO days are calculated from eligible working days.'
      : 'You choose the required number of WFO days.';
  }

  const calculatedPreview = $('#set-calculated-preview');
  if (calculatedPreview) {
    if (isAuto) {
      const calState = store.getState().calendar;
      const req = calculateMonthlyWfoRequirement(calState.year, calState.month, settings, dailyRecords);
      calculatedPreview.textContent = `Current calculated requirement: ${req.requiredDays} days`;
      calculatedPreview.style.display = 'block';
    } else {
      calculatedPreview.style.display = 'none';
    }
  }

  const autoPercentInput = $('#set-auto-percent');
  if (autoPercentInput) autoPercentInput.value = settings.wfoPercentage ?? settings.autoPercentage ?? 60;

  const manualDaysInput = $('#set-manual-days');
  if (manualDaysInput) manualDaysInput.value = settings.manualWfoDays ?? settings.manualDays ?? 12;

  const dayCheckboxes = $$('.set-working-day');
  const configuredDays = settings.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  dayCheckboxes.forEach((cb) => {
    const val = cb.value;
    const isChecked = configuredDays.some(w => {
      const norm = String(w).trim().toLowerCase();
      return norm === val.toLowerCase() || norm === val.slice(0, 3).toLowerCase();
    });
    cb.checked = isChecked;
  });

  const alertEl = $('#settings-validation-alert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.innerHTML = '';
  }

  const autoTrack = $('#set-auto-track');
  if (autoTrack) autoTrack.checked = !!settings.autoTracking;

  const manualTrack = $('#set-manual-track');
  if (manualTrack) manualTrack.checked = !!settings.manualTracking;

  const graceSelect = $('#set-grace-period');
  if (graceSelect) graceSelect.value = settings.gracePeriod || 10;

  // Notification Settings Rendering (Section 1 & 2)
  updateNotificationPermissionUI();

  const masterNotify = $('#set-notify-master');
  const subsettingsContainer = $('#container-notify-subsettings');
  const isMasterOn = settings.notifyMaster !== false;
  if (masterNotify) masterNotify.checked = isMasterOn;
  if (subsettingsContainer) subsettingsContainer.style.display = isMasterOn ? 'block' : 'none';

  const notifyEntry = $('#set-notify-entry');
  if (notifyEntry) notifyEntry.checked = !!settings.notifyEntry;

  const notifyExit = $('#set-notify-exit');
  if (notifyExit) notifyExit.checked = !!settings.notifyExit;

  const notifyTarget = $('#set-notify-target');
  if (notifyTarget) notifyTarget.checked = !!settings.notifyTarget;

  const notifyReminder = $('#set-notify-reminder');
  if (notifyReminder) notifyReminder.checked = !!settings.notifyReminder;

  const reminderThreshold = $('#set-reminder-threshold');
  if (reminderThreshold) reminderThreshold.value = String(settings.reminderThreshold ?? 60);

  const notifyMonthly = $('#set-notify-monthly');
  if (notifyMonthly) notifyMonthly.checked = settings.notifyWfoProgress !== false && settings.notifyMonthly !== false;

  const wfoReminderFreq = $('#set-wfo-reminder-freq');
  if (wfoReminderFreq) wfoReminderFreq.value = settings.wfoReminderFreq || (settings.notifyWfoProgress !== false ? 'weekly' : 'off');

  const themeSelect = $('#set-theme-select');
  if (themeSelect) themeSelect.value = theme || 'system';

  const statusBox = $('#storage-status-text');
  if (statusBox && storageStatus) statusBox.textContent = storageStatus;

  // Dynamic Data & Backup Summary (Section 20 & 21)
  updateDataSummaryUI();
}
