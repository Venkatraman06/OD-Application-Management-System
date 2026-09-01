const API_BASE = 'http://localhost:5088';

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

document.addEventListener('DOMContentLoaded', async () => {
    loadStudentNameLookup();

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

            setEl('studentName',   name);
            setEl('studentDept',   sect ? `${dept} • Section ${sect}` : dept);
            setEl('studentRollNo', regNo);
            setEl('studentYear',   `Year ${yr} / Sem ${sem}`);

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

    // Restrict the native date pickers to the published calendar period
    // so students can't even scroll to an out-of-range date.
    ['fromDate', 'toDate', 'groupFromDate', 'groupToDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el && workingDaysCalendar) {
            el.min = workingDaysCalendar.minDate;
            el.max = workingDaysCalendar.maxDate;
        }
    });

    /** true if the given YYYY-MM-DD date string is NOT a published college working day */
    function isWeekend(dateStr) {
        if (!dateStr) return false;
        if (!workingDaysCalendar) return false; // fail open if calendar failed to load
        return !workingDaysCalendar.isWorkingDay(dateStr);
    }

    /** counts only published working days (inclusive) between two YYYY-MM-DD strings */
    function countWorkingDays(fromStr, toStr) {
        if (!workingDaysCalendar) return 0;
        return workingDaysCalendar.countWorkingDays(fromStr, toStr);
    }

    /**
     * Guards a date input against non-working-day selection.
     * If the picked date is a holiday, weekend, or outside the published
     * semester calendar, clears the field, shows an inline error, and a toast.
     * Returns true if the value was valid (or empty), false if it was cleared.
     */
    function guardWeekendInput(inputEl, errorElId, label) {
        if (!inputEl) return true;
        const val = inputEl.value;
        if (!val) { clearFieldError(inputEl, errorElId); return true; }
        if (workingDaysCalendar && workingDaysCalendar.isOutsideCalendar(val)) {
            inputEl.value = '';
            showFieldError(inputEl, errorElId, `${label} is outside the published college working-days calendar (${workingDaysCalendar.minDate} to ${workingDaysCalendar.maxDate}).`);
            showToast('error', `${label} is outside the current college calendar.`);
            return false;
        }
        if (isWeekend(val)) {
            inputEl.value = '';
            showFieldError(inputEl, errorElId, `${label} is not a college working day (holiday/weekend) — OD is only for working days.`);
            showToast('error', `${label} must be a college working day.`);
            return false;
        }
        clearFieldError(inputEl, errorElId);
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

    // ── Auto-calculate days (solo OD) — working days only ──
    const fromEl = document.getElementById('fromDate');
    const toEl   = document.getElementById('toDate');
    const daysEl = document.getElementById('numberOfDays');

    function calcDays() {
        if (fromEl && toEl && fromEl.value && toEl.value && fromEl.value <= toEl.value) {
            const d = countWorkingDays(fromEl.value, toEl.value);
            if (daysEl) {
                daysEl.value = d > 0 ? (d + (d === 1 ? ' working day' : ' working days')) : '0 working days (range covers no published working days)';
            }
        } else {
            if (daysEl) daysEl.value = '';
        }
    }
    if (fromEl) fromEl.addEventListener('change', () => { guardWeekendInput(fromEl, 'fromDate-error', 'From Date'); calcDays(); });
    if (toEl)   toEl.addEventListener('change',   () => { guardWeekendInput(toEl,   'toDate-error',   'To Date');   calcDays(); });

    // ── Auto-calculate days (group OD) — working days only ──
    const groupFromEl = document.getElementById('groupFromDate');
    const groupToEl   = document.getElementById('groupToDate');
    const groupDaysEl = document.getElementById('groupNumberOfDays');

    function calcGroupDays() {
        if (groupFromEl && groupToEl && groupFromEl.value && groupToEl.value && groupFromEl.value <= groupToEl.value) {
            const d = countWorkingDays(groupFromEl.value, groupToEl.value);
            if (groupDaysEl) {
                groupDaysEl.value = d > 0 ? (d + (d === 1 ? ' working day' : ' working days')) : '0 working days (range covers no published working days)';
            }
        } else {
            if (groupDaysEl) groupDaysEl.value = '';
        }
    }
    if (groupFromEl) groupFromEl.addEventListener('change', () => { guardWeekendInput(groupFromEl, 'groupFromDate-error', 'From Date'); calcGroupDays(); });
    if (groupToEl)   groupToEl.addEventListener('change',   () => { guardWeekendInput(groupToEl,   'groupToDate-error',   'To Date');   calcGroupDays(); });

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

    // ── Auto-refresh status while tab is open ──
    let statusPollInterval = null;
    function startStatusPolling() {
        if (statusPollInterval) clearInterval(statusPollInterval);
        statusPollInterval = setInterval(() => {
            if (document.getElementById('apply-status')?.classList.contains('active')) {
                loadODStatus();
            }
        }, 15000);
    }
    startStatusPolling();

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

    // ── Solo OD Form Submit ──
    document.getElementById('odForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fromDate = fromEl ? fromEl.value : '';
        const toDate   = toEl   ? toEl.value   : '';
        const event    = document.getElementById('eventName')?.value.trim()   || '';
        const college  = document.getElementById('collegeName')?.value.trim() || '';
        const reason   = document.getElementById('reason')?.value.trim()      || '';
        const competitionType = document.getElementById('competitionType')?.value || '';

        if (!fromDate || !toDate || !event || !college || !reason || !competitionType) {
            showToast('error', 'All fields required'); return;
        }
        if (fromDate > toDate) {
            showToast('error', 'To date must be after from date'); return;
        }
        // Final guard — re-check weekends at submit time in case of manual typing/paste
        if (isWeekend(fromDate)) {
            showFieldError(fromEl, 'fromDate-error', 'From Date cannot be a weekend — OD is only for working days.');
            showToast('error', 'From Date must be a working day (Mon–Fri).'); return;
        }
        if (isWeekend(toDate)) {
            showFieldError(toEl, 'toDate-error', 'To Date cannot be a weekend — OD is only for working days.');
            showToast('error', 'To Date must be a working day (Mon–Fri).'); return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
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
            reason
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
                switchTab('apply-status');
            } else {
                const errText = await res.text();
                console.error('Submit failed:', res.status, errText);
                showToast('error', `Failed to submit OD (${res.status})`);
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
        const event    = document.getElementById('groupEventName')?.value.trim()   || '';
        const college  = document.getElementById('groupCollegeName')?.value.trim() || '';
        const reason   = document.getElementById('groupReason')?.value.trim()      || '';
        const groupName = document.getElementById('groupName')?.value.trim()       || '';
        const regNumbersRaw = document.getElementById('registerNumbers')?.value.trim() || '';
        const groupCompetitionType = document.getElementById('groupCompetitionType')?.value || '';

        if (!fromDate || !toDate || !event || !college || !reason || !groupName || !groupCompetitionType) {
            showToast('error', 'All fields required'); return;
        }
        if (!regNumbersRaw || window.groupMemberList.length < 2) {
            showToast('error', 'Add at least 2 group members'); return;
        }
        if (fromDate > toDate) {
            showToast('error', 'To date must be after from date'); return;
        }
        // Final guard — re-check weekends at submit time in case of manual typing/paste
        if (isWeekend(fromDate)) {
            showFieldError(groupFromEl, 'groupFromDate-error', 'From Date cannot be a weekend — OD is only for working days.');
            showToast('error', 'From Date must be a working day (Mon–Fri).'); return;
        }
        if (isWeekend(toDate)) {
            showFieldError(groupToEl, 'groupToDate-error', 'To Date cannot be a weekend — OD is only for working days.');
            showToast('error', 'To Date must be a working day (Mon–Fri).'); return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
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
            registerNumbers: regNumbers.join(',')
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
                // Reset dynamic member list
                window.groupMemberList = [];
                renderMemberList();
                switchTab('apply-status');
            } else {
                const errText = await res.text();
                console.error('Group OD submit failed:', res.status, errText);
                showToast('error', `Failed to submit Group OD (${res.status})`);
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
        const compType = od.CompetitionType ?? od.competitionType ?? '';
        setEl('modalCollege', college || '-');
        const modalCompEl = document.getElementById('modalCompetitionType');
        if (modalCompEl) { modalCompEl.textContent = compType || '-'; modalCompEl.closest('.modal-row').style.display = compType ? '' : 'none'; }
        setEl('modalFromDate', fmtDate(fromDate));
        setEl('modalToDate', fmtDate(toDate));
        setEl('modalDays', numDays ? `${numDays}${odDateCountdownLabel(fromDate, toDate) ? ' (' + odDateCountdownLabel(fromDate, toDate) + ')' : ''}` : '-');
        setEl('modalReason', reason || 'No reason provided');

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

    function addMember() {
        const input = document.getElementById('memberRegInput');
        if (!input) return;
        const val = input.value.trim().toUpperCase();
        if (!val) { showToast('error', 'Enter a register number'); return; }
        if (window.groupMemberList.includes(val)) {
            showToast('error', `${val} is already added`);
            input.value = '';
            return;
        }
        window.groupMemberList.push(val);
        renderMemberList();
        input.value = '';
        input.focus();
    }

    document.getElementById('addMemberBtn')?.addEventListener('click', addMember);
    document.getElementById('memberRegInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addMember(); }
    });

    // Initialise with own reg number on page load
    renderMemberList();

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
        const reportWindow = window.open('od_report.html', '_blank');
        if (!reportWindow) {
            showToast('error', 'Please allow pop-ups to print the OD report');
            return;
        }
        // The OD's own Section field reflects whichever student CREATED it —
        // for a group OD, a member from a different section (e.g. a
        // Section-A student included in a Section-B student's group) must
        // still see THEIR OWN class staff's name on their report, not the
        // creator's. Override with the currently logged-in viewer's own
        // section before handing the data to the report page.
        const odForReport = { ...od, Section: localStorage.getItem('userSection') || od.Section || od.section || '' };
        const tryFill = () => {
            if (typeof reportWindow.fillOdReport === 'function') {
                reportWindow.fillOdReport(odForReport);
            } else {
                // Report page may still be parsing scripts — retry briefly
                setTimeout(tryFill, 100);
            }
        };
        reportWindow.addEventListener('load', tryFill);
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

                const competitionType = od.CompetitionType ?? od.competitionType ?? '';
                const competitionTag = competitionType
                    ? `<span class="competition-tag competition-tag--${competitionType.toLowerCase().replace(/\s+/g,'-')}" title="Competition Type">${escapeCompType(competitionType)}</span>`
                    : '';
                const groupTag = isGroup
                    ? `<span class="status-program" style="margin-left:8px">Group: ${groupName}</span>`
                    : '';
                const myStatusTag = iAmRejected
                    ? `<span class="badge-rejected" style="margin-left:6px">Your OD: Rejected</span>`
                    : '';

                // One-time alert for this student's rejection on this OD.
                // Guarded with localStorage so it fires exactly once ever —
                // never again on login, page refresh, or the 5s status poll.
                if (iAmRejected) {
                    const alertKey = `odRejectSeen_${odId}_${myRegNo}`;
                    if (!localStorage.getItem(alertKey)) {
                        localStorage.setItem(alertKey, '1');
                        setTimeout(() => alert(`Your OD request (${eventName}) was rejected by faculty.`), 100);
                    }
                } else if (hodStatus === 'Rejected') {
                    // Whole OD (solo or group) rejected at the HOD stage.
                    const alertKey = `odHodRejectSeen_${odId}_${myRegNo}`;
                    if (!localStorage.getItem(alertKey)) {
                        localStorage.setItem(alertKey, '1');
                        setTimeout(() => alert(`Your OD request (${eventName}) was rejected by HOD.`), 100);
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

                return `
                <div class="od-status-card" data-overall="${overall}" data-odid="${odId}">
                    <div class="card-top">
                        <div>
                            <h4>${eventName} ${competitionTag} ${groupTag} ${myStatusTag}</h4>
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

    function showToast(type, msg) {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const t = document.createElement('div');
        t.className   = `toast ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        // Preserve the "rejection alert already seen" markers across logout —
        // otherwise clearing localStorage wipes them out and the rejection
        // popup incorrectly fires again the next time this student logs in.
        const seenEntries = Object.keys(localStorage)
            .filter(k => k.startsWith('odRejectSeen_') || k.startsWith('odHodRejectSeen_'))
            .map(k => [k, localStorage.getItem(k)]);

        localStorage.clear();

        seenEntries.forEach(([k, v]) => localStorage.setItem(k, v));

        window.location.href = 'index.html';
    });
});