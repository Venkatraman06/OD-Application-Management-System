/**
 * College Working-Days Calendar
 * ------------------------------
 * Enabled for the full current year (2026): every Mon–Sat date from
 * today onward is treated as a working day (no fixed holiday list).
 * OD applications can be raised on any date in this range.
 */

function generateWorkingDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(today.getFullYear(), 0, 1); // Jan 1 of current year
  const end = new Date(today.getFullYear(), 11, 31); // Dec 31 of current year

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

const COLLEGE_WORKING_DAYS = generateWorkingDays();

const CollegeWorkingDays = (() => {
    const workingSet = new Set(COLLEGE_WORKING_DAYS);
    const sorted = [...COLLEGE_WORKING_DAYS].sort();
    const minDate = sorted[0];
    const maxDate = sorted[sorted.length - 1];

    /** true if dateStr (YYYY-MM-DD) is a published college working day */
    function isWorkingDay(dateStr) {
        if (!dateStr) return false;
        return workingSet.has(dateStr);
    }

    /** true if dateStr falls before the calendar's first day or after its last day */
    function isOutsideCalendar(dateStr) {
        if (!dateStr) return true;
        return dateStr < minDate || dateStr > maxDate;
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

    /** Synchronizes working days with backend database overrides */
    async function syncWithBackend(apiBase) {
        try {
            const baseUrl = apiBase || window.API_BASE || '';
            const res = await fetch(`${baseUrl}/api/WorkingDay?_=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.workingDays) && data.workingDays.length > 0) {
                    workingSet.clear();
                    data.workingDays.forEach(d => workingSet.add(d));
                }
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
        minDate,
        maxDate,
        isWorkingDay,
        isOutsideCalendar,
        countWorkingDays,
        syncWithBackend
    };
})();

/* ── Circular Analog Clock Time Picker Component ── */
const AnalogClockPicker = (() => {
    let overlay = null;
    let mode = 'hours';
    let selectedHour = 9;
    let selectedMin = 0;
    let ampm = 'AM';
    let activeInput = null;
    let activeCallback = null;

    function ensureHTML() {
        if (overlay) return;

        const div = document.createElement('div');
        div.className = 'clock-picker-overlay';
        div.id = 'clockPickerOverlay';
        div.style.display = 'none';
        div.innerHTML = `
            <div class="clock-picker-modal">
                <div class="clock-picker-header">
                    <span class="clock-picker-title">🕒 Time Picker</span>
                    <button class="clock-picker-close" id="clockPickerCloseBtn" type="button">&times;</button>
                </div>
                <div class="clock-picker-time-display">
                    <span class="clock-time-val clock-time-hour active" id="clockValHour">09</span>
                    <span class="clock-time-colon">:</span>
                    <span class="clock-time-val clock-time-min" id="clockValMin">00</span>
                    <div class="clock-ampm-wrap">
                        <button class="clock-ampm-btn active" id="clockBtnAM" type="button">AM</button>
                        <button class="clock-ampm-btn" id="clockBtnPM" type="button">PM</button>
                    </div>
                </div>
                <div class="clock-mode-toggle">
                    <button class="clock-mode-btn active" id="clockModeHoursBtn" type="button">Hours</button>
                    <button class="clock-mode-btn" id="clockModeMinsBtn" type="button">Minutes</button>
                </div>
                <div class="clock-face-container">
                    <div class="clock-face" id="clockFace">
                        <div class="clock-hand" id="clockHand">
                            <div class="clock-hand-pin"></div>
                        </div>
                    </div>
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

        const face = document.getElementById('clockFace');
        if (face) {
            face.addEventListener('pointerdown', handleFaceInteraction);
            face.addEventListener('pointermove', (e) => {
                if (e.buttons === 1) handleFaceInteraction(e);
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
        renderFace();
    }

    function renderFace() {
        const face = document.getElementById('clockFace');
        const hand = document.getElementById('clockHand');
        if (!face || !hand) return;

        face.querySelectorAll('.clock-number').forEach(el => el.remove());

        const radius = 72;
        const centerX = 103;
        const centerY = 103;

        if (mode === 'hours') {
            for (let h = 1; h <= 12; h++) {
                const angle = (h * 30 - 90) * (Math.PI / 180);
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);

                const num = document.createElement('div');
                num.className = `clock-number ${selectedHour === h ? 'active' : ''}`;
                num.style.left = `${x}px`;
                num.style.top = `${y}px`;
                num.textContent = h;
                num.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedHour = h;
                    renderFace();
                    setTimeout(() => setMode('mins'), 150);
                });
                face.appendChild(num);
            }
            const deg = selectedHour * 30;
            hand.style.transform = `rotate(${deg}deg)`;
        } else {
            for (let m = 0; m < 60; m += 5) {
                const angle = (m * 6 - 90) * (Math.PI / 180);
                const x = centerX + radius * Math.cos(angle);
                const y = centerY + radius * Math.sin(angle);

                const num = document.createElement('div');
                num.className = `clock-number ${Math.round(selectedMin / 5) * 5 === m ? 'active' : ''}`;
                num.style.left = `${x}px`;
                num.style.top = `${y}px`;
                num.textContent = String(m).padStart(2, '0');
                num.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedMin = m;
                    renderFace();
                });
                face.appendChild(num);
            }
            const deg = selectedMin * 6;
            hand.style.transform = `rotate(${deg}deg)`;
        }

        updateDisplay();
    }

    function handleFaceInteraction(e) {
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
            selectedHour = h;
            renderFace();
        } else {
            let m = Math.round(angle / 6);
            if (m === 60) m = 0;
            selectedMin = m;
            renderFace();
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
            const parts = inputEl.value.split(':');
            if (parts.length === 2) {
                let h = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10);
                if (!isNaN(h) && !isNaN(m)) {
                    ampm = h >= 12 ? 'PM' : 'AM';
                    h = h % 12 || 12;
                    selectedHour = h;
                    selectedMin = m;
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