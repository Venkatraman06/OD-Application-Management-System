const API_BASE = 'https://od-application-backend.onrender.com';

// Register number → student name lookup, used to show real names next to
// register numbers in the Group Members list (group OD data only ever
// carries register numbers for non-applicant members).
let studentNameLookup = {};
async function loadStudentNameLookup() {
    try {
        const res = await fetch(`${API_BASE}/api/Student`);
        if (!res.ok) return;
        const students = await res.json();
        students.forEach(s => {
            const reg = (s.registerNumber || s.RegisterNumber || '').trim().toLowerCase();
            if (reg) studentNameLookup[reg] = s.name || s.Name || '';
        });
    } catch (err) {
        console.error('Failed to load student name lookup:', err);
    }
}

let activeEventsList = [];

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function populateCollegesForEvent(eventName, selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;

    let colleges = [];
    if (eventName && eventName.trim() && eventName !== '__other__') {
        const matching = activeEventsList.filter(ev =>
            (ev.eventName || ev.EventName || '').trim().toLowerCase() === eventName.trim().toLowerCase()
        );
        matching.forEach(ev => {
            const c = (ev.collegeName || ev.CollegeName || '').trim();
            if (c && !colleges.some(e => e.toLowerCase() === c.toLowerCase())) colleges.push(c);
        });
    }
    if (colleges.length === 0) {
        activeEventsList.forEach(ev => {
            const c = (ev.collegeName || ev.CollegeName || '').trim();
            if (c && !colleges.some(e => e.toLowerCase() === c.toLowerCase())) colleges.push(c);
        });
    }

    let html = `<option value="" disabled selected hidden>Select college / industry name...</option>`;
    colleges.forEach(c => { html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`; });
    html += `<option value="__other__">Other</option>`;
    sel.innerHTML = html;
    sel.value = '';

    // Auto-select if only one college matches the chosen event
    if (eventName && eventName.trim() && eventName !== '__other__' && colleges.length === 1) {
        sel.value = colleges[0];
    }
}

async function loadActiveEvents() {
    try {
        const res = await fetch(`${API_BASE}/api/Events/Active?_=${Date.now()}`);
        activeEventsList = res.ok ? await res.json() : [];
    } catch { activeEventsList = []; }

    const uniqueNames = [];
    activeEventsList.forEach(ev => {
        const n = (ev.eventName || ev.EventName || '').trim();
        if (n && !uniqueNames.some(x => x.toLowerCase() === n.toLowerCase())) uniqueNames.push(n);
    });

    let optHtml = `<option value="" disabled selected hidden>Select event name...</option>`;
    uniqueNames.forEach(n => { optHtml += `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`; });
    optHtml += `<option value="__other__">Other</option>`;

    const soloSel = document.getElementById('eventName');
    const grpSel  = document.getElementById('groupEventName');
    if (soloSel) soloSel.innerHTML = optHtml;
    if (grpSel)  grpSel.innerHTML  = optHtml;

    populateCollegesForEvent('', 'collegeName');
    populateCollegesForEvent('', 'groupCollegeName');
}

document.addEventListener('DOMContentLoaded', async () => {
    loadStudentNameLookup();
    loadActiveEvents();

    // ── Guard: must be logged in ──
    const studentId = localStorage.getItem('studentId');
    if (!studentId) { window.location.href = 'index.html'; return; }

    const parsedStudentId = parseInt(studentId, 10);
    if (isNaN(parsedStudentId)) {
        console.error('Invalid studentId in localStorage:', studentId);
        window.location.href = 'index.html';
        return;
    }

    // ── Load student profile ──
    try {
        const res = await fetch(`${API_BASE}/api/Student/${parsedStudentId}`);
        if (res.ok) {
            const s = await res.json();
            const name  = s.name           || s.Name           || '';
            const dept  = s.department     || s.Department     || '';
            const sect  = s.section        || s.Section        || '';
            const regNo = s.registerNumber || s.RegisterNumber || '';
            const yr    = s.year           || s.Year           || '';
            const sem   = s.semester       || s.Semester       || '';
            const dob   = s.dob            || s.Dob            || s.DOB || '';
            const email = s.email          || s.Email          || localStorage.getItem('userEmail') || '';

            setEl('studentName',   name);
            setEl('studentDept',   sect ? `${dept} • Section ${sect}` : dept);
            setEl('studentRollNo', regNo);
            setEl('studentYear',   `Year ${yr} / Sem ${sem}`);
            setEl('studentEmail',  email || '-');

            const dobEl = document.getElementById('studentDOB');
            if (dobEl && dob) {
                try {
                    const d = new Date(dob);
                    dobEl.textContent = isNaN(d.getTime()) ? dob : d.toLocaleDateString('en-GB');
                } catch { dobEl.textContent = dob; }
            }

            const avatar = document.getElementById('studentAvatar');
            if (avatar) {
                const sp = avatar.querySelector('span');
                if (sp) sp.textContent = (name || 'S').charAt(0).toUpperCase();
            }

            localStorage.setItem('userName',       name);
            localStorage.setItem('registerNumber', regNo);
            localStorage.setItem('userDept',       dept);
            localStorage.setItem('userSection',    sect);
            if (email) localStorage.setItem('userEmail', email);
        }
    } catch (err) { console.error('Student load error:', err); }

    // ============================================
    // Working-days-only helpers
    // OD can only be applied for dates that are on the college's
    // published working-days calendar (see working-days.js, generated
    // from the college_working_days.xlsx sheet). Holidays, weekends,
    // and any date outside the published semester period are blocked
    // on date pick, and the day count only counts actual working days.
    // ============================================

    const workingDaysCalendar = (typeof CollegeWorkingDays !== 'undefined') ? CollegeWorkingDays : null;

    const todayStr = new Date().toISOString().slice(0, 10);
    ['fromDate', 'toDate', 'groupFromDate', 'groupToDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el && workingDaysCalendar) {
            el.min = todayStr > workingDaysCalendar.minDate ? todayStr : workingDaysCalendar.minDate;
            el.max = workingDaysCalendar.maxDate;
        }
    });

    // Set of user-confirmed non-working/Saturday dates (by input id + date)
    window.confirmedNonWorkingDates = window.confirmedNonWorkingDates || new Set();

    function showSaturdayConfirmModal(dateStr, dayName, onConfirm, onCancel) {
        const modal = document.getElementById('saturdayConfirmModal');
        const title = document.getElementById('saturdayModalTitle');
        const msg = document.getElementById('saturdayModalMsg');
        const confirmBtn = document.getElementById('saturdayModalConfirmBtn');
        const skipBtn = document.getElementById('saturdayModalSkipBtn');

        if (!modal) {
            if (confirm(`The selected date (${dateStr} - ${dayName}) is normally a non-working day.\n\nDo you want to include ${dayName} in your OD request?`)) {
                if (onConfirm) onConfirm();
            } else {
                if (onCancel) onCancel();
            }
            return;
        }

        if (title) title.textContent = `${dayName} Selected`;
        if (msg) msg.textContent = `The selected date (${dateStr} - ${dayName}) falls on a non-working day. Do you want to include ${dayName} in your OD application?`;
        if (confirmBtn) confirmBtn.textContent = `Yes, Include ${dayName}`;
        if (skipBtn) skipBtn.textContent = `Skip / Clear`;

        modal.style.display = 'flex';

        const cleanUp = () => {
            modal.style.display = 'none';
            if (confirmBtn) confirmBtn.onclick = null;
            if (skipBtn) skipBtn.onclick = null;
        };

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                cleanUp();
                if (onConfirm) onConfirm();
            };
        }

        if (skipBtn) {
            skipBtn.onclick = () => {
                cleanUp();
                if (onCancel) onCancel();
            };
        }
    }

    function formatLocalDate(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /** true if the given YYYY-MM-DD date string is Saturday, Sunday, or a college non-working day */
    function isWeekend(dateStr) {
        if (!dateStr) return false;
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const day = dateObj.getDay();
            // 6 = Saturday, 0 = Sunday
            if (day === 6 || day === 0) return true;
            if (workingDaysCalendar && typeof workingDaysCalendar.isWorkingDay === 'function') {
                return !workingDaysCalendar.isWorkingDay(dateStr);
            }
        } catch (e) {
            console.warn('isWeekend check error:', e);
        }
        return false;
    }

    /** counts working days (inclusive) between two YYYY-MM-DD strings, including confirmed weekend overrides */
    function countWorkingDays(fromStr, toStr) {
        if (!fromStr || !toStr || fromStr > toStr) return 0;
        let count = 0;
        try {
            const [fy, fm, fd] = fromStr.split('-').map(Number);
            const [ty, tm, td] = toStr.split('-').map(Number);
            const cur = new Date(fy, fm - 1, fd);
            const end = new Date(ty, tm - 1, td);

            while (cur <= end) {
                const day = cur.getDay(); // 0 = Sunday, 6 = Saturday
                const curStr = formatLocalDate(cur);
                const isConfirmed = Array.from(window.confirmedNonWorkingDates || []).some(k => k.endsWith(`_${curStr}`));

                if (day !== 0 && day !== 6) {
                    // Monday to Friday: working day unless specifically marked as holiday in calendar AND not confirmed
                    if (!workingDaysCalendar || workingDaysCalendar.isWorkingDay(curStr) || isConfirmed) {
                        count++;
                    }
                } else if (day === 6) {
                    // Saturday: if user included/confirmed Saturday, add +1 to working days
                    if (isConfirmed || (workingDaysCalendar && workingDaysCalendar.isWorkingDay(curStr))) {
                        count++;
                    }
                } else if (day === 0) {
                    // Sunday: only if user explicitly confirmed it
                    if (isConfirmed) {
                        count++;
                    }
                }
                cur.setDate(cur.getDate() + 1);
            }
        } catch (e) {
            console.warn('countWorkingDays error:', e);
        }

        return Math.max(1, count > 0 ? count : 1);
    }

    /**
     * Guards a date input against non-working-day selection.
     * If the picked date is a holiday or Saturday/weekend, shows an interactive
     * alert modal asking if the user wants to include it.
     * If the picked date is Sunday, it is strictly invalid and rejected immediately.
     */
    function guardWeekendInput(inputEl, errorElId, label, onDone) {
        if (!inputEl) return true;
        const val = inputEl.value;
        const isFrom = inputEl.id.toLowerCase().includes('from');

        if (!val) {
            Array.from(window.confirmedNonWorkingDates || []).forEach(k => {
                if (k.startsWith(`${inputEl.id}_`)) window.confirmedNonWorkingDates.delete(k);
            });
            clearFieldError(inputEl, errorElId);
            if (onDone) onDone();
            return true;
        }

        const dateKey = `${inputEl.id}_${val}`;
        Array.from(window.confirmedNonWorkingDates || []).forEach(k => {
            if (k.startsWith(`${inputEl.id}_`) && k !== dateKey) {
                window.confirmedNonWorkingDates.delete(k);
            }
        });

        const d = new Date(val + 'T00:00:00');
        const day = isNaN(d.getDay()) ? -1 : d.getDay();
        const isSat = day === 6;
        const isSun = day === 0;

        if (isSun) {
            const sundayMsg = isFrom ? 'Sunday cannot be chosen as from date' : 'Sunday cannot be chosen as to date';
            showFieldError(inputEl, errorElId, sundayMsg);
            if (onDone) onDone();
            return false;
        }

        const isNonWorking = isWeekend(val);

        if ((isSat || isNonWorking) && !window.confirmedNonWorkingDates.has(dateKey)) {
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const dayName = isSat ? 'Saturday' : (day >= 0 ? dayNames[day] : 'Non-working Day');

            showSaturdayConfirmModal(val, dayName,
                () => {
                    // User confirmed — include this specific date only
                    window.confirmedNonWorkingDates.add(dateKey);
                    clearFieldError(inputEl, errorElId);
                    showToast('success', `Included ${dayName} (${val}) in OD request.`);
                    if (onDone) onDone();
                },
                () => {
                    // User chose to skip — clear the field and remove any confirmed keys
                    inputEl.value = '';
                    window.confirmedNonWorkingDates.delete(dateKey);
                    clearFieldError(inputEl, errorElId);
                    showToast('info', `Skipped ${dayName} (${val}).`);
                    if (onDone) onDone();
                }
            );
            return false;
        }

        clearFieldError(inputEl, errorElId);
        if (onDone) onDone();
        return true;
    }

    function showFieldError(inputEl, errorElId, msg) {
        const group = inputEl.closest('.input-group');
        if (group) group.classList.add('error');
        const errEl = document.getElementById(errorElId);
        if (errEl) errEl.textContent = msg;
    }

    function clearFieldError(inputEl, errorElId) {
        const group = inputEl.closest('.input-group');
        if (group) group.classList.remove('error');
        const errEl = document.getElementById(errorElId);
        if (errEl) errEl.textContent = '';
    }

    // ── Auto-calculate days (solo OD) ──
    const fromEl = document.getElementById('fromDate');
    const toEl   = document.getElementById('toDate');
    const daysEl = document.getElementById('numberOfDays');
    const startTimeEl = document.getElementById('startTime');
    const endTimeEl   = document.getElementById('endTime');

    // Convert HH:MM string to total minutes
    function timeToMinutes(t) {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    }

    // Format HH:MM (24-hr) to 12-hr AM/PM string
    function formatTime12h(t) {
        if (!t) return '-';
        const [h, m] = t.split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
    }

    function buildDaysText(days, startTime, endTime) {
        if (!days || days <= 0) return '1 working day';
        const label = days === 1 ? 'working day' : 'working days';
        const sMin = timeToMinutes(startTime);
        const eMin = timeToMinutes(endTime);
        if (sMin !== null && eMin !== null && eMin > sMin) {
            const diffH = (eMin - sMin) / 60;
            const hoursLabel = diffH % 1 === 0 ? `${diffH} working hours` : `${diffH.toFixed(1)} working hours`;
            return `${days} ${label} (${hoursLabel}/day)`;
        }
        return `${days} ${label}`;
    }

    function calcDays() {
        if (!fromEl || !toEl) return;
        const fromVal = fromEl.value;
        const toVal = toEl.value;

        // Check Sunday on both
        if (fromVal) {
            const dFrom = new Date(fromVal + 'T00:00:00');
            if (dFrom.getDay() === 0) {
                showFieldError(fromEl, 'fromDate-error', 'Sunday cannot be chosen as from date');
                if (daysEl) daysEl.value = '';
                return;
            }
        }
        if (toVal) {
            const dTo = new Date(toVal + 'T00:00:00');
            if (dTo.getDay() === 0) {
                showFieldError(toEl, 'toDate-error', 'Sunday cannot be chosen as to date');
                if (daysEl) daysEl.value = '';
                return;
            }
        }

        if (fromVal && toVal) {
            if (toVal < fromVal) {
                showFieldError(toEl, 'toDate-error', 'To date cannot be before from date');
                if (daysEl) daysEl.value = '';
                return;
            } else {
                const toErr = document.getElementById('toDate-error');
                if (toErr && toErr.textContent === 'To date cannot be before from date') {
                    clearFieldError(toEl, 'toDate-error');
                }
            }

            const d = countWorkingDays(fromVal, toVal);
            if (daysEl) {
                daysEl.value = buildDaysText(d, startTimeEl?.value, endTimeEl?.value);
            }
        } else {
            if (daysEl) daysEl.value = '';
        }
    }
    if (fromEl) {
        fromEl.addEventListener('change', () => { guardWeekendInput(fromEl, 'fromDate-error', 'From Date', calcDays); });
        fromEl.addEventListener('input',  () => { guardWeekendInput(fromEl, 'fromDate-error', 'From Date', calcDays); });
    }
    if (toEl) {
        toEl.addEventListener('change', () => { guardWeekendInput(toEl, 'toDate-error', 'To Date', calcDays); });
        toEl.addEventListener('input',  () => { guardWeekendInput(toEl, 'toDate-error', 'To Date', calcDays); });
    }
    if (startTimeEl) startTimeEl.addEventListener('change', () => { calcDays(); validateTimes(); });
    if (endTimeEl)   endTimeEl.addEventListener('change',   () => { calcDays(); validateTimes(); });

    function validateTimes() {
        const sMin = timeToMinutes(startTimeEl?.value);
        const eMin = timeToMinutes(endTimeEl?.value);
        const errEl = document.getElementById('endTime-error');
        const grp   = document.getElementById('endTime-group');
        if (sMin !== null && eMin !== null && eMin <= sMin) {
            if (errEl) errEl.textContent = 'End Time must be later than Start Time.';
            if (grp)   grp.classList.add('error');
            return false;
        }
        if (errEl) errEl.textContent = '';
        if (grp)   grp.classList.remove('error');
        return true;
    }

    // ── Auto-calculate days (group OD) ──
    const groupFromEl  = document.getElementById('groupFromDate');
    const groupToEl    = document.getElementById('groupToDate');
    const groupDaysEl  = document.getElementById('groupNumberOfDays');
    const grpStartTimeEl = document.getElementById('groupStartTime');
    const grpEndTimeEl   = document.getElementById('groupEndTime');

    function calcGroupDays() {
        if (!groupFromEl || !groupToEl) return;
        const fromVal = groupFromEl.value;
        const toVal = groupToEl.value;

        // Check Sunday on both
        if (fromVal) {
            const dFrom = new Date(fromVal + 'T00:00:00');
            if (dFrom.getDay() === 0) {
                showFieldError(groupFromEl, 'groupFromDate-error', 'Sunday cannot be chosen as from date');
                if (groupDaysEl) groupDaysEl.value = '';
                return;
            }
        }
        if (toVal) {
            const dTo = new Date(toVal + 'T00:00:00');
            if (dTo.getDay() === 0) {
                showFieldError(groupToEl, 'groupToDate-error', 'Sunday cannot be chosen as to date');
                if (groupDaysEl) groupDaysEl.value = '';
                return;
            }
        }

        if (fromVal && toVal) {
            if (toVal < fromVal) {
                showFieldError(groupToEl, 'groupToDate-error', 'To date cannot be before from date');
                if (groupDaysEl) groupDaysEl.value = '';
                return;
            } else {
                const toErr = document.getElementById('groupToDate-error');
                if (toErr && toErr.textContent === 'To date cannot be before from date') {
                    clearFieldError(groupToEl, 'groupToDate-error');
                }
            }

            const d = countWorkingDays(fromVal, toVal);
            if (groupDaysEl) {
                groupDaysEl.value = buildDaysText(d, grpStartTimeEl?.value, grpEndTimeEl?.value);
            }
        } else {
            if (groupDaysEl) groupDaysEl.value = '';
        }
    }
    if (groupFromEl) {
        groupFromEl.addEventListener('change', () => { guardWeekendInput(groupFromEl, 'groupFromDate-error', 'From Date', calcGroupDays); });
        groupFromEl.addEventListener('input',  () => { guardWeekendInput(groupFromEl, 'groupFromDate-error', 'From Date', calcGroupDays); });
    }
    if (groupToEl) {
        groupToEl.addEventListener('change', () => { guardWeekendInput(groupToEl, 'groupToDate-error', 'To Date', calcGroupDays); });
        groupToEl.addEventListener('input',  () => { guardWeekendInput(groupToEl, 'groupToDate-error', 'To Date', calcGroupDays); });
    }
    if (grpStartTimeEl) grpStartTimeEl.addEventListener('change', () => { calcGroupDays(); validateGroupTimes(); });
    if (grpEndTimeEl)   grpEndTimeEl.addEventListener('change',   () => { calcGroupDays(); validateGroupTimes(); });

    function validateGroupTimes() {
        const sMin = timeToMinutes(grpStartTimeEl?.value);
        const eMin = timeToMinutes(grpEndTimeEl?.value);
        const errEl = document.getElementById('groupEndTime-error');
        const grp   = document.getElementById('groupEndTime-group');
        if (sMin !== null && eMin !== null && eMin <= sMin) {
            if (errEl) errEl.textContent = 'End Time must be later than Start Time.';
            if (grp)   grp.classList.add('error');
            return false;
        }
        if (errEl) errEl.textContent = '';
        if (grp)   grp.classList.remove('error');
        return true;
    }

    // ── Tab switching ──
    const tabIndicator = document.getElementById('tabIndicator');

    function switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('active');

        const pane = document.getElementById(tabId);
        if (pane) pane.classList.add('active');

        if (tabIndicator) {
            const positions = { 'od-apply': '0%', 'group-od-apply': '100%', 'apply-status': '200%' };
            tabIndicator.style.transform = `translateX(${positions[tabId] ?? '0%'})`;
        }

        if (tabId === 'apply-status') {
            loadODStatus();
        }
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Auto-refresh disabled — data updates via manual refresh button or tab switch

    // ── Force a fresh reload when returning to this page via browser
    //    back/forward cache (bfcache). Without this, the browser can restore
    //    the exact DOM/state from before a certificate upload, making it look
    //    like the upload never happened — the classic trigger for the
    //    "upload certificate shows again / old certificate lost" bug. ──
    window.addEventListener('pageshow', (event) => {
        if (event.persisted && document.getElementById('apply-status')?.classList.contains('active')) {
            loadODStatus();
        }
    });

    // ── Filter buttons ──
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterCards(btn.dataset.filter);
        });
    });

    function filterCards(filter) {
        document.querySelectorAll('.od-status-card').forEach(card => {
            card.style.display = (filter === 'all' || card.dataset.overall === filter) ? '' : 'none';
        });
    }

    document.getElementById('refreshBtn')?.addEventListener('click', loadODStatus);


    // ── Event selection & custom manual input toggle handlers ──
    const soloEventSel   = document.getElementById('eventName');
    const soloCollegeSel = document.getElementById('collegeName');
    const customEventWrap   = document.getElementById('customEventWrap');
    const customCollegeWrap = document.getElementById('customCollegeWrap');
    const customEventInput   = document.getElementById('customEventInput');
    const customCollegeInput = document.getElementById('customCollegeInput');

    if (soloEventSel) {
        soloEventSel.addEventListener('change', () => {
            const val = soloEventSel.value;
            if (val === '__other__') {
                if (customEventWrap) customEventWrap.style.display = 'block';
                if (customEventInput) customEventInput.focus();
            } else {
                if (customEventWrap) customEventWrap.style.display = 'none';
            }
            populateCollegesForEvent(val, 'collegeName');
            if (customCollegeWrap) customCollegeWrap.style.display = 'none';
            if (customCollegeInput) customCollegeInput.value = '';
        });
    }

    if (soloCollegeSel) {
        soloCollegeSel.addEventListener('change', () => {
            const val = soloCollegeSel.value;
            if (val === '__other__') {
                if (customCollegeWrap) customCollegeWrap.style.display = 'block';
                if (customCollegeInput) customCollegeInput.focus();
            } else {
                if (customCollegeWrap) customCollegeWrap.style.display = 'none';
            }
        });
    }

    const grpEventSel   = document.getElementById('groupEventName');
    const grpCollegeSel = document.getElementById('groupCollegeName');
    const grpCustomEventWrap   = document.getElementById('groupCustomEventWrap');
    const grpCustomCollegeWrap = document.getElementById('groupCustomCollegeWrap');
    const grpCustomEventInput   = document.getElementById('groupCustomEventInput');
    const grpCustomCollegeInput = document.getElementById('groupCustomCollegeInput');

    if (grpEventSel) {
        grpEventSel.addEventListener('change', () => {
            const val = grpEventSel.value;
            if (val === '__other__') {
                if (grpCustomEventWrap) grpCustomEventWrap.style.display = 'block';
                if (grpCustomEventInput) grpCustomEventInput.focus();
            } else {
                if (grpCustomEventWrap) grpCustomEventWrap.style.display = 'none';
            }
            populateCollegesForEvent(val, 'groupCollegeName');
            if (grpCustomCollegeWrap) grpCustomCollegeWrap.style.display = 'none';
            if (grpCustomCollegeInput) grpCustomCollegeInput.value = '';
        });
    }

    if (grpCollegeSel) {
        grpCollegeSel.addEventListener('change', () => {
            const val = grpCollegeSel.value;
            if (val === '__other__') {
                if (grpCustomCollegeWrap) grpCustomCollegeWrap.style.display = 'block';
                if (grpCustomCollegeInput) grpCustomCollegeInput.focus();
            } else {
                if (grpCustomCollegeWrap) grpCustomCollegeWrap.style.display = 'none';
            }
        });
    }

    document.getElementById('resetBtn')?.addEventListener('click', () => {
        if (soloEventSel)   { soloEventSel.selectedIndex = 0; }
        if (soloCollegeSel) { populateCollegesForEvent('', 'collegeName'); }
        if (customEventWrap) customEventWrap.style.display = 'none';
        if (customCollegeWrap) customCollegeWrap.style.display = 'none';
        if (customEventInput) customEventInput.value = '';
        if (customCollegeInput) customCollegeInput.value = '';
        if (daysEl) daysEl.value = '';
    });

    document.getElementById('groupResetBtn')?.addEventListener('click', () => {
        if (grpEventSel)   { grpEventSel.selectedIndex = 0; }
        if (grpCollegeSel) { populateCollegesForEvent('', 'groupCollegeName'); }
        if (grpCustomEventWrap) grpCustomEventWrap.style.display = 'none';
        if (grpCustomCollegeWrap) grpCustomCollegeWrap.style.display = 'none';
        if (grpCustomEventInput) grpCustomEventInput.value = '';
        if (grpCustomCollegeInput) grpCustomCollegeInput.value = '';
        if (groupDaysEl) groupDaysEl.value = '';
        window.groupMemberList = [];
        renderMemberList();
    });

    // ── Solo OD Form Submit ──
    document.getElementById('odForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fromDate = fromEl ? fromEl.value : '';
        const toDate   = toEl   ? toEl.value   : '';
        let event      = soloEventSel?.value?.trim() || '';
        if (event === '__other__') {
            event = customEventInput?.value?.trim() || '';
        }
        let college    = soloCollegeSel?.value?.trim() || '';
        if (college === '__other__') {
            college = customCollegeInput?.value?.trim() || '';
        }
        const reason   = document.getElementById('reason')?.value.trim()      || '';
        const competitionType = document.getElementById('competitionType')?.value || '';
        const startTime = startTimeEl?.value || null;
        const endTime   = endTimeEl?.value   || null;

        if (!fromDate || !toDate || !event || !college || !reason || !competitionType) {
            showToast('error', 'All fields required'); return;
        }
        const dFrom = new Date(fromDate + 'T00:00:00');
        const dTo = new Date(toDate + 'T00:00:00');
        if (dFrom.getDay() === 0) {
            showFieldError(fromEl, 'fromDate-error', 'Sunday cannot be chosen as from date');
            showToast('error', 'Sunday cannot be chosen as from date');
            return;
        }
        if (dTo.getDay() === 0) {
            showFieldError(toEl, 'toDate-error', 'Sunday cannot be chosen as to date');
            showToast('error', 'Sunday cannot be chosen as to date');
            return;
        }
        if (fromDate > toDate) {
            showFieldError(toEl, 'toDate-error', 'To date cannot be before from date');
            showToast('error', 'To date cannot be before from date');
            return;
        }
        // Final guard — check weekends at submit time
        if (isWeekend(fromDate) && !window.confirmedNonWorkingDates.has(`fromDate_${fromDate}`)) {
            guardWeekendInput(fromEl, 'fromDate-error', 'From Date', calcDays);
            return;
        }
        if (isWeekend(toDate) && !window.confirmedNonWorkingDates.has(`toDate_${toDate}`)) {
            guardWeekendInput(toEl, 'toDate-error', 'To Date', calcDays);
            return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
        }
        // Validate times if provided
        if (startTime && endTime && !validateTimes()) {
            showToast('error', 'End Time must be later than Start Time.'); return;
        }
        if ((startTime && !endTime) || (!startTime && endTime)) {
            showToast('error', 'Please provide both Start Time and End Time, or leave both empty.'); return;
        }

        const days = countWorkingDays(fromDate, toDate);
        if (days <= 0) {
            showToast('error', 'Selected range contains no working days'); return;
        }

        const odData = {
            studentId:       parsedStudentId,
            studentName:     localStorage.getItem('userName')       || '',
            registerNumber:  localStorage.getItem('registerNumber') || '',
            department:      localStorage.getItem('userDept')       || '',
            Section:         localStorage.getItem('userSection')    || '',
            fromDate,
            toDate,
            numberOfDays:    days,
            event,
            competitionType,
            collegeIndustry: college,
            reason,
            startTime:       startTime || null,
            endTime:         endTime   || null
        };

        console.log('Submitting OD:', odData);
        setBtnLoading(true);

        try {
            const res = await fetch(`${API_BASE}/api/OdApply/OD-Apply`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(odData)
            });

            if (res.ok) {
                const created = await res.json();
                console.log('OD created successfully:', created);
                showToast('success', 'OD submitted successfully!');
                // The OD itself always saves fine even if the notification
                // email fails (e.g. no matching class teacher, SMTP error) —
                // surface that separately so the student knows to follow up.
                if (res.headers.get('X-Email-Status') === 'failed') {
                    showToast('error', `OD saved, but staff wasn't emailed — ${res.headers.get('X-Email-Detail') || 'unknown error'}. Contact your class teacher directly.`);
                }
                document.getElementById('odForm').reset();
                if (daysEl) daysEl.value = '';
                if (soloEventSel)   soloEventSel.selectedIndex = 0;
                if (soloCollegeSel) populateCollegesForEvent('', 'collegeName');
                if (customEventWrap) customEventWrap.style.display = 'none';
                if (customCollegeWrap) customCollegeWrap.style.display = 'none';
                if (customEventInput) customEventInput.value = '';
                if (customCollegeInput) customCollegeInput.value = '';
                switchTab('apply-status');
            } else {
                const errText = await res.text();
                console.error('Submit failed:', res.status, errText);
                let msg = `Failed to submit OD (${res.status})`;
                try {
                    const parsed = JSON.parse(errText);
                    if (parsed.message) msg = parsed.message;
                    else if (typeof parsed === 'string') msg = parsed;
                } catch {
                    if (errText && errText.length < 150) msg = errText;
                }
                showToast('error', msg);
            }
        } catch (err) {
            console.error('Submit network error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            setBtnLoading(false);
        }
    });

    // ── Group OD Form Submit ──
    document.getElementById('groupOdForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fromDate = groupFromEl ? groupFromEl.value : '';
        const toDate   = groupToEl   ? groupToEl.value   : '';
        let event      = grpEventSel?.value?.trim() || '';
        if (event === '__other__') {
            event = document.getElementById('groupCustomEventInput')?.value?.trim() || '';
        }
        let college    = grpCollegeSel?.value?.trim() || '';
        if (college === '__other__') {
            college = document.getElementById('groupCustomCollegeInput')?.value?.trim() || '';
        }
        const reason   = document.getElementById('groupReason')?.value.trim()      || '';
        const groupName = document.getElementById('groupName')?.value.trim()       || '';
        const regNumbersRaw = document.getElementById('registerNumbers')?.value.trim() || '';
        const groupCompetitionType = document.getElementById('groupCompetitionType')?.value || '';
        const grpStartTime = grpStartTimeEl?.value || null;
        const grpEndTime   = grpEndTimeEl?.value   || null;

        if (!fromDate || !toDate || !event || !college || !reason || !groupName || !groupCompetitionType) {
            showToast('error', 'All fields required'); return;
        }
        if (!regNumbersRaw || window.groupMemberList.length < 2) {
            showToast('error', 'Add at least 2 group members'); return;
        }
        const grpDFrom = new Date(fromDate + 'T00:00:00');
        const grpDTo = new Date(toDate + 'T00:00:00');
        if (grpDFrom.getDay() === 0) {
            showFieldError(groupFromEl, 'groupFromDate-error', 'Sunday cannot be chosen as from date');
            showToast('error', 'Sunday cannot be chosen as from date');
            return;
        }
        if (grpDTo.getDay() === 0) {
            showFieldError(groupToEl, 'groupToDate-error', 'Sunday cannot be chosen as to date');
            showToast('error', 'Sunday cannot be chosen as to date');
            return;
        }
        if (fromDate > toDate) {
            showFieldError(groupToEl, 'groupToDate-error', 'To date cannot be before from date');
            showToast('error', 'To date cannot be before from date');
            return;
        }
        // Final guard — check weekends at submit time
        if (isWeekend(fromDate) && !window.confirmedNonWorkingDates.has(`groupFromDate_${fromDate}`)) {
            guardWeekendInput(groupFromEl, 'groupFromDate-error', 'From Date', calcGroupDays);
            return;
        }
        if (isWeekend(toDate) && !window.confirmedNonWorkingDates.has(`groupToDate_${toDate}`)) {
            guardWeekendInput(groupToEl, 'groupToDate-error', 'To Date', calcGroupDays);
            return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
        }
        // Validate times if provided
        if (grpStartTime && grpEndTime && !validateGroupTimes()) {
            showToast('error', 'End Time must be later than Start Time.'); return;
        }
        if ((grpStartTime && !grpEndTime) || (!grpStartTime && grpEndTime)) {
            showToast('error', 'Please provide both Start Time and End Time, or leave both empty.'); return;
        }

        const regNumbers = [...window.groupMemberList];

        const days = countWorkingDays(fromDate, toDate);
        if (days <= 0) {
            showToast('error', 'Selected range contains no working days'); return;
        }

        const odData = {
            studentId:       parsedStudentId,
            studentName:     localStorage.getItem('userName')       || '',
            registerNumber:  localStorage.getItem('registerNumber') || '',
            department:      localStorage.getItem('userDept')       || '',
            Section:         localStorage.getItem('userSection')    || '',
            fromDate,
            toDate,
            numberOfDays:    days,
            event,
            collegeIndustry: college,
            reason,
            competitionType: groupCompetitionType,
            isGroupOd:       true,
            groupName:       groupName,
            registerNumbers: regNumbers.join(','),
            startTime:       grpStartTime || null,
            endTime:         grpEndTime   || null
        };

        console.log('Submitting Group OD:', odData);

        const btn = document.getElementById('submitGroupOdBtn');
        const t = btn?.querySelector('.btn-text');
        const l = btn?.querySelector('.btn-loader');
        if (t) t.style.display = 'none';
        if (l) l.style.display = 'inline';
        if (btn) btn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/OdApply/OD-Apply`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(odData)
            });

            if (res.ok) {
                showToast('success', 'Group OD submitted successfully!');
                if (res.headers.get('X-Email-Status') === 'failed') {
                    showToast('error', `OD saved, but staff wasn't emailed — ${res.headers.get('X-Email-Detail') || 'unknown error'}. Contact your class teacher directly.`);
                }
                document.getElementById('groupOdForm').reset();
                if (groupDaysEl) groupDaysEl.value = '';
                if (grpEventSel)   grpEventSel.selectedIndex = 0;
                if (grpCollegeSel) populateCollegesForEvent('', 'groupCollegeName');
                if (grpCustomEventWrap) grpCustomEventWrap.style.display = 'none';
                if (grpCustomCollegeWrap) grpCustomCollegeWrap.style.display = 'none';
                if (grpCustomEventInput) grpCustomEventInput.value = '';
                if (grpCustomCollegeInput) grpCustomCollegeInput.value = '';
                // Reset dynamic member list
                window.groupMemberList = [];
                renderMemberList();
                switchTab('apply-status');

            } else {
                const errText = await res.text();
                console.error('Group OD submit failed:', res.status, errText);
                let msg = `Failed to submit Group OD (${res.status})`;
                try {
                    const parsed = JSON.parse(errText);
                    if (parsed.message) msg = parsed.message;
                    else if (typeof parsed === 'string') msg = parsed;
                } catch {
                    if (errText && errText.length < 150) msg = errText;
                }
                showToast('error', msg);
            }
        } catch (err) {
            console.error('Group OD network error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            if (t) t.style.display = 'inline';
            if (l) l.style.display = 'none';
            if (btn) btn.disabled = false;
        }
    });


    // ── OD Detail Modal ──
    const odModal = document.getElementById('odDetailModal');

    document.getElementById('modalCloseBtn')?.addEventListener('click', closeOdModal);
    odModal?.addEventListener('click', (e) => {
        if (e.target === odModal) closeOdModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (odModal && odModal.style.display !== 'none') closeOdModal();
            if (certModal && certModal.style.display !== 'none') closeCertModal();
        }
    });

    function closeOdModal() {
        if (odModal) odModal.style.display = 'none';
    }

    /**
     * Finds "my own" certificate row for this OD out of the per-member
     * certificates[] array attached by the backend (one row per group
     * member, so my upload/verify state never gets mixed up with another
     * member's).
     */
    function findMyCertificate(od) {
        const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toLowerCase();
        const certs = od.Certificates ?? od.certificates ?? [];
        return certs.find(c =>
            ((c.RegisterNumber ?? c.registerNumber ?? '').trim().toLowerCase()) === myRegNo
        ) || null;
    }

    /**
     * For a group OD spanning multiple class sections, the OD-level
     * FacultyStatus stays "Pending" until EVERY section's staff has decided
     * — that's correct for whether the OD is ready to move to HOD, but WRONG
     * for showing an individual student their own status: a Section-B
     * student whose own staff already approved them should see "Approved"
     * immediately, even while a Section-A member is still waiting on their
     * own staff. This resolves the CURRENT student's own faculty decision
     * from the per-member approved/rejected lists, falling back to the raw
     * OD-level FacultyStatus for solo ODs (which never populate those lists).
     */
    function getMyFacultyStatus(od) {
        const isGroup = od.IsGroupOd ?? od.isGroupOd ?? false;
        const rawStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
        if (!isGroup) return rawStatus;

        const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toLowerCase();
        const approved = (od.FacultyApprovedRegisterNumbers ?? od.facultyApprovedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const rejected = (od.FacultyRejectedRegisterNumbers ?? od.facultyRejectedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const hodOverridden = (od.HodApprovedRegisterNumbers ?? od.hodApprovedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);

        if (approved.includes(myRegNo)) return 'Approved';
        if (rejected.includes(myRegNo) && !hodOverridden.includes(myRegNo)) return 'Rejected';
        return 'Pending';
    }

    function openOdModal(od) {
        const hodStatus     = od.HodStatus     ?? od.hodStatus     ?? 'Pending';
        const eventName     = od.Event         ?? od.event         ?? '';
        const college       = od.CollegeIndustry ?? od.collegeIndustry ?? '';
        const fromDate      = od.FromDate      ?? od.fromDate      ?? '';
        const toDate        = od.ToDate        ?? od.toDate        ?? '';
        const numDays       = od.NumberOfDays  ?? od.numberOfDays  ?? '';
        const reason        = od.Reason        ?? od.reason        ?? '';
        const isGroup       = od.IsGroupOd     ?? od.isGroupOd     ?? false;
        const groupName     = od.GroupName     ?? od.groupName     ?? '';
        const regNumbersRaw = od.RegisterNumbers ?? od.registerNumbers ?? '';

        // My own faculty decision — for a group OD spanning multiple
        // sections, this reflects MY OWN class staff's decision, not the
        // shared OD-level status (which stays Pending until every section
        // has decided).
        const myFacultyStatus = getMyFacultyStatus(od);
        const iAmRejected = myFacultyStatus === 'Rejected';

        // Still needed for the group member chips further down, which show
        // EVERY member's rejection state, not just mine.
        const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toLowerCase();
        const facRejected = (od.FacultyRejectedRegisterNumbers ?? od.facultyRejectedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const hodOverridden = (od.HodApprovedRegisterNumbers ?? od.hodApprovedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
        const facApproved = (od.FacultyApprovedRegisterNumbers ?? od.facultyApprovedRegisterNumbers ?? '')
            .split(',').map(r => r.trim().toLowerCase()).filter(r => r);

        // My own certificate — read from the per-member certificates[] array,
        // not the old shared CertificatePhotoUrl field, so one group member's
        // upload/verify state never bleeds into another member's view.
        const myCert         = findMyCertificate(od);
        const winningStatus  = myCert ? (myCert.WinningStatus ?? myCert.winningStatus ?? '') : '';
        const certUrl        = myCert ? (myCert.CertificatePhotoUrl ?? myCert.certificatePhotoUrl ?? '') : '';
        const certVerified   = !!(myCert && (myCert.CertificateVerified ?? myCert.certificateVerified ?? false));
        const odId           = od.OdId ?? od.odId ?? '';

        setEl('modalEventName', eventName || 'OD Request');
        setEl('modalEventNameBody', eventName || '-');
        const compType = od.CompetitionType ?? od.competitionType ?? '';
        setEl('modalCollege', college || '-');
        const modalCompEl = document.getElementById('modalCompetitionType');
        if (modalCompEl) { modalCompEl.textContent = compType || '-'; modalCompEl.closest('.modal-row').style.display = compType ? '' : 'none'; }
        setEl('modalFromDate', fmtDate(fromDate));
        setEl('modalToDate', fmtDate(toDate));
        // Start Time / End Time
        const odStartTime = od.StartTime ?? od.startTime ?? null;
        const odEndTime   = od.EndTime   ?? od.endTime   ?? null;
        setEl('modalStartTime', odStartTime ? formatTime12h(odStartTime) : '-');
        setEl('modalEndTime',   odEndTime   ? formatTime12h(odEndTime)   : '-');
        setEl('modalDays', numDays ? `${numDays}${odDateCountdownLabel(fromDate, toDate) ? ' (' + odDateCountdownLabel(fromDate, toDate) + ')' : ''}` : '-');
        // Date & Time Edited by Staff/HOD
        const isDateEdited = !!(od.IsDateEdited ?? od.isDateEdited);
        const dateEditedBy = od.DateEditedBy ?? od.dateEditedBy ?? 'Faculty/HOD';
        const modalDateEditedRow = document.getElementById('modalDateEditedRow');
        const modalDateEditedTitle = document.getElementById('modalDateEditedTitle');
        const modalDateEditedDetail = document.getElementById('modalDateEditedDetail');

        if (modalDateEditedRow) {
            if (isDateEdited) {
                if (modalDateEditedTitle) modalDateEditedTitle.textContent = `Date & Time was modified by ${dateEditedBy}`;
                const timeSpan = odStartTime ? `${formatTime12h(odStartTime)}${odEndTime ? ' – ' + formatTime12h(odEndTime) : ''}` : 'Full Day';
                if (modalDateEditedDetail) modalDateEditedDetail.textContent = `Updated: ${fmtDate(fromDate)} to ${fmtDate(toDate)} | Time: ${timeSpan}`;
                modalDateEditedRow.style.display = 'block';
            } else {
                modalDateEditedRow.style.display = 'none';
            }
        }

        // overallKey/overallLabel take MY OWN faculty status, not the raw
        // shared one — so overall correctly still shows "Awaiting HOD"/
        // "Pending" until the WHOLE OD reaches HOD, while the Faculty badge
        // below shows MY approval immediately once my own staff decides.
        const overall = iAmRejected ? 'rejected' : overallKey(myFacultyStatus, hodStatus);
        const overallBadge = document.getElementById('modalOverallBadge');
        if (overallBadge) {
            overallBadge.className = `badge-${overall}`;
            overallBadge.textContent = iAmRejected ? 'Rejected (You)' : overallLabel(myFacultyStatus, hodStatus);
        }

        const facBadge = document.getElementById('modalFacultyStatus');
        if (facBadge) {
            facBadge.className = `badge-${bdg(myFacultyStatus)}`;
            facBadge.textContent = myFacultyStatus;
        }

        const hodBadge = document.getElementById('modalHodStatus');
        if (hodBadge) {
            hodBadge.className = `badge-${bdg(hodStatus)}`;
            hodBadge.textContent = hodStatus;
        }

        // Group section — the rejected member's chip is shown in red so it's
        // clear at a glance which member(s) faculty rejected from this group OD.
        const groupSection = document.getElementById('modalGroupSection');
        if (isGroup) {
            setEl('modalGroupName', groupName || '-');
            const membersDiv = document.getElementById('modalMembers');
            if (membersDiv) {
                const members = regNumbersRaw
                    .split(',')
                    .map(r => r.trim())
                    .filter(r => r.length > 0);
                membersDiv.innerHTML = members.length
                    ? members.map(m => {
                        const isMemberRejected = facRejected.includes(m.toLowerCase()) && !hodOverridden.includes(m.toLowerCase());
                        const isMemberApproved = !isMemberRejected && facApproved.includes(m.toLowerCase());
                        const memberName = studentNameLookup[m.toLowerCase()] || '';
                        const label = memberName ? `${m} — ${escapeHtml(memberName)}` : escapeHtml(m);
                        const cls = isMemberRejected ? 'member-rejected' : isMemberApproved ? 'member-approved' : '';
                        const icon = isMemberRejected ? ' ✕' : isMemberApproved ? ' ✓' : '';
                        return `<span class="${cls}">${label}${icon}</span>`;
                    }).join('')
                    : '<span>No members listed</span>';
            }
            if (groupSection) groupSection.style.display = 'flex';
        } else {
            if (groupSection) groupSection.style.display = 'none';
        }

        // Certificate / winning status section
        const certSection = document.getElementById('modalCertSection');
        if (winningStatus || certUrl) {
            setEl('modalWinningStatus', (winningStatus || 'Not submitted yet') + (certVerified ? '  ✓ Verified by Staff' : ''));
            const certImg = document.getElementById('modalCertImage');
            if (certImg) {
                if (certUrl) {
                    const resolvedCertUrl = certUrl.startsWith('http') ? certUrl : `${API_BASE}${certUrl}`;
                    // Cache-bust the image itself so a re-uploaded certificate
                    // never shows the browser's cached copy of the old file.
                    certImg.src = `${resolvedCertUrl}${resolvedCertUrl.includes('?') ? '&' : '?'}_=${Date.now()}`;
                    certImg.style.display = 'block';
                } else {
                    certImg.style.display = 'none';
                    certImg.removeAttribute('src');
                }
            }
            if (certSection) certSection.style.display = 'flex';
        } else {
            if (certSection) certSection.style.display = 'none';
        }

        // Certificate upload button inside the modal — only once the OD is FULLY
        // APPROVED (both staff and HOD) AND the OD's dates have passed, AND
        // only while the certificate has not yet been verified by staff.
        // Once staff verifies it, the student can no longer replace it.
        const modalCertUploadBtn = document.getElementById('modalCertUploadBtn');
        if (modalCertUploadBtn) {
            const modalFullyApproved = overall === 'approved' && !iAmRejected;
            if (iAmRejected) {
                modalCertUploadBtn.style.display = 'none';
            } else if (certVerified) {
                modalCertUploadBtn.style.display = 'flex';
                modalCertUploadBtn.textContent = '✓ Certificate Verified — Locked';
                modalCertUploadBtn.disabled = true;
                modalCertUploadBtn.classList.add('cert-locked');
                modalCertUploadBtn.onclick = null;
            } else if (modalFullyApproved && isOdCompleted(toDate)) {
                modalCertUploadBtn.style.display = 'flex';
                modalCertUploadBtn.disabled = false;
                modalCertUploadBtn.classList.remove('cert-locked');
                modalCertUploadBtn.textContent = certUrl ? 'Update Certificate' : 'Upload Certificate';
                modalCertUploadBtn.onclick = () => openCertModal(odId, winningStatus, !!certUrl);
            } else {
                modalCertUploadBtn.style.display = 'none';
            }
        }

        // Print Report only makes sense for an OD that was actually approved for
        // you — a rejected member shouldn't be able to generate an approval report.
        const modalPrintBtn = document.getElementById('modalPrintBtn');
        if (modalPrintBtn) {
            if (iAmRejected) {
                modalPrintBtn.style.display = 'none';
            } else {
                modalPrintBtn.style.display = '';
                modalPrintBtn.onclick = () => printOdReport(od);
            }
        }

        if (odModal) odModal.style.display = 'flex';
    }


    // ══════════════════════════════════════════════════
    // GROUP MEMBER DYNAMIC LIST
    // ══════════════════════════════════════════════════
    window.groupMemberList = [];  // array of uppercase reg numbers

    function renderMemberList() {
        const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toUpperCase();
        const list = document.getElementById('memberList');
        const hidden = document.getElementById('registerNumbers');
        if (!list) return;

        // Ensure own reg number is always first in the list
        if (myRegNo && !window.groupMemberList.includes(myRegNo)) {
            window.groupMemberList.unshift(myRegNo);
        }

        list.innerHTML = window.groupMemberList.map((reg, i) => {
            const isSelf = reg === myRegNo;
            return `<span class="member-chip${isSelf ? ' is-self' : ''}" data-reg="${reg}">
                <span class="chip-label">${reg}${isSelf ? ' (You)' : ''}</span>
                ${!isSelf ? `<button type="button" class="chip-remove" data-index="${i}" title="Remove">×</button>` : ''}
            </span>`;
        }).join('');

        // Sync hidden field for form submission
        if (hidden) hidden.value = window.groupMemberList.join(',');

        // Update error visibility
        const errEl = document.getElementById('registerNumbers-error');
        if (errEl && window.groupMemberList.length >= 2) errEl.textContent = '';

        // Wire remove buttons
        list.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const reg = btn.closest('.member-chip').dataset.reg;
                window.groupMemberList = window.groupMemberList.filter(r => r !== reg);
                renderMemberList();
            });
        });
    }

    async function addMember() {
        const input = document.getElementById('memberRegInput');
        if (!input) return;
        const val = input.value.trim().toUpperCase();
        if (!val) { showToast('error', 'Enter a register number'); return; }
        if (window.groupMemberList.includes(val)) {
            showToast('error', `${val} is already added`);
            input.value = '';
            return;
        }

        const addBtn = document.getElementById('addMemberBtn');
        if (addBtn) addBtn.disabled = true;
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/Student/ValidateRegisterNumber/${encodeURIComponent(val)}`);

            if (res.status === 404) {
                showToast('error', 'No user found');
                return;
            }
            if (!res.ok) {
                showToast('error', 'Could not verify register number. Try again.');
                return;
            }

            window.groupMemberList.push(val);
            renderMemberList();
            input.value = '';
        } catch (err) {
            console.error('Validate register number error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            if (addBtn) addBtn.disabled = false;
            input.disabled = false;
            input.focus();
        }
    }

    document.getElementById('addMemberBtn')?.addEventListener('click', addMember);
    document.getElementById('memberRegInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addMember(); }
    });

    // Initialise with own reg number on page load
    renderMemberList();

    // ══════════════════════════════════════════════════
    // EDIT GROUP OD (only while still Pending with faculty)
    // ══════════════════════════════════════════════════
    const editGroupOdModal = document.getElementById('editGroupOdModal');
    window.editMemberList = []; // array of uppercase reg numbers, for the edit modal

    function renderEditMemberList() {
        const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toUpperCase();
        const list = document.getElementById('editMemberList');
        if (!list) return;

        list.innerHTML = window.editMemberList.map((reg, i) => {
            const isSelf = reg === myRegNo;
            return `<span class="member-chip${isSelf ? ' is-self' : ''}" data-reg="${reg}">
                <span class="chip-label">${reg}${isSelf ? ' (You)' : ''}</span>
                ${!isSelf ? `<button type="button" class="chip-remove" data-index="${i}" title="Remove">×</button>` : ''}
            </span>`;
        }).join('');

        const errEl = document.getElementById('editRegisterNumbers-error');
        if (errEl && window.editMemberList.length >= 2) errEl.textContent = '';

        list.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const reg = btn.closest('.member-chip').dataset.reg;
                window.editMemberList = window.editMemberList.filter(r => r !== reg);
                renderEditMemberList();
            });
        });
    }

    async function addEditMember() {
        const input = document.getElementById('editMemberRegInput');
        if (!input) return;
        const val = input.value.trim().toUpperCase();
        if (!val) { showToast('error', 'Enter a register number'); return; }
        if (window.editMemberList.includes(val)) {
            showToast('error', `${val} is already added`);
            input.value = '';
            return;
        }

        const addBtn = document.getElementById('editAddMemberBtn');
        if (addBtn) addBtn.disabled = true;
        input.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/Student/ValidateRegisterNumber/${encodeURIComponent(val)}`);
            if (res.status === 404) {
                showFieldError(input, 'editRegisterNumbers-error', 'No user found with this register number');
                showToast('error', 'No user found');
                return;
            }
            if (!res.ok) {
                showToast('error', 'Could not verify register number. Try again.');
                return;
            }
            window.editMemberList.push(val);
            renderEditMemberList();
            input.value = '';
        } catch (err) {
            console.error('Validate register number error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            if (addBtn) addBtn.disabled = false;
            input.disabled = false;
            input.focus();
        }
    }

    document.getElementById('editAddMemberBtn')?.addEventListener('click', addEditMember);
    document.getElementById('editMemberRegInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addEditMember(); }
    });

    function openEditGroupOdModal(od) {
        const rawFacultyStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
        const rawHodStatus = od.HodStatus ?? od.hodStatus ?? 'Pending';
        if (rawFacultyStatus === 'Approved' && rawHodStatus === 'Approved') {
            showToast('error', 'This OD has already been approved and cannot be edited.');
            return;
        }

        const isGroup = !!(od.IsGroupOd ?? od.isGroupOd);
        const modalTitle = document.querySelector('#editGroupOdModal .modal-header h3');
        if (modalTitle) modalTitle.textContent = isGroup ? 'Edit Group OD' : 'Edit OD Application';

        const groupNameRow = document.getElementById('editGroupName')?.closest('.modal-row');
        const memberListRow = document.getElementById('editMemberList')?.closest('.modal-row');
        if (groupNameRow) groupNameRow.style.display = isGroup ? 'block' : 'none';
        if (memberListRow) memberListRow.style.display = isGroup ? 'block' : 'none';

        const odId = od.OdId ?? od.odId ?? '';
        document.getElementById('editOdId').value = odId;
        if (editGroupOdModal) editGroupOdModal.dataset.isgroup = isGroup ? 'true' : 'false';

        document.getElementById('editGroupFromDate').value = toInputDateStr(od.FromDate ?? od.fromDate);
        document.getElementById('editGroupToDate').value = toInputDateStr(od.ToDate ?? od.toDate);
        document.getElementById('editGroupCollegeName').value = od.CollegeIndustry ?? od.collegeIndustry ?? '';
        document.getElementById('editGroupEventName').value = od.Event ?? od.event ?? '';
        document.getElementById('editGroupCompetitionType').value = od.CompetitionType ?? od.competitionType ?? '';
        document.getElementById('editGroupName').value = od.GroupName ?? od.groupName ?? '';
        document.getElementById('editGroupReason').value = od.Reason ?? od.reason ?? '';

        const userReg = (localStorage.getItem('registerNumber') || '').trim().toUpperCase();
        const regNumbersRaw = od.RegisterNumbers ?? od.registerNumbers ?? userReg;
        window.editMemberList = regNumbersRaw
            ? regNumbersRaw.split(',').map(r => r.trim().toUpperCase()).filter(Boolean)
            : (userReg ? [userReg] : []);
        renderEditMemberList();

        if (editGroupOdModal) {
            const banner = document.getElementById('editOdErrorBanner');
            if (banner) { banner.textContent = ''; banner.style.display = 'none'; }
            editGroupOdModal.style.display = 'flex';
        }
    }

    function toInputDateStr(raw) {
        if (!raw) return '';
        const d = new Date(raw);
        if (isNaN(d.getTime())) return raw;
        return d.toISOString().split('T')[0];
    }

    document.getElementById('editGroupFromDate')?.addEventListener('change', (e) => {
        guardWeekendInput(e.target, 'editGroupFromDate-error', 'From Date');
    });
    document.getElementById('editGroupToDate')?.addEventListener('change', (e) => {
        guardWeekendInput(e.target, 'editGroupToDate-error', 'To Date');
    });

    document.getElementById('editGroupOdCloseBtn')?.addEventListener('click', () => {
        if (editGroupOdModal) editGroupOdModal.style.display = 'none';
    });
    editGroupOdModal?.addEventListener('click', (e) => {
        if (e.target === editGroupOdModal) editGroupOdModal.style.display = 'none';
    });

    document.getElementById('editGroupOdForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        function showEditError(msg) {
            const banner = document.getElementById('editOdErrorBanner');
            if (banner) {
                banner.textContent = msg;
                banner.style.display = 'flex';
                banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            showToast('error', msg);
        }
        function clearEditError() {
            const banner = document.getElementById('editOdErrorBanner');
            if (banner) { banner.textContent = ''; banner.style.display = 'none'; }
        }

        clearEditError();

        const odId = document.getElementById('editOdId').value;
        const isGroup = editGroupOdModal?.dataset.isgroup === 'true';
        const fromDate = document.getElementById('editGroupFromDate').value;
        const toDate = document.getElementById('editGroupToDate').value;
        const college = document.getElementById('editGroupCollegeName').value.trim();
        const event = document.getElementById('editGroupEventName').value.trim();
        const competitionType = document.getElementById('editGroupCompetitionType').value;
        const groupName = document.getElementById('editGroupName').value.trim();
        const reason = document.getElementById('editGroupReason').value.trim();

        if (!fromDate || !toDate || !college || !event || !competitionType || !reason || (isGroup && !groupName)) {
            showEditError('All fields are required. Please fill in every field before saving.'); return;
        }
        if (isGroup && window.editMemberList.length < 2) {
            showEditError('Add at least 2 group members.'); return;
        }
        if (fromDate > toDate) {
            showEditError('To date must be after from date.'); return;
        }
        if (isWeekend(fromDate) && !window.confirmedNonWorkingDates.has(`editGroupFromDate_${fromDate}`)) {
            guardWeekendInput(document.getElementById('editGroupFromDate'), 'editGroupFromDate-error', 'From Date');
            return;
        }
        if (isWeekend(toDate) && !window.confirmedNonWorkingDates.has(`editGroupToDate_${toDate}`)) {
            guardWeekendInput(document.getElementById('editGroupToDate'), 'editGroupToDate-error', 'To Date');
            return;
        }
        if (reason.length < 5) {
            showEditError('Reason is too short — please provide more detail.'); return;
        }

        const days = countWorkingDays(fromDate, toDate);
        if (days <= 0) {
            showEditError('The selected date range contains no college working days.'); return;
        }

        const userReg = (localStorage.getItem('registerNumber') || '').trim().toUpperCase();
        const finalMembers = isGroup ? window.editMemberList : (userReg ? [userReg] : []);

        const submitBtn = document.getElementById('editGroupOdSubmitBtn');
        const btnText = submitBtn?.querySelector('.btn-text');
        const btnLoader = submitBtn?.querySelector('.btn-loader');
        if (btnText) btnText.style.display = 'none';
        if (btnLoader) btnLoader.style.display = 'inline';
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/EditGroupOd`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromDate, toDate, numberOfDays: days,
                    event, collegeIndustry: college, competitionType,
                    reason, groupName: isGroup ? groupName : 'Solo OD',
                    registerNumbers: finalMembers.join(',')
                })
            });

            if (res.ok) {
                showToast('success', 'OD application updated successfully!');
                const banner = document.getElementById('editOdErrorBanner');
                if (banner) { banner.textContent = ''; banner.style.display = 'none'; }
                if (editGroupOdModal) editGroupOdModal.style.display = 'none';
                await loadODStatus();
            } else {
                const errText = await res.text();
                console.error('Edit OD failed:', res.status, errText);
                const errMsg = errText || `Failed to update OD (${res.status})`;
                showEditError(errMsg);
            }
        } catch (err) {
            console.error('Edit OD network error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            if (btnText) btnText.style.display = 'inline';
            if (btnLoader) btnLoader.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    function escapeCompType(t) {
        const icons = { hackathon: '⚡', cultural: '🎭', sports: '🏆', technical: '💡', 'paper presentation': '📄', workshop: '🔧', symposium: '🎓', other: '🏅' };
        const key = (t || '').toLowerCase();
        return (icons[key] || '🏅') + ' ' + t;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Print Report: opens od_report.html and fills it with this OD's data ──
    function printOdReport(od) {
        if (!od) {
            showToast('error', 'No OD data available to print');
            return;
        }
        // The OD's own Section field reflects whichever student CREATED it —
        // for a group OD, a member from a different section (e.g. a
        // Section-A student included in a Section-B student's group) must
        // still see THEIR OWN class staff's name on their report, not the
        // creator's. Override with the currently logged-in viewer's own
        // section before handing the data to the report page.
        const odId = od.OdId ?? od.odId ?? '';
        const actualSection = od.Section || od.section || localStorage.getItem('userSection') || '';
        const odForReport = { ...od, Section: actualSection, section: actualSection };

        // Save to storage so od_report.html can self-load reliably regardless of cross-window restrictions
        try {
            sessionStorage.setItem('currentOdReport', JSON.stringify(odForReport));
            localStorage.setItem('currentOdReport', JSON.stringify(odForReport));
        } catch (e) {
            console.warn('Could not save OD report to storage:', e);
        }

        const reportUrl = odId ? `od_report.html?odId=${encodeURIComponent(odId)}` : 'od_report.html';
        const reportWindow = window.open(reportUrl, '_blank');
        if (!reportWindow) {
            showToast('error', 'Please allow pop-ups to print the OD report');
            return;
        }
        const tryFill = () => {
            try {
                if (typeof reportWindow.fillOdReport === 'function') {
                    reportWindow.fillOdReport(odForReport);
                } else {
                    setTimeout(tryFill, 100);
                }
            } catch (err) {
                // Cross-window access blocked; od_report.html self-loads from storage/URL
            }
        };
        reportWindow.addEventListener('load', tryFill);
        tryFill();
    }

    // ── Certificate Upload Modal ──
    // Posts multipart/form-data to:
    //     POST {API_BASE}/api/OdApply/{odId}/UploadCertificate
    //     fields: photo (file), winningStatus (text)
    // Matches OdApplyController.UploadCertificate(int odId, [FromForm] string winningStatus, IFormFile photo)
    const certModal = document.getElementById('certUploadModal');
    let certUploadOdId = null;
    let certUploadHasExisting = false;

    document.getElementById('certModalCloseBtn')?.addEventListener('click', closeCertModal);
    certModal?.addEventListener('click', (e) => {
        if (e.target === certModal) closeCertModal();
    });

    function closeCertModal() {
        if (certModal) certModal.style.display = 'none';
        certUploadOdId = null;
        certUploadHasExisting = false;
    }

    function openCertModal(odId, existingWinningStatus, hasExisting) {
        // A certificate already exists for this OD — warn before letting the
        // student open the replace form, so the old file is never lost by accident.
        if (hasExisting) {
            const confirmed = confirm(
                'A certificate has already been uploaded for this OD.\n\n' +
                'Uploading a new file will PERMANENTLY REPLACE the existing one — it cannot be recovered.\n\n' +
                'Do you want to continue and replace it?'
            );
            if (!confirmed) return;
        }
        certUploadOdId = odId;
        certUploadHasExisting = !!hasExisting;
        const wsInput = document.getElementById('certWinningStatus');
        if (wsInput) wsInput.value = existingWinningStatus || '';
        const fileInput = document.getElementById('certFile');
        if (fileInput) fileInput.value = '';
        const fileNameLabel = document.getElementById('certFileName');
        if (fileNameLabel) fileNameLabel.textContent = 'No file chosen';
        if (certModal) certModal.style.display = 'flex';
    }

    document.getElementById('certFile')?.addEventListener('change', (e) => {
        const fileNameLabel = document.getElementById('certFileName');
        const file = e.target.files?.[0];
        if (fileNameLabel) fileNameLabel.textContent = file ? file.name : 'No file chosen';
    });

    document.getElementById('certUploadForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!certUploadOdId) return;

        const fileInput = document.getElementById('certFile');
        const file = fileInput?.files?.[0];
        const winningStatus = document.getElementById('certWinningStatus')?.value.trim() || '';

        if (!file) { showToast('error', 'Please choose a certificate file'); return; }

        const myRegNo = localStorage.getItem('registerNumber') || '';
        const formData = new FormData();
        formData.append('winningStatus', winningStatus);
        formData.append('registerNumber', myRegNo);
        formData.append('photo', file);

        const submitBtn = document.getElementById('certUploadSubmitBtn');
        const submitText = submitBtn?.querySelector('.btn-text');
        const submitLoader = submitBtn?.querySelector('.btn-loader');
        if (submitText) submitText.style.display = 'none';
        if (submitLoader) submitLoader.style.display = 'inline';
        if (submitBtn) submitBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${certUploadOdId}/UploadCertificate`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                showToast('success', 'Certificate uploaded successfully!');
                closeCertModal();
                closeOdModal();
                loadODStatus();
            } else {
                const errText = await res.text();
                console.error('Certificate upload failed:', res.status, errText);
                showToast('error', `Failed to upload certificate (${res.status})`);
            }
        } catch (err) {
            console.error('Certificate upload network error:', err);
            showToast('error', 'Network error — check backend is running');
        } finally {
            if (submitText) submitText.style.display = 'inline';
            if (submitLoader) submitLoader.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
        }
    });

    // ── Has the OD's date range fully passed? (used to gate certificate upload) ──
    function isOdCompleted(toDateRaw) {
        if (!toDateRaw) return false;
        const to = new Date(toDateRaw);
        if (isNaN(to.getTime())) return false;
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);
        return to.getTime() < todayMidnight.getTime();
    }

    // ── Human-readable "how many days until/since this OD" label ──
    // Shown on the status card so a student can see at a glance whether an
    // OD hasn't started yet, is happening today/now, or already finished —
    // based on the OD's own From/To dates, independent of approval status.
    function odDateCountdownLabel(fromDateRaw, toDateRaw) {
        const from = fromDateRaw ? new Date(fromDateRaw) : null;
        const to   = toDateRaw   ? new Date(toDateRaw)   : null;
        if (!from || isNaN(from.getTime()) || !to || isNaN(to.getTime())) return '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        from.setHours(0, 0, 0, 0);
        to.setHours(0, 0, 0, 0);

        const msPerDay = 24 * 60 * 60 * 1000;

        if (today < from) {
            const daysUntilStart = Math.round((from - today) / msPerDay);
            return daysUntilStart === 1 ? 'Starts tomorrow' : `Starts in ${daysUntilStart} days`;
        }
        if (today >= from && today <= to) {
            return 'Ongoing';
        }
        const daysSinceEnd = Math.round((today - to) / msPerDay);
        return daysSinceEnd === 1 ? 'Completed yesterday' : `Completed ${daysSinceEnd} days ago`;
    }

    // ── Cancel/withdraw an OD before staff has reviewed it ──
    // Only shown (see canCancel above) while FacultyStatus is still
    // "Pending". The server re-checks this too before deleting, so this
    // is not the only line of defence — just a friendlier UX gate.
    async function cancelOdApplication(odId, od) {
        const eventName = od.Event ?? od.event ?? 'this OD';
        const confirmed = window.confirm(
            `Cancel your OD request for "${eventName}"?\n\nThis cannot be undone. You can only cancel while staff has not yet reviewed it.`
        );
        if (!confirmed) return;

        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}`, { method: 'DELETE' });

            if (res.ok) {
                showToast('success', 'OD request cancelled.');
                loadODStatus();
                return;
            }

            // 400 = already reviewed by staff (race condition with the poll),
            // 404 = already deleted/gone. Either way, refresh the list so
            // the card reflects reality instead of leaving a stale button.
            let message = 'Could not cancel this OD.';
            try {
                const body = await res.json();
                message = (typeof body === 'string') ? body : (body?.message || body?.title || message);
            } catch (_) { /* no JSON body */ }

            showToast('error', message);
            loadODStatus();
        } catch (err) {
            console.error('cancelOdApplication error:', err);
            showToast('error', 'Network error — could not cancel OD.');
        }
    }

    function showRejectionToast(eventName, rejectedBy, odId) {
        const title = "OD Request Rejected";
        const label = eventName ? ` (${eventName})` : (odId ? ` (OD #${odId})` : '');
        const message = `Your OD request${label} was rejected by ${rejectedBy || 'Faculty/HOD'}.`;
        showToast('error', message, title);
    }

    // ── Load OD Status (solo + group, via register number) ──
    async function loadODStatus() {
        const list  = document.getElementById('statusList');
        const empty = document.getElementById('emptyState');

        if (!list) { console.error('statusList element not found'); return; }

        list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading your OD requests...</div>';
        if (empty) empty.style.display = 'none';

        const registerNumber = localStorage.getItem('registerNumber') || '';
        // Cache-bust: append a timestamp so browsers/proxies never serve a stale
        // cached response (this was the cause of the "certificate disappears"
        // bug — the student page would show a stale pre-upload snapshot after
        // navigating back, making it look like the upload failed).
        const url = `${API_BASE}/api/OdApply/ByRegister/${encodeURIComponent(registerNumber)}?_=${Date.now()}`;
        console.log('Fetching OD status from:', url);

        try {
            const res = await fetch(url, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            console.log('OD status response code:', res.status);

            if (!res.ok) {
                list.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">
                    Server error ${res.status} — check backend console</div>`;
                return;
            }

            const ods = await res.json();
            console.log('ODs received from API:', ods);

            // Store the full list so card clicks can look up full details without refetching
            window.currentOdList = ods;

            if (!ods || ods.length === 0) {
                list.innerHTML = '';
                if (empty) empty.style.display = 'flex';
                return;
            }

            if (empty) empty.style.display = 'none';

            const myRegNo = (localStorage.getItem('registerNumber') || '').trim().toLowerCase();

            list.innerHTML = ods.map(od => {
                const hodStatus     = od.HodStatus     ?? od.hodStatus     ?? 'Pending';
                const eventName     = od.Event         ?? od.event         ?? '';
                const college       = od.CollegeIndustry ?? od.collegeIndustry ?? '';
                const fromDate      = od.FromDate      ?? od.fromDate      ?? '';
                const toDate        = od.ToDate        ?? od.toDate        ?? '';
                const numDays       = od.NumberOfDays  ?? od.numberOfDays  ?? '';
                const isGroup       = od.IsGroupOd     ?? od.isGroupOd     ?? false;
                const groupName     = od.GroupName     ?? od.groupName     ?? '';
                const odId          = od.OdId ?? od.odId ?? '';
                // My own certificate for this OD — per-member, from certificates[].
                const myCertRow     = findMyCertificate(od);
                const certUrl       = myCertRow ? (myCertRow.CertificatePhotoUrl ?? myCertRow.certificatePhotoUrl ?? '') : '';

                // My own faculty decision — for a group OD spanning multiple
                // sections, this is MY OWN class staff's decision, which can
                // already be "Approved" even while the OD-level FacultyStatus
                // is still "Pending" (waiting on another section's staff).
                const myFacultyStatus = getMyFacultyStatus(od);
                const iAmRejected = myFacultyStatus === 'Rejected';

                const overall = iAmRejected ? 'rejected' : overallKey(myFacultyStatus, hodStatus);

                // Can still be cancelled by the student ONLY while no staff
                // has acted on it yet at all (matches the server-side check
                // in DeleteOdApplyAsync — OD-level FacultyStatus, not just
                // "my own" status, since a group OD can have one section
                // already decided even while mine is still Pending).
                const rawFacultyStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
                const canCancel = rawFacultyStatus === 'Pending';

                const myRegUpper = (localStorage.getItem('registerNumber') || '').trim().toUpperCase();
                const groupTag = isGroup
                    ? `<span class="status-program" style="margin-left:8px">Group: ${groupName}</span>`
                    : '';
                const myStatusTag = iAmRejected
                    ? `<span class="badge-rejected" style="margin-left:6px">Your OD: Rejected</span>`
                    : '';

                // One-time top-right toast notification for this student's rejection on this OD.
                // Guarded with persistent storage so it fires exactly once per rejection event.
                if (iAmRejected) {
                    const persistentKey = `od_rejection_notified_${odId}_${myRegUpper}`;
                    const alertKey = `odRejectNotice_${odId}_${myRegUpper}`;
                    const fallbackKey = `odRejectNotice_${odId}`;
                    const legacyKey = `odRejectSeen_${odId}_${myRegUpper}`;
                    const legacyFallback = `odRejectSeen_${odId}`;
                    if (!localStorage.getItem(persistentKey) &&
                        !localStorage.getItem(alertKey) && !localStorage.getItem(fallbackKey) &&
                        !localStorage.getItem(legacyKey) && !localStorage.getItem(legacyFallback)) {
                        localStorage.setItem(persistentKey, '1');
                        localStorage.setItem(alertKey, '1');
                        localStorage.setItem(fallbackKey, '1');
                        localStorage.setItem(legacyKey, '1');
                        localStorage.setItem(legacyFallback, '1');
                        setTimeout(() => showRejectionToast(eventName, 'faculty', odId), 100);
                    }
                } else if (hodStatus === 'Rejected') {
                    // Whole OD (solo or group) rejected at the HOD stage.
                    const persistentKey = `od_hod_rejection_notified_${odId}_${myRegUpper}`;
                    const alertKey = `odHodRejectNotice_${odId}_${myRegUpper}`;
                    const fallbackKey = `odHodRejectNotice_${odId}`;
                    const legacyKey = `odHodRejectSeen_${odId}_${myRegUpper}`;
                    const legacyFallback = `odHodRejectSeen_${odId}`;
                    if (!localStorage.getItem(persistentKey) &&
                        !localStorage.getItem(alertKey) && !localStorage.getItem(fallbackKey) &&
                        !localStorage.getItem(legacyKey) && !localStorage.getItem(legacyFallback)) {
                        localStorage.setItem(persistentKey, '1');
                        localStorage.setItem(alertKey, '1');
                        localStorage.setItem(fallbackKey, '1');
                        localStorage.setItem(legacyKey, '1');
                        localStorage.setItem(legacyFallback, '1');
                        setTimeout(() => showRejectionToast(eventName, 'HOD', odId), 100);
                    }
                }

                // Certificate upload is only offered once the OD is FULLY
                // APPROVED (both staff and HOD) AND the OD's own dates have
                // passed — and never once staff has verified the certificate.
                const fullyApproved = overall === 'approved' && !iAmRejected;
                const completed = isOdCompleted(toDate);
                const dateCountdownText = odDateCountdownLabel(fromDate, toDate);
                const certVerified = !!(myCertRow && (myCertRow.CertificateVerified ?? myCertRow.certificateVerified ?? false));
                const certBtnHtml = certVerified
                    ? `<span class="cert-locked-badge" title="Certificate verified by staff — can no longer be changed">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                <polyline points="22 4 12 14.01 9 11.01"/>
                            </svg>
                            Certificate Verified
                        </span>`
                    : (fullyApproved && completed)
                    ? `<button type="button" class="upload-cert-btn ${certUrl ? 'has-cert' : ''}" data-odid="${odId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            ${certUrl ? 'Update Certificate' : 'Upload Certificate'}
                        </button>`
                    : '';

                const isDateEdited = !!(od.IsDateEdited ?? od.isDateEdited);
                const dateEditedBy = od.DateEditedBy ?? od.dateEditedBy ?? 'Faculty/HOD';
                const startTimeStr = od.StartTime ?? od.startTime ?? null;
                const endTimeStr   = od.EndTime   ?? od.endTime   ?? null;
                const timeSpanText = startTimeStr ? `${formatTime12h(startTimeStr)}${endTimeStr ? ' – ' + formatTime12h(endTimeStr) : ''}` : '';

                const dateEditedBannerHtml = isDateEdited ? `
                    <div class="date-edited-alert-banner">
                        <div class="alert-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                        </div>
                        <div class="alert-text">
                            <strong>Date &amp; Time was modified by ${escapeHtml(dateEditedBy)}</strong>
                            <span>Updated: ${fmtDate(fromDate)} to ${fmtDate(toDate)}${timeSpanText ? ' | Time: ' + timeSpanText : ''}</span>
                        </div>
                    </div>` : '';

                const isStaffApproved = (myFacultyStatus === 'Approved');
                const isHodApproved = (hodStatus === 'Approved');
                const canEdit = !isStaffApproved && !isHodApproved;

                return `
                <div class="od-status-card" data-overall="${overall}" data-odid="${odId}">
                    ${dateEditedBannerHtml}
                    <div class="card-top">
                        <div>
                            <h4>${eventName} ${groupTag} ${myStatusTag}</h4>
                            <p>${college}</p>
                        </div>
                        <span class="badge-${overall}">${iAmRejected ? 'Rejected' : overallLabel(myFacultyStatus, hodStatus)}</span>
                    </div>
                    <div class="card-meta">
                        <span><strong>From:</strong> ${fmtDate(fromDate)}</span>
                        <span><strong>To:</strong> ${fmtDate(toDate)}</span>
                        <span><strong>Days:</strong> ${numDays}</span>
                        ${dateCountdownText ? `<span class="od-countdown-tag">${dateCountdownText}</span>` : ''}
                    </div>
                    <div class="status-row">
                        <div class="status-item">
                            <strong>Faculty:</strong>
                            <span class="badge-${bdg(myFacultyStatus)}">${myFacultyStatus}</span>
                        </div>
                        <div class="status-item">
                            <strong>HOD:</strong>
                            <span class="badge-${bdg(hodStatus)}">${hodStatus}</span>
                        </div>
                    </div>
                    <div class="card-actions">
                        <button type="button" class="view-details-btn" data-odid="${odId}">View Details</button>
                        ${iAmRejected ? '' : `
                        <button type="button" class="print-report-btn" data-odid="${odId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                <polyline points="6 9 6 2 18 2 18 9"/>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                                <rect x="6" y="14" width="12" height="8"/>
                            </svg>
                            Print Report
                        </button>`}
                        ${certBtnHtml}
                        ${canEdit ? `
                        <button type="button" class="edit-group-od-btn" data-odid="${odId}" title="Edit and resubmit this OD request">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Edit OD
                        </button>` : ''}
                        ${canCancel ? `
                        <button type="button" class="cancel-od-btn" data-odid="${odId}" title="Withdraw this OD request before staff reviews it">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                            Cancel OD
                        </button>` : ''}
                    </div>
                </div>`;
            }).join('');

            const activeFilter = document.querySelector('.filter-btn.active');
            if (activeFilter) filterCards(activeFilter.dataset.filter);

        } catch (err) {
            console.error('loadODStatus error:', err);
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">
                Network error — make sure backend is running on ${API_BASE}</div>`;
        }
    }

    // ── Delegated clicks on the status list: view details + print report + upload certificate ──
    document.getElementById('statusList')?.addEventListener('click', (e) => {
        const odId = e.target.closest('[data-odid]')?.dataset.odid;
        if (odId === undefined) return;

        const od = (window.currentOdList || []).find(
            o => String(o.OdId ?? o.odId ?? '') === String(odId)
        );
        if (!od) { showToast('error', 'Could not find OD details'); return; }

        if (e.target.closest('.print-report-btn')) {
            e.stopPropagation();
            printOdReport(od);
            return;
        }

        if (e.target.closest('.cancel-od-btn')) {
            e.stopPropagation();
            cancelOdApplication(odId, od);
            return;
        }

        if (e.target.closest('.edit-group-od-btn')) {
            e.stopPropagation();
            openEditGroupOdModal(od);
            return;
        }

        if (e.target.closest('.upload-cert-btn')) {
            e.stopPropagation();
            const myCert = findMyCertificate(od);
            const winningStatus = myCert ? (myCert.WinningStatus ?? myCert.winningStatus ?? '') : '';
            const certUrl = myCert ? (myCert.CertificatePhotoUrl ?? myCert.certificatePhotoUrl ?? '') : '';
            openCertModal(odId, winningStatus, !!certUrl);
            return;
        }

        if (e.target.closest('.view-details-btn') || e.target.closest('.od-status-card')) {
            openOdModal(od);
        }
    });

    // ── Helpers ──
    function overallKey(f, h) {
        if (h === 'Approved') return 'approved';
        if (h === 'Rejected' || f === 'Rejected') return 'rejected';
        return 'pending';
    }

    function overallLabel(f, h) {
        if (h === 'Approved') return 'Fully Approved ✓';
        if (h === 'Rejected') return 'Rejected by HOD';
        if (f === 'Rejected') return 'Rejected by Faculty';
        if (f === 'Approved') return 'Awaiting HOD';
        return 'Pending';
    }

    function bdg(s) {
        return s === 'Approved' ? 'approved' : s === 'Rejected' ? 'rejected' : 'pending';
    }

    function fmtDate(d) {
        if (!d) return '';
        try {
            const dt = new Date(d);
            return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB');
        } catch { return d; }
    }

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '';
    }

    function setBtnLoading(on) {
        const btn = document.getElementById('submitOdBtn');
        if (!btn) return;
        const t = btn.querySelector('.btn-text');
        const l = btn.querySelector('.btn-loader');
        if (t) t.style.display = on ? 'none'   : 'inline';
        if (l) l.style.display = on ? 'inline' : 'none';
        btn.disabled = on;
    }

    function showToast(type, msg, title) {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;

        const icons = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;min-width:20px;margin-top:2px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;min-width:20px;margin-top:2px;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            info: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;min-width:20px;margin-top:2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
        };

        const iconHtml = icons[type] || icons.error;
        const titleHtml = title ? `<div style="font-weight:700;font-size:0.92rem;margin-bottom:3px;line-height:1.2;">${title}</div>` : '';

        t.innerHTML = `
            ${iconHtml}
            <div style="display:flex;flex-direction:column;flex:1;">
                ${titleHtml}
                <span class="toast-message" style="font-size:0.86rem;line-height:1.4;opacity:0.9;">${msg}</span>
            </div>
            <button class="toast-close" aria-label="Close" style="background:none;border:none;cursor:pointer;opacity:0.6;padding:4px;display:flex;align-items:center;margin-left:8px;color:inherit;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        c.appendChild(t);

        const closeBtn = t.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.onclick = () => {
                t.classList.add('toast-exit');
                setTimeout(() => t.remove(), 300);
            };
        }

        setTimeout(() => {
            if (t.parentNode) {
                t.classList.add('toast-exit');
                setTimeout(() => t.remove(), 300);
            }
        }, 5000);
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        // Preserve the "rejection alert already seen" markers across logout —
        // otherwise clearing localStorage wipes them out and the rejection
        // popup incorrectly fires again the next time this student logs in.
        const seenEntries = Object.keys(localStorage)
            .filter(k => k.startsWith('od_rejection_') || k.startsWith('od_hod_rejection_') || k.startsWith('odReject') || k.startsWith('odHodReject'))
            .map(k => [k, localStorage.getItem(k)]);

        localStorage.clear();

        seenEntries.forEach(([k, v]) => localStorage.setItem(k, v));

        window.location.href = 'index.html';
    });

    // Attach Circular Analog Clock Picker to time inputs
    if (typeof AnalogClockPicker !== 'undefined') {
        AnalogClockPicker.attach(document.getElementById('startTime'));
        AnalogClockPicker.attach(document.getElementById('endTime'));
        AnalogClockPicker.attach(document.getElementById('groupStartTime'));
        AnalogClockPicker.attach(document.getElementById('groupEndTime'));
    }
});