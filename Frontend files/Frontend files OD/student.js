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

    // ── Auto-calculate days (solo OD) ──
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

    // ── Auto-calculate days (group OD) ──
    const groupFromEl = document.getElementById('groupFromDate');
    const groupToEl   = document.getElementById('groupToDate');
    const groupDaysEl = document.getElementById('groupNumberOfDays');

    function calcGroupDays() {
        if (groupFromEl && groupToEl && groupFromEl.value && groupToEl.value && groupFromEl.value <= groupToEl.value) {
            const d = Math.floor((new Date(groupToEl.value) - new Date(groupFromEl.value)) / 86400000) + 1;
            if (groupDaysEl) groupDaysEl.value = d + (d === 1 ? ' day' : ' days');
        } else {
            if (groupDaysEl) groupDaysEl.value = '';
        }
    }
    if (groupFromEl) groupFromEl.addEventListener('change', calcGroupDays);
    if (groupToEl)   groupToEl.addEventListener('change', calcGroupDays);

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

        if (!fromDate || !toDate || !event || !college || !reason || !groupName || !regNumbersRaw) {
            showToast('error', 'All fields required'); return;
        }
        if (fromDate > toDate) {
            showToast('error', 'To date must be after from date'); return;
        }
        if (reason.length < 5) {
            showToast('error', 'Reason too short'); return;
        }

        const regNumbers = [...new Set(
            regNumbersRaw.split(',').map(r => r.trim()).filter(r => r.length > 0)
        )];

        if (regNumbers.length < 2) {
            showToast('error', 'Enter at least 2 register numbers for a group'); return;
        }

        const myRegNo = (localStorage.getItem('registerNumber') || '').trim();
        if (myRegNo && !regNumbers.some(r => r.toLowerCase() === myRegNo.toLowerCase())) {
            regNumbers.push(myRegNo);
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
            reason,
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
                document.getElementById('groupOdForm').reset();
                if (groupDaysEl) groupDaysEl.value = '';
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
        if (e.key === 'Escape' && odModal && odModal.style.display !== 'none') closeOdModal();
    });

    function closeOdModal() {
        if (odModal) odModal.style.display = 'none';
    }

    function openOdModal(od) {
        const facultyStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
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
        const winningStatus = od.WinningStatus ?? od.winningStatus ?? '';
        const certUrl       = od.CertificatePhotoUrl ?? od.certificatePhotoUrl ?? '';

        setEl('modalEventName', eventName || 'OD Request');
        setEl('modalCollege', college || '-');
        setEl('modalFromDate', fmtDate(fromDate));
        setEl('modalToDate', fmtDate(toDate));
        setEl('modalDays', numDays || '-');
        setEl('modalReason', reason || 'No reason provided');

        const overall = overallKey(facultyStatus, hodStatus);
        const overallBadge = document.getElementById('modalOverallBadge');
        if (overallBadge) {
            overallBadge.className = `badge-${overall}`;
            overallBadge.textContent = overallLabel(facultyStatus, hodStatus);
        }

        const facBadge = document.getElementById('modalFacultyStatus');
        if (facBadge) {
            facBadge.className = `badge-${bdg(facultyStatus)}`;
            facBadge.textContent = facultyStatus;
        }

        const hodBadge = document.getElementById('modalHodStatus');
        if (hodBadge) {
            hodBadge.className = `badge-${bdg(hodStatus)}`;
            hodBadge.textContent = hodStatus;
        }

        // Group section
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
                    ? members.map(m => `<span>${escapeHtml(m)}</span>`).join('')
                    : '<span>No members listed</span>';
            }
            if (groupSection) groupSection.style.display = 'flex';
        } else {
            if (groupSection) groupSection.style.display = 'none';
        }

        // Certificate / winning status section
        const certSection = document.getElementById('modalCertSection');
        if (winningStatus || certUrl) {
            setEl('modalWinningStatus', winningStatus || 'Not submitted yet');
            const certImg = document.getElementById('modalCertImage');
            if (certImg) {
                if (certUrl) {
                    certImg.src = certUrl.startsWith('http') ? certUrl : `${API_BASE}${certUrl}`;
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

        if (odModal) odModal.style.display = 'flex';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Load OD Status (solo + group, via register number) ──
    async function loadODStatus() {
        const list  = document.getElementById('statusList');
        const empty = document.getElementById('emptyState');

        if (!list) { console.error('statusList element not found'); return; }

        list.innerHTML = '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading your OD requests...</div>';
        if (empty) empty.style.display = 'none';

        const registerNumber = localStorage.getItem('registerNumber') || '';
        const url = `${API_BASE}/api/OdApply/ByRegister/${encodeURIComponent(registerNumber)}`;
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
                const facultyStatus = od.FacultyStatus ?? od.facultyStatus ?? 'Pending';
                const hodStatus     = od.HodStatus     ?? od.hodStatus     ?? 'Pending';
                const eventName     = od.Event         ?? od.event         ?? '';
                const college       = od.CollegeIndustry ?? od.collegeIndustry ?? '';
                const fromDate      = od.FromDate      ?? od.fromDate      ?? '';
                const toDate        = od.ToDate        ?? od.toDate        ?? '';
                const numDays       = od.NumberOfDays  ?? od.numberOfDays  ?? '';
                const isGroup       = od.IsGroupOd     ?? od.isGroupOd     ?? false;
                const groupName     = od.GroupName     ?? od.groupName     ?? '';
                const facRejected   = (od.FacultyRejectedRegisterNumbers ?? od.facultyRejectedRegisterNumbers ?? '')
                                        .split(',').map(r => r.trim().toLowerCase()).filter(r => r);
                const hodOverridden = (od.HodApprovedRegisterNumbers ?? od.hodApprovedRegisterNumbers ?? '')
                                        .split(',').map(r => r.trim().toLowerCase()).filter(r => r);

                const iAmRejected = isGroup && facRejected.includes(myRegNo) && !hodOverridden.includes(myRegNo);

                const overall = iAmRejected ? 'rejected' : overallKey(facultyStatus, hodStatus);
                const groupTag = isGroup
                    ? `<span class="status-program" style="margin-left:8px">Group: ${groupName}</span>`
                    : '';
                const myStatusTag = iAmRejected
                    ? `<span class="badge-rejected" style="margin-left:6px">Your OD: Rejected</span>`
                    : '';

                // One-time alert for this student's rejection on this OD
                if (iAmRejected) {
                    const alertKey = `odRejectSeen_${od.OdId ?? od.odId}_${myRegNo}`;
                    if (!localStorage.getItem(alertKey)) {
                        localStorage.setItem(alertKey, '1');
                        setTimeout(() => alert(`Your OD request (${eventName}) was rejected by faculty.`), 100);
                    }
                }

                return `
                <div class="od-status-card" data-overall="${overall}">
                    <div class="card-top">
                        <div>
                            <h4>${eventName} ${groupTag} ${myStatusTag}</h4>
                            <p>${college}</p>
                        </div>
                        <span class="badge-${overall}">${iAmRejected ? 'Rejected' : overallLabel(facultyStatus, hodStatus)}</span>
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