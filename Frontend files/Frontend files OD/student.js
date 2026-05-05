// const API_BASE = 'http://localhost:5088';

// document.addEventListener('DOMContentLoaded', async () => {
//     const studentId = localStorage.getItem('studentId');
//     if (!studentId) { window.location.href = 'index.html'; return; }

//     // ── Load student data ──
//     try {
//         const res = await fetch(`${API_BASE}/api/Student/${studentId}`);
//         if (res.ok) {
//             const s = await res.json();
//             setEl('studentName',   s.name           || '');
//             setEl('studentDept',   s.department      || '');
//             setEl('studentRollNo', s.registerNumber  || '');
//             setEl('studentYear',   `Year ${s.year || ''} / Sem ${s.semester || ''}`);
//             const dobEl = document.getElementById('studentDOB');
//             if (dobEl && s.dob) {
//                 try { const d = new Date(s.dob); dobEl.textContent = isNaN(d.getTime()) ? s.dob : d.toLocaleDateString('en-GB'); }
//                 catch { dobEl.textContent = s.dob; }
//             }
//             const avatar = document.getElementById('studentAvatar');
//             if (avatar) { const sp = avatar.querySelector('span'); if (sp) sp.textContent = (s.name||'S').charAt(0).toUpperCase(); }
//             localStorage.setItem('registerNumber', s.registerNumber || '');
//             localStorage.setItem('userDept',       s.department     || '');
//             localStorage.setItem('userYear',       String(s.year    || ''));
//         }
//     } catch (err) { console.error('Student load error:', err); }

//     // ── Auto-calculate days ──
//     const fromEl = document.getElementById('fromDate');
//     const toEl   = document.getElementById('toDate');
//     const daysEl = document.getElementById('numberOfDays');
//     function calcDays() {
//         if (fromEl.value && toEl.value && fromEl.value <= toEl.value) {
//             const d = Math.floor((new Date(toEl.value) - new Date(fromEl.value)) / 86400000) + 1;
//             daysEl.value = d + (d === 1 ? ' day' : ' days');
//         } else { daysEl.value = ''; }
//     }
//     fromEl.addEventListener('change', calcDays);
//     toEl.addEventListener('change', calcDays);

//     // ── Tabs with indicator ──
//     const tabIndicator = document.getElementById('tabIndicator');
//     function switchTab(tabId) {
//         document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
//         document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
//         const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
//         if (btn) btn.classList.add('active');
//         document.getElementById(tabId)?.classList.add('active');
//         // move indicator
//         if (tabIndicator) {
//             tabIndicator.style.transform = tabId === 'apply-status' ? 'translateX(100%)' : 'translateX(0)';
//         }
//     }

//     document.querySelectorAll('.tab-btn').forEach(btn => {
//         btn.addEventListener('click', () => {
//             switchTab(btn.dataset.tab);
//             if (btn.dataset.tab === 'apply-status') loadODStatus();
//         });
//     });

//     // ── Filter buttons ──
//     document.querySelectorAll('.filter-btn').forEach(btn => {
//         btn.addEventListener('click', () => {
//             document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
//             btn.classList.add('active');
//             filterCards(btn.dataset.filter);
//         });
//     });
//     function filterCards(filter) {
//         document.querySelectorAll('.od-status-card').forEach(card => {
//             card.style.display = (filter === 'all' || card.dataset.overall === filter) ? '' : 'none';
//         });
//     }

//     document.getElementById('refreshBtn')?.addEventListener('click', loadODStatus);

//     // ── OD Form Submit ──
//     document.getElementById('odForm').addEventListener('submit', async (e) => {
//         e.preventDefault();
//         const fromDate = fromEl.value;
//         const toDate   = toEl.value;
//         const event    = document.getElementById('eventName').value.trim();
//         const college  = document.getElementById('collegeName').value.trim();
//         const reason   = document.getElementById('reason').value.trim();

//         if (!fromDate || !toDate || !event || !college || !reason) { showToast('error','All fields required'); return; }
//         if (fromDate > toDate) { showToast('error','To date must be after from date'); return; }
//         if (reason.length < 5) { showToast('error','Reason too short'); return; }

//         const days = Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;
//         const odData = {
//             studentId:       parseInt(studentId),
//             studentName:     localStorage.getItem('userName')       || '',
//             registerNumber:  localStorage.getItem('registerNumber') || '',
//             department:      localStorage.getItem('userDept')       || '',
//             year:            localStorage.getItem('userYear')       || '',
//             fromDate, toDate, numberOfDays: days,
//             event, collegeIndustry: college, reason
//         };

//         setBtnLoading(true);
//         try {
//             const res = await fetch(`${API_BASE}/api/OdApply/OD-Apply`, {
//                 method: 'POST',
//                 headers: { 'Content-Type': 'application/json' },
//                 body: JSON.stringify(odData)
//             });
//             if (res.ok) {
//                 showToast('success','OD submitted successfully!');
//                 document.getElementById('odForm').reset();
//                 if (daysEl) daysEl.value = '';
//                 switchTab('apply-status');
//                 setTimeout(loadODStatus, 500);
//             } else {
//                 const t = await res.text();
//                 console.error('Submit error:', t);
//                 showToast('error','Failed to submit OD');
//             }
//         } catch (err) { console.error(err); showToast('error','Network error'); }
//         finally { setBtnLoading(false); }
//     });

//     // ── Load OD Status ──
//     async function loadODStatus() {
//         const list  = document.getElementById('statusList');
//         const empty = document.getElementById('emptyState');
//         if (list) list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading your OD requests...</div>';
//         if (empty) empty.style.display = 'none';

//         try {
//             const res = await fetch(`${API_BASE}/api/OdApply/Student-Od/${studentId}`);
//             if (!res.ok) {
//                 if (list) list.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">Error ${res.status} — check backend</div>`;
//                 return;
//             }
//             const ods = await res.json();
//             if (!ods || ods.length === 0) {
//                 if (list) list.innerHTML = '';
//                 if (empty) empty.style.display = 'flex';
//                 return;
//             }
//             if (empty) empty.style.display = 'none';
//             if (list) list.innerHTML = ods.map(od => {
//                 const overall = overallKey(od.facultyStatus, od.hodStatus);
//                 return `<div class="od-status-card" data-overall="${overall}">
//                     <div class="card-top">
//                         <div>
//                             <h4>${od.event || ''}</h4>
//                             <p>${od.collegeIndustry || ''}</p>
//                         </div>
//                         <span class="badge-${overall}">${overallLabel(od.facultyStatus, od.hodStatus)}</span>
//                     </div>
//                     <div class="card-meta">
//                         <span><strong>From:</strong> ${fmtDate(od.fromDate)}</span>
//                         <span><strong>To:</strong> ${fmtDate(od.toDate)}</span>
//                         <span><strong>Days:</strong> ${od.numberOfDays || ''}</span>
//                     </div>
//                     <div class="status-row">
//                         <div class="status-item"><strong>Faculty:</strong> <span class="badge-${bdg(od.facultyStatus)}">${od.facultyStatus||'Pending'}</span></div>
//                         <div class="status-item"><strong>HOD:</strong> <span class="badge-${bdg(od.hodStatus)}">${od.hodStatus||'Pending'}</span></div>
//                     </div>
//                 </div>`;
//             }).join('');
//             const activeFilter = document.querySelector('.filter-btn.active');
//             if (activeFilter) filterCards(activeFilter.dataset.filter);
//         } catch (err) {
//             console.error('Status error:', err);
//             if (list) list.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444">Network error</div>';
//         }
//     }

//     function overallKey(f, h) {
//         if (h === 'Approved') return 'approved';
//         if (h === 'Rejected' || f === 'Rejected') return 'rejected';
//         return 'pending';
//     }
//     function overallLabel(f, h) {
//         if (h === 'Approved') return 'Fully Approved ✓';
//         if (h === 'Rejected') return 'Rejected by HOD';
//         if (f === 'Rejected') return 'Rejected by Faculty';
//         if (f === 'Approved') return 'Awaiting HOD';
//         return 'Pending';
//     }
//     function bdg(s) { return s==='Approved'?'approved':s==='Rejected'?'rejected':'pending'; }
//     function fmtDate(d) { if (!d) return ''; try { const dt=new Date(d); return isNaN(dt.getTime())?d:dt.toLocaleDateString('en-GB'); } catch{return d;} }
//     function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
//     function setBtnLoading(on) {
//         const btn = document.getElementById('submitOdBtn'); if (!btn) return;
//         const t = btn.querySelector('.btn-text'); const l = btn.querySelector('.btn-loader');
//         if (t) t.style.display = on ? 'none' : 'inline';
//         if (l) l.style.display = on ? 'inline' : 'none';
//         btn.disabled = on;
//     }
//     function showToast(type, msg) {
//         const c = document.getElementById('toastContainer'); if (!c) return;
//         const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
//         c.appendChild(t); setTimeout(() => t.remove(), 3500);
//     }
//     document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.clear(); window.location.href = 'index.html'; });
// });






const API_BASE = 'http://localhost:5088';

document.addEventListener('DOMContentLoaded', async () => {

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
            // Support both PascalCase and camelCase from backend
            const name  = s.name           || s.Name           || '';
            const dept  = s.department     || s.Department     || '';
            const regNo = s.registerNumber || s.RegisterNumber || '';
            const yr    = s.year           || s.Year           || '';
            const sem   = s.semester       || s.Semester       || '';
            const dob   = s.dob            || s.Dob            || s.DOB || '';

            setEl('studentName',   name);
            setEl('studentDept',   dept);
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
        }
    } catch (err) { console.error('Student load error:', err); }

    // ── Auto-calculate days ──
    const fromEl = document.getElementById('fromDate');
    const toEl   = document.getElementById('toDate');
    const daysEl = document.getElementById('numberOfDays');

    function calcDays() {
        if (fromEl && toEl && fromEl.value && toEl.value && fromEl.value <= toEl.value) {
            const d = Math.floor((new Date(toEl.value) - new Date(fromEl.value)) / 86400000) + 1;
            if (daysEl) daysEl.value = d + (d === 1 ? ' day' : ' days');
        } else {
            if (daysEl) daysEl.value = '';
        }
    }
    if (fromEl) fromEl.addEventListener('change', calcDays);
    if (toEl)   toEl.addEventListener('change', calcDays);

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
            tabIndicator.style.transform = tabId === 'apply-status' ? 'translateX(100%)' : 'translateX(0)';
        }

        if (tabId === 'apply-status') {
            loadODStatus();
        }
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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

    // ── OD Form Submit ──
    document.getElementById('odForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const fromDate = fromEl ? fromEl.value : '';
        const toDate   = toEl   ? toEl.value   : '';
        const event    = document.getElementById('eventName')?.value.trim()   || '';
        const college  = document.getElementById('collegeName')?.value.trim() || '';
        const reason   = document.getElementById('reason')?.value.trim()      || '';

        if (!fromDate || !toDate || !event || !college || !reason) {
            showToast('error', 'All fields required'); return;
        }
        if (fromDate > toDate) {
            showToast('error', 'To date must be after from date'); return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
        }

        const days = Math.floor((new Date(toDate) - new Date(fromDate)) / 86400000) + 1;

        const odData = {
            studentId:       parsedStudentId,
            studentName:     localStorage.getItem('userName')       || '',
            registerNumber:  localStorage.getItem('registerNumber') || '',
            department:      localStorage.getItem('userDept')       || '',
            fromDate,
            toDate,
            numberOfDays:    days,
            event,
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

    // ── Load OD Status ──
    async function loadODStatus() {
        const list  = document.getElementById('statusList');
        const empty = document.getElementById('emptyState');

        if (!list) { console.error('statusList element not found'); return; }

        list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading your OD requests...</div>';
        if (empty) empty.style.display = 'none';

        const url = `${API_BASE}/api/OdApply/Student-Od/${parsedStudentId}`;
        console.log('Fetching OD status from:', url);

        try {
            const res = await fetch(url);
            console.log('OD status response code:', res.status);

            if (!res.ok) {
                list.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">
                    Server error ${res.status} — check backend console</div>`;
                return;
            }

            const ods = await res.json();
            console.log('ODs received from API:', ods);

            if (!ods || ods.length === 0) {
                list.innerHTML = '';
                if (empty) empty.style.display = 'flex';
                return;
            }

            if (empty) empty.style.display = 'none';

            list.innerHTML = ods.map(od => {
                // Handle both PascalCase (.NET default) and camelCase
                const facultyStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
                const hodStatus     = od.HodStatus     ?? od.hodStatus     ?? 'Pending';
                const eventName     = od.Event         ?? od.event         ?? '';
                const college       = od.CollegeIndustry ?? od.collegeIndustry ?? '';
                const fromDate      = od.FromDate      ?? od.fromDate      ?? '';
                const toDate        = od.ToDate        ?? od.toDate        ?? '';
                const numDays       = od.NumberOfDays  ?? od.numberOfDays  ?? '';

                const overall = overallKey(facultyStatus, hodStatus);

                return `
                <div class="od-status-card" data-overall="${overall}">
                    <div class="card-top">
                        <div>
                            <h4>${eventName}</h4>
                            <p>${college}</p>
                        </div>
                        <span class="badge-${overall}">${overallLabel(facultyStatus, hodStatus)}</span>
                    </div>
                    <div class="card-meta">
                        <span><strong>From:</strong> ${fmtDate(fromDate)}</span>
                        <span><strong>To:</strong> ${fmtDate(toDate)}</span>
                        <span><strong>Days:</strong> ${numDays}</span>
                    </div>
                    <div class="status-row">
                        <div class="status-item">
                            <strong>Faculty:</strong>
                            <span class="badge-${bdg(facultyStatus)}">${facultyStatus}</span>
                        </div>
                        <div class="status-item">
                            <strong>HOD:</strong>
                            <span class="badge-${bdg(hodStatus)}">${hodStatus}</span>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Reapply active filter
            const activeFilter = document.querySelector('.filter-btn.active');
            if (activeFilter) filterCards(activeFilter.dataset.filter);

        } catch (err) {
            console.error('loadODStatus error:', err);
            list.innerHTML = `<div style="padding:24px;text-align:center;color:#ef4444">
                Network error — make sure backend is running on ${API_BASE}</div>`;
        }
    }

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
        localStorage.clear();
        window.location.href = 'index.html';
    });
});