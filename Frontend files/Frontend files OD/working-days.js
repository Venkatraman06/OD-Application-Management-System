/**
 * College Working-Days Calendar
 * ------------------------------
 * Enabled for the full current year (2026): every Mon–Sat date from
 * today onward is treated as a working day (no fixed holiday list).
 * OD applications can be raised on any date in this range.
 */

function generateWorkingDays() {
  const days = [];
  const currentYear = new Date().getFullYear();
  const start = new Date(currentYear - 10, 0, 1);
  const end = new Date(currentYear + 10, 11, 31);

  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0) { // exclude Sundays only; enable Mon-Sat
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push(`${yyyy}-${mm}-${dd}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getOrdinal(n) {
  const num = parseInt(n, 10) || 0;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = num % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function escHtml(s) {
  if (typeof document !== 'undefined') {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

if (typeof window !== 'undefined') {
  window.getOrdinal = getOrdinal;
  window.escHtml = escHtml;
}

const COLLEGE_WORKING_DAYS = generateWorkingDays();

const CollegeWorkingDays = (() => {
    const workingSet = new Set(COLLEGE_WORKING_DAYS);
    const specialDaysMap = new Map(); // date -> Array of { id, date, dayType, name, department, course, year, section }
    const sorted = [...COLLEGE_WORKING_DAYS].sort();
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    /** true if dateStr (YYYY-MM-DD) is a published college working day for the given scope */
    function isWorkingDay(dateStr, dept, year, section, course) {
        if (!dateStr) return false;
        const d = (dept || (typeof localStorage !== 'undefined' ? localStorage.getItem('userDept') : null) || '').trim();
        const y = (year || (typeof localStorage !== 'undefined' ? localStorage.getItem('userYear') : null) || '').trim();
        const s = (section || (typeof localStorage !== 'undefined' ? localStorage.getItem('userSection') : null) || '').trim();
        const c = (course || (typeof localStorage !== 'undefined' ? (localStorage.getItem('userCategory') || localStorage.getItem('userCourse')) : null) || '').trim();

        const special = getSpecialDay(dateStr, d, y, s, c);
        if (special && special.dayType === 'Holiday') return false;
        if (special && special.dayType === 'Working') return true;
        return workingSet.has(dateStr);
    }

    /** true if dateStr falls before the calendar's first day or after its last day */
    function isOutsideCalendar(dateStr) {
        if (!dateStr) return true;
        return false; // Support arbitrary historical & future dates
    }

    /** returns primary special day info if configured for dateStr (Holiday | Examination), strictly matching scope or global */
    function getSpecialDay(dateStr, dept, year, section, course) {
        if (!dateStr) return null;
        const list = specialDaysMap.get(dateStr);
        if (!list || list.length === 0) return null;

        const cleanDept = (dept || '').trim().toLowerCase();
        const cleanYear = year ? parseInt(year, 10) : null;
        const cleanSec = (section && section !== 'All') ? section.trim().toUpperCase() : null;
        const cleanCourse = (course && course !== 'All') ? course.trim().toLowerCase() : null;

        // 1. Try to find a precise match for this scope
        const match = list.find(s => {
            if (s.department) {
                const sDept = s.department.toLowerCase();
                if (!cleanDept || (!sDept.includes(cleanDept) && !cleanDept.includes(sDept))) return false;
            }
            if (cleanYear && s.year && s.year !== cleanYear) return false;
            if (cleanSec && s.section && s.section !== 'All' && s.section.toUpperCase() !== cleanSec) return false;
            if (cleanCourse && s.course && s.course !== 'All') {
                const sC = s.course.toLowerCase();
                if (!sC.includes(cleanCourse) && !cleanCourse.includes(sC)) return false;
            }
            return true;
        });
        if (match) return match;

        // 2. If no direct match, check if there is a global (institution-wide) entry (no department set)
        const globalEntry = list.find(s => !s.department || s.department.trim() === '');
        if (globalEntry) return globalEntry;

        // 3. Otherwise, return null (do NOT return another department's holiday!)
        return null;
    }

    /** returns all special day entries for a specific date matching scope (or all if no scope given) */
    function getSpecialDaysForDate(dateStr, dept, year, section, course) {
        if (!dateStr) return [];
        const list = specialDaysMap.get(dateStr) || [];
        if (!dept && !year && !section && !course) return list;

        const cleanDept = (dept || '').trim().toLowerCase();
        const cleanYear = year ? parseInt(year, 10) : null;
        const cleanSec = (section && section !== 'All') ? section.trim().toUpperCase() : null;

        return list.filter(s => {
            if (s.department) {
                const sDept = s.department.toLowerCase();
                if (cleanDept && !sDept.includes(cleanDept) && !cleanDept.includes(sDept)) return false;
            }
            if (cleanYear && s.year && s.year !== cleanYear) return false;
            if (cleanSec && s.section && s.section !== 'All' && s.section.toUpperCase() !== cleanSec) return false;
            return true;
        });
    }

    /** returns array of special days within [fromStr, toStr] range, optionally filtered by scope */
    function getSpecialDaysInRange(fromStr, toStr, dept, year, section, course) {
        if (!fromStr || !toStr || fromStr > toStr) return [];
        const result = [];
        for (const [date, list] of specialDaysMap.entries()) {
            if (date >= fromStr && date <= toStr) {
                const items = Array.isArray(list) ? list : (list ? [list] : []);
                items.forEach(item => {
                    if (item.department) {
                        const iDept = item.department.toLowerCase();
                        if (dept && !iDept.includes(dept.toLowerCase()) && !dept.toLowerCase().includes(iDept)) return;
                    }
                    if (year && item.year && item.year !== parseInt(year, 10)) return;
                    if (section && section !== 'All' && item.section && item.section !== 'All' && item.section.toUpperCase() !== section.toUpperCase()) return;
                    result.push(item);
                });
            }
        }
        return result.sort((a, b) => a.date.localeCompare(b.date));
    }

    /** counts only published working days (inclusive) between two YYYY-MM-DD strings */
    function countWorkingDays(fromStr, toStr) {
        if (!fromStr || !toStr || fromStr > toStr) return 0;
        let count = 0;
        for (const d of workingSet) {
            if (d >= fromStr && d <= toStr) count++;
        }
        return count;
    }

    /** Synchronizes working days and special days with backend database overrides */
    async function syncWithBackend(apiBase, dept, year, section, course) {
        try {
            const defaultBackend = 'https://od-application-backend.onrender.com';
            const baseUrl = apiBase || (typeof window !== 'undefined' && window.API_BASE ? window.API_BASE : (typeof API_BASE !== 'undefined' ? API_BASE : defaultBackend));
            if (!baseUrl) return;

            const myDept = (dept || (typeof localStorage !== 'undefined' ? localStorage.getItem('userDept') : null) || '').trim();
            const myYear = (year || (typeof localStorage !== 'undefined' ? localStorage.getItem('userYear') : null) || '').trim();
            const mySec = (section || (typeof localStorage !== 'undefined' ? localStorage.getItem('userSection') : null) || '').trim();
            const myCourse = (course || (typeof localStorage !== 'undefined' ? (localStorage.getItem('userCategory') || localStorage.getItem('userCourse')) : null) || '').trim();

            const params = new URLSearchParams();
            params.append('_', Date.now().toString());
            if (myDept) params.append('dept', myDept);
            if (myYear) params.append('year', myYear);
            if (mySec && mySec !== 'All') params.append('section', mySec);
            if (myCourse && myCourse !== 'All') {
                params.append('course', myCourse);
                params.append('category', myCourse);
            }

            const token = (typeof localStorage !== 'undefined') ? (localStorage.getItem('userToken') || localStorage.getItem('token')) : null;
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${baseUrl}/api/WorkingDay?${params.toString()}`, { headers, cache: 'no-store' });
            if (!res.ok) return; // keep existing maps on network error

            const data = await res.json();
            if (!data) return; // keep existing maps on bad response

            // Only replace workingSet when backend returns a valid non-empty list
            if (Array.isArray(data.workingDays) && data.workingDays.length > 0) {
                workingSet.clear();
                data.workingDays.forEach(d => workingSet.add(d));
            }

            // Build fresh map; only commit if we got a valid response (even empty array is valid)
            if (Array.isArray(data.specialDays)) {
                specialDaysMap.clear();
                data.specialDays.forEach(s => {
                    if (s && s.date) {
                        if (!specialDaysMap.has(s.date)) specialDaysMap.set(s.date, []);
                        specialDaysMap.get(s.date).push({
                            id: s.id || 0,
                            date: s.date,
                            dayType: s.dayType || 'Holiday',
                            name: s.name || '',
                            department: s.department || null,
                            course: s.course || null,
                            year: s.year || null,
                            section: s.section || null,
                            addedBy: s.addedBy || s.AddedBy || null
                        });
                    }
                });
            } else if (Array.isArray(data.overrides)) {
                specialDaysMap.clear();
                data.overrides.forEach(o => {
                    if (o && o.date && (o.dayType || o.name || !o.isWorking)) {
                        if (!specialDaysMap.has(o.date)) specialDaysMap.set(o.date, []);
                        specialDaysMap.get(o.date).push({
                            id: o.id || 0,
                            date: o.date,
                            dayType: o.dayType || (o.isWorking ? 'Working' : 'Holiday'),
                            name: o.name || (o.isWorking ? 'Working Day' : 'Holiday'),
                            department: o.department || null,
                            course: o.course || null,
                            year: o.year || null,
                            section: o.section || null,
                            addedBy: o.addedBy || o.AddedBy || null
                        });
                    }
                });
            }
        } catch (err) {
            console.warn('Calendar sync fallback to local default working days:', err);
        }
    }

    // Auto-sync on script load if window.API_BASE or fetch is available
    if (typeof window !== 'undefined') {
        setTimeout(() => syncWithBackend(), 100);
    }

    return {
        list: COLLEGE_WORKING_DAYS,
        workingSet,
        specialDaysMap,
        minDate,
        maxDate,
        isWorkingDay,
        isOutsideCalendar,
        getSpecialDay,
        getSpecialDaysForDate,
        getSpecialDaysInRange,
        countWorkingDays,
        syncWithBackend
    };
})();

/* ── Circular Analog Clock Time Picker Component ── */
const AnalogClockPicker = (() => {
    let overlay = null;
    let mode = 'hours'; // 'hours' or 'mins'
    let selectedHour = 9;
    let selectedMin = 0;
    let ampm = 'AM';
    let activeInput = null;
    let activeCallback = null;
    let isDragging = false;

    function ensureHTML() {
        if (overlay) return;

        const div = document.createElement('div');
        div.className = 'clock-picker-overlay';
        div.id = 'clockPickerOverlay';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="clock-picker-modal" role="dialog" aria-modal="true" aria-label="Select Time">
                <div class="clock-picker-header">
                    <span class="clock-picker-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="vertical-align: -3px; margin-right: 4px;">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        Select Time
                    </span>
                    <button class="clock-picker-close" id="clockPickerCloseBtn" type="button" aria-label="Close time picker">&times;</button>
                </div>
                <div class="clock-picker-time-display">
                    <span class="clock-time-val clock-time-hour active" id="clockValHour" title="Click to change Hour">09</span>
                    <span class="clock-time-colon">:</span>
                    <span class="clock-time-val clock-time-min" id="clockValMin" title="Click to change Minutes">00</span>
                    <div class="clock-ampm-wrap">
                        <button class="clock-ampm-btn active" id="clockBtnAM" type="button">AM</button>
                        <button class="clock-ampm-btn" id="clockBtnPM" type="button">PM</button>
                    </div>
                </div>
                <div class="clock-mode-toggle">
                    <button class="clock-mode-btn active" id="clockModeHoursBtn" type="button">Step 1: Hour</button>
                    <button class="clock-mode-btn" id="clockModeMinsBtn" type="button">Step 2: Minute</button>
                </div>
                <div class="clock-face-container">
                    <div class="clock-face" id="clockFace">
                        <div class="clock-center-dot"></div>
                        <div class="clock-hand" id="clockHand">
                            <div class="clock-hand-pin"></div>
                        </div>
                    </div>
                </div>
                <div class="clock-quick-presets">
                    <button type="button" class="clock-preset-btn" data-time="09:00" data-ampm="AM">9:00 AM</button>
                    <button type="button" class="clock-preset-btn" data-time="10:00" data-ampm="AM">10:00 AM</button>
                    <button type="button" class="clock-preset-btn" data-time="01:30" data-ampm="PM">1:30 PM</button>
                    <button type="button" class="clock-preset-btn" data-time="04:30" data-ampm="PM">4:30 PM</button>
                </div>
                <div class="clock-picker-actions">
                    <button class="clock-btn-clear" id="clockBtnClear" type="button">Clear</button>
                    <button class="clock-btn-ok" id="clockBtnOK" type="button">Set Time</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        overlay = div;

        document.getElementById('clockPickerCloseBtn')?.addEventListener('click', close);
        document.getElementById('clockBtnClear')?.addEventListener('click', () => {
            if (activeInput) {
                activeInput.value = '';
                activeInput.dispatchEvent(new Event('change', { bubbles: true }));
                activeInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            close();
        });
        document.getElementById('clockBtnOK')?.addEventListener('click', applyTime);

        document.getElementById('clockValHour')?.addEventListener('click', () => setMode('hours'));
        document.getElementById('clockValMin')?.addEventListener('click', () => setMode('mins'));
        document.getElementById('clockModeHoursBtn')?.addEventListener('click', () => setMode('hours'));
        document.getElementById('clockModeMinsBtn')?.addEventListener('click', () => setMode('mins'));

        document.getElementById('clockBtnAM')?.addEventListener('click', () => setAmPm('AM'));
        document.getElementById('clockBtnPM')?.addEventListener('click', () => setAmPm('PM'));

        // Preset buttons
        overlay.querySelectorAll('.clock-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = btn.dataset.time;
                const ap = btn.dataset.ampm;
                if (t && ap) {
                    const [h, m] = t.split(':').map(Number);
                    selectedHour = h;
                    selectedMin = m;
                    ampm = ap;
                    setAmPm(ampm);
                    updateDisplay();
                    updateHand(false);
                    updateActiveNumber();
                }
            });
        });

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        const face = document.getElementById('clockFace');
        if (face) {
            face.addEventListener('pointerdown', (e) => {
                isDragging = true;
                try { face.setPointerCapture(e.pointerId); } catch (_) {}
                handlePointerEvent(e, false);
            });
            face.addEventListener('pointermove', (e) => {
                if (isDragging) {
                    handlePointerEvent(e, true);
                }
            });
            face.addEventListener('pointerup', (e) => {
                if (!isDragging) return;
                isDragging = false;
                try { face.releasePointerCapture(e.pointerId); } catch (_) {}
                handlePointerEvent(e, false);
                if (mode === 'hours') {
                    // Smooth auto-transition from Hour to Minute on the SAME single clock
                    setTimeout(() => setMode('mins'), 200);
                }
            });
            face.addEventListener('pointercancel', (e) => {
                isDragging = false;
                try { face.releasePointerCapture(e.pointerId); } catch (_) {}
            });
        }
    }

    function setAmPm(val) {
        ampm = val;
        document.getElementById('clockBtnAM')?.classList.toggle('active', ampm === 'AM');
        document.getElementById('clockBtnPM')?.classList.toggle('active', ampm === 'PM');
    }

    function setMode(m) {
        mode = m;
        document.getElementById('clockValHour')?.classList.toggle('active', mode === 'hours');
        document.getElementById('clockValMin')?.classList.toggle('active', mode === 'mins');
        document.getElementById('clockModeHoursBtn')?.classList.toggle('active', mode === 'hours');
        document.getElementById('clockModeMinsBtn')?.classList.toggle('active', mode === 'mins');
        buildFaceNumbers();
        updateHand(true);
        updateDisplay();
    }

    function buildFaceNumbers() {
        const face = document.getElementById('clockFace');
        if (!face) return;

        face.querySelectorAll('.clock-number').forEach(el => el.remove());

        const cx = 103;
        const cy = 103;
        const radius = 72;

        if (mode === 'hours') {
            for (let h = 1; h <= 12; h++) {
                const angle = (h * 30 - 90) * (Math.PI / 180);
                const x = cx + radius * Math.cos(angle);
                const y = cy + radius * Math.sin(angle);

                const num = document.createElement('div');
                num.className = `clock-number ${selectedHour === h ? 'active' : ''}`;
                num.dataset.val = h;
                num.style.left = `${x}px`;
                num.style.top = `${y}px`;
                num.textContent = h;
                face.appendChild(num);
            }
        } else {
            for (let m = 0; m < 60; m += 5) {
                const angle = (m * 6 - 90) * (Math.PI / 180);
                const x = cx + radius * Math.cos(angle);
                const y = cy + radius * Math.sin(angle);

                const num = document.createElement('div');
                num.className = `clock-number ${Math.round(selectedMin / 5) * 5 === m ? 'active' : ''}`;
                num.dataset.val = m;
                num.style.left = `${x}px`;
                num.style.top = `${y}px`;
                num.textContent = String(m).padStart(2, '0');
                face.appendChild(num);
            }
        }
    }

    function updateActiveNumber() {
        const face = document.getElementById('clockFace');
        if (!face) return;
        const targetVal = mode === 'hours' ? selectedHour : Math.round(selectedMin / 5) * 5;
        face.querySelectorAll('.clock-number').forEach(el => {
            el.classList.toggle('active', Number(el.dataset.val) === targetVal);
        });
    }

    function updateHand(animate) {
        const hand = document.getElementById('clockHand');
        if (!hand) return;

        hand.style.transition = animate ? 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)' : 'none';

        if (mode === 'hours') {
            const deg = (selectedHour % 12) * 30;
            hand.style.transform = `rotate(${deg}deg)`;
        } else {
            const deg = selectedMin * 6;
            hand.style.transform = `rotate(${deg}deg)`;
        }
    }

    function handlePointerEvent(e, isMove) {
        const face = document.getElementById('clockFace');
        if (!face) return;
        const rect = face.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;

        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (angle < 0) angle += 360;

        if (mode === 'hours') {
            let h = Math.round(angle / 30);
            if (h === 0) h = 12;
            if (h !== selectedHour) {
                selectedHour = h;
                updateActiveNumber();
                updateDisplay();
            }
            updateHand(!isMove);
        } else {
            let m = Math.round(angle / 6);
            if (m === 60) m = 0;
            if (m !== selectedMin) {
                selectedMin = m;
                updateActiveNumber();
                updateDisplay();
            }
            updateHand(!isMove);
        }
    }

    function updateDisplay() {
        const hEl = document.getElementById('clockValHour');
        const mEl = document.getElementById('clockValMin');
        if (hEl) hEl.textContent = String(selectedHour).padStart(2, '0');
        if (mEl) mEl.textContent = String(selectedMin).padStart(2, '0');
    }

    function open(inputEl, callback) {
        ensureHTML();
        activeInput = inputEl;
        activeCallback = callback;

        if (inputEl && inputEl.value) {
            const cleanVal = inputEl.value.trim().toUpperCase();
            const isPM = cleanVal.includes('PM');
            const isAM = cleanVal.includes('AM');
            const numPart = cleanVal.replace(/[^\d:]/g, '');
            const parts = numPart.split(':');

            if (parts.length === 2) {
                let h = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                if (!isNaN(h) && !isNaN(m)) {
                    if (isPM) {
                        ampm = 'PM';
                        h = h % 12 || 12;
                    } else if (isAM) {
                        ampm = 'AM';
                        h = h % 12 || 12;
                    } else {
                        ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12 || 12;
                    }
                    selectedHour = h;
                    selectedMin = m % 60;
                }
            }
        } else {
            selectedHour = 9;
            selectedMin = 0;
            ampm = 'AM';
        }

        setAmPm(ampm);
        setMode('hours');
        if (overlay) overlay.style.display = 'flex';
    }

    function close() {
        if (overlay) overlay.style.display = 'none';
        isDragging = false;
        activeInput = null;
        activeCallback = null;
    }

    function applyTime() {
        let h24 = selectedHour;
        if (ampm === 'PM' && h24 < 12) h24 += 12;
        if (ampm === 'AM' && h24 === 12) h24 = 0;

        const formatted = `${String(h24).padStart(2, '0')}:${String(selectedMin).padStart(2, '0')}`;

        if (activeInput) {
            activeInput.value = formatted;
            activeInput.dispatchEvent(new Event('change', { bubbles: true }));
            activeInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (typeof activeCallback === 'function') {
            activeCallback(formatted);
        }

        close();
    }

    function attach(inputEl) {
        if (!inputEl) return;
        inputEl.readOnly = true;
        inputEl.style.cursor = 'pointer';
        inputEl.addEventListener('click', (e) => {
            e.preventDefault();
            open(inputEl);
        });
    }

    function attachAll(selector) {
        document.querySelectorAll(selector).forEach(el => attach(el));
    }

    return { open, close, attach, attachAll };
})();
