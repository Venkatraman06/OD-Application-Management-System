const API_BASE = 'https://od-application-backend.onrender.com';

// ============================================
// Access gate
// There is no backend Admin login yet, so this page is protected by a
// simple local access code instead. It is NOT real security — anyone who
// reads this file can find the code — it only keeps the page from being
// stumbled into by accident. Change ADMIN_ACCESS_CODE below, or (better)
// wire this page into a proper server-side Admin login later.
// ============================================
const ADMIN_ACCESS_CODE = 'admin123';

document.addEventListener('DOMContentLoaded', () => {
    const gateOverlay = document.getElementById('gateOverlay');
    const adminShell  = document.getElementById('adminShell');
    const gateInput   = document.getElementById('gateCodeInput');
    const gateError   = document.getElementById('gateError');
    const gateBtn     = document.getElementById('gateSubmitBtn');

    function unlock() {
        gateOverlay.style.display = 'none';
        adminShell.style.display = 'block';
        sessionStorage.setItem('adminUnlocked', '1');
        initAdminApp();
    }

    function tryUnlock() {
        if (gateInput.value === ADMIN_ACCESS_CODE) {
            unlock();
        } else {
            gateError.textContent = 'Incorrect access code.';
            gateInput.value = '';
            gateInput.focus();
        }
    }

    if (sessionStorage.getItem('adminUnlocked') === '1') {
        unlock();
    } else {
        gateBtn.addEventListener('click', tryUnlock);
        gateInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
        gateInput.focus();
    }
});

// ============================================
// Main admin app (only runs after the gate is unlocked)
// ============================================
function initAdminApp() {
    let students = [];
    let staff = [];
    let hods = [];

    // ── Tabs ──
    const adminTabsNav = document.querySelector('.admin-tabs');
    if (adminTabsNav) {
        adminTabsNav.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                adminTabsNav.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }

    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
            document.getElementById(`panel-${btn.dataset.tab}`)?.classList.add('active');

            const tab = btn.dataset.tab;
            if (tab === 'students') loadStudents();
            else if (tab === 'staff') loadStaff();
            else if (tab === 'hod') loadHods();
            else if (tab === 'requests') loadRequests();
            else if (tab === 'odrequests') loadOdRequests();
            else if (tab === 'events') loadEvents();
        });
    });

    // ── Toast ──
    function showToast(type, msg) {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    }

    // ── Delete confirmation modal (shared across all tables) ──
    const deleteOverlay = document.getElementById('deleteConfirmOverlay');
    let pendingDelete = null; // { kind, id, label }

    function askDelete(kind, id, label) {
        pendingDelete = { kind, id, label };
        document.getElementById('deleteConfirmText').textContent =
            `This will permanently delete ${label}. This action cannot be undone.`;
        deleteOverlay.classList.add('active');
    }
    document.getElementById('deleteCancelBtn')?.addEventListener('click', () => {
        pendingDelete = null;
        deleteOverlay.classList.remove('active');
    });
    deleteOverlay?.addEventListener('click', (e) => {
        if (e.target === deleteOverlay) { pendingDelete = null; deleteOverlay.classList.remove('active'); }
    });
    document.getElementById('deleteConfirmBtn')?.addEventListener('click', async () => {
        if (!pendingDelete) return;
        const { kind, id } = pendingDelete;
        deleteOverlay.classList.remove('active');
        try {
            const endpoint = kind === 'student' ? `Student/${id}`
                : kind === 'staff' ? `Faculty/${id}`
                : kind === 'request' ? `Admin/ContactRequests/${id}`
                : kind === 'odrequest' ? `Admin/ODRequests/${id}`
                : kind === 'event' ? `Events/${id}`
                : `Hod/${id}`;
            const res = await fetch(`${API_BASE}/api/${endpoint}`, { method: 'DELETE' });
            if (!res.ok) { showToast('error', 'Delete failed.'); return; }
            showToast('success', 'Deleted.');
            if (kind === 'student') loadStudents();
            else if (kind === 'staff') loadStaff();
            else if (kind === 'request') loadRequests();
            else if (kind === 'odrequest') loadOdRequests();
            else if (kind === 'event') loadEvents();
            else loadHods();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error while deleting.');
        }
        pendingDelete = null;
    });

    async function toggleAccountStatus(role, id) {
        try {
            const endpoint = role === 'student' ? `Admin/Students/${id}/ToggleStatus`
                : role === 'staff' ? `Admin/Staff/${id}/ToggleStatus`
                : role === 'event' ? `Events/${id}/ToggleStatus`
                : `Admin/Hod/${id}/ToggleStatus`;
            const res = await fetch(`${API_BASE}/api/${endpoint}`, { method: 'PUT' });
            if (!res.ok) {
                showToast('error', 'Failed to update status.');
                return;
            }
            const data = await res.json();
            showToast('success', data.message || 'Status updated.');
            if (role === 'student') loadStudents();
            else if (role === 'staff') loadStaff();
            else if (role === 'event') loadEvents();
            else loadHods();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error updating status.');
        }
    }

    function esc(str) {
        return String(str ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ============================================
    // STUDENTS
    // ============================================
    const studentForm = document.getElementById('studentForm');
    const studentIdEl = document.getElementById('studentId');
    const studentSubmitBtn = document.getElementById('studentSubmitBtn');

    // ── Internal Sub-tabs for Students (All Students vs OD History) ──
    let odHistoryList = [];
    const subtabAllStudents = document.getElementById('subtabAllStudents');
    const subtabOdHistory = document.getElementById('subtabOdHistory');
    const subtabViewAllStudents = document.getElementById('subtabViewAllStudents');
    const subtabViewOdHistory = document.getElementById('subtabViewOdHistory');

    subtabAllStudents?.addEventListener('click', () => {
        subtabAllStudents.classList.add('active');
        subtabOdHistory?.classList.remove('active');
        if (subtabViewAllStudents) subtabViewAllStudents.style.display = 'block';
        if (subtabViewOdHistory) subtabViewOdHistory.style.display = 'none';
    });

    subtabOdHistory?.addEventListener('click', () => {
        subtabOdHistory.classList.add('active');
        subtabAllStudents?.classList.remove('active');
        if (subtabViewAllStudents) subtabViewAllStudents.style.display = 'none';
        if (subtabViewOdHistory) subtabViewOdHistory.style.display = 'block';
        loadOdHistory();
    });

    async function loadOdHistory() {
        const tbody = document.getElementById('odHistoryTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="table-empty">Loading OD history...</td></tr>';
        try {
            const res = await fetch(API_BASE + '/api/Student/OdHistory?_=' + Date.now(), { cache: 'no-store' });
            odHistoryList = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            odHistoryList = [];
            showToast('error', 'Failed to load student OD history.');
        }
        renderOdHistory(odHistoryList);
    }

    function renderOdHistory(list) {
        const tbody = document.getElementById('odHistoryTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No OD history found.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const total = s.totalOdCount ?? s.TotalOdCount ?? 0;
            const approved = s.approvedCount ?? s.ApprovedCount ?? 0;
            const rejected = s.rejectedCount ?? s.RejectedCount ?? 0;
            return '<tr>' +
                '<td style="font-weight:600">' + esc(s.studentName ?? s.StudentName ?? s.name ?? s.Name) + '</td>' +
                '<td>' + esc(s.registerNumber ?? s.RegisterNumber) + '</td>' +
                '<td>' + esc(s.class ?? s.Class ?? s.department ?? s.Department) + '</td>' +
                '<td>' + esc(s.section ?? s.Section ?? '-') + '</td>' +
                '<td>' + esc(s.year ?? s.Year) + '</td>' +
                '<td style="text-align:center"><span class="od-count-badge od-count-total">' + total + '</span></td>' +
                '<td style="text-align:center"><span class="od-count-badge od-count-approved">' + approved + '</span></td>' +
                '<td style="text-align:center"><span class="od-count-badge od-count-rejected">' + rejected + '</span></td>' +
            '</tr>';
        }).join('');
    }

    document.getElementById('odHistorySearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderOdHistory(odHistoryList); return; }
        renderOdHistory(odHistoryList.filter(s =>
            (s.studentName ?? s.StudentName ?? s.name ?? s.Name ?? '').toLowerCase().includes(q) ||
            (s.registerNumber ?? s.RegisterNumber ?? '').toLowerCase().includes(q) ||
            (s.class ?? s.Class ?? s.department ?? s.Department ?? '').toLowerCase().includes(q) ||
            (s.section ?? s.Section ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('refreshOdHistoryBtn')?.addEventListener('click', () => {
        loadOdHistory();
    });

    async function loadStudents() {
        const tbody = document.getElementById('studentTableBody');
        try {
            const res = await fetch(`${API_BASE}/api/Student?_=${Date.now()}`, { cache: 'no-store' });
            students = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            students = [];
            showToast('error', 'Failed to load students.');
        }
        setEl('studentTabCount', students.length);
        renderStudents(students);
    }

    function renderStudents(list) {
        const tbody = document.getElementById('studentTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No students yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.studentId ?? s.StudentId;
            const active = (s.isActive ?? s.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="student" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(s.name ?? s.Name)}</td>
                <td>${esc(s.registerNumber ?? s.RegisterNumber)}</td>
                <td>${esc(s.department ?? s.Department)}</td>
                <td>${esc(s.section ?? s.Section ?? '-')}</td>
                <td>${esc(s.year ?? s.Year)}</td>
                <td>${esc(s.semester ?? s.Semester)}</td>
                <td>${esc(s.email ?? s.Email ?? '-')}</td>
                <td>${statusBtn}</td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-btn" title="Edit" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('studentSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderStudents(students); return; }
        renderStudents(students.filter(s =>
            (s.name ?? s.Name ?? '').toLowerCase().includes(q) ||
            (s.registerNumber ?? s.RegisterNumber ?? '').toLowerCase().includes(q) ||
            (s.department ?? s.Department ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('studentTableBody')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-toggle-id]');
        if (toggleBtn) {
            toggleAccountStatus('student', toggleBtn.dataset.toggleId);
            return;
        }

        const id = e.target.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const student = students.find(s => String(s.studentId ?? s.StudentId) === String(id));
        if (!student) return;

        if (e.target.closest('.delete-btn')) {
            askDelete('student', id, `student "${student.name ?? student.Name}"`);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            fillStudentForm(student);
        }
    });

    function fillStudentForm(s) {
        studentIdEl.value = s.studentId ?? s.StudentId ?? '';
        document.getElementById('studentName').value = s.name ?? s.Name ?? '';
        document.getElementById('studentRegNo').value = s.registerNumber ?? s.RegisterNumber ?? '';
        document.getElementById('studentDept').value = s.department ?? s.Department ?? '';
        document.getElementById('studentSection').value = s.section ?? s.Section ?? '';
        document.getElementById('studentYear').value = s.year ?? s.Year ?? '';
        document.getElementById('studentSemester').value = s.semester ?? s.Semester ?? '';
        const dob = s.dob ?? s.dOB ?? s.DOB ?? '';
        document.getElementById('studentDob').value = dob ? String(dob).slice(0, 10) : '';
        document.getElementById('studentEmail').value = s.email ?? s.Email ?? '';
        document.getElementById('studentPassword').value = ''; // never prefill a password
        studentSubmitBtn.textContent = 'Update Student';
        document.getElementById('panel-students').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('studentResetBtn')?.addEventListener('click', () => {
        studentForm.reset();
        studentIdEl.value = '';
        studentSubmitBtn.textContent = 'Add Student';
    });

    studentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = studentIdEl.value;
        const isEdit = !!id;

        const payload = {
            name: document.getElementById('studentName').value.trim(),
            registerNumber: document.getElementById('studentRegNo').value.trim(),
            department: document.getElementById('studentDept').value.trim(),
            section: document.getElementById('studentSection').value.trim(),
            year: parseInt(document.getElementById('studentYear').value, 10),
            semester: parseInt(document.getElementById('studentSemester').value, 10),
            dob: document.getElementById('studentDob').value,
            email: document.getElementById('studentEmail').value.trim(),
            password: document.getElementById('studentPassword').value
        };

        if (!payload.name || !payload.registerNumber || !payload.department || !payload.dob || !payload.year || !payload.semester) {
            showToast('error', 'Please fill all required fields.');
            return;
        }
        if (!isEdit && !payload.password) {
            showToast('error', 'Password is required for a new student.');
            return;
        }

        studentSubmitBtn.disabled = true;
        try {
            let res;
            if (isEdit) {
                const existing = students.find(s => String(s.studentId ?? s.StudentId) === String(id));
                const body = { ...payload, studentId: parseInt(id, 10) };
                if (!body.password) body.password = existing ? (existing.password ?? existing.Password) : '';
                res = await fetch(`${API_BASE}/api/Student/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch(`${API_BASE}/api/Student`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                showToast('error', text || 'Could not save student.');
                return;
            }
            showToast('success', isEdit ? 'Student updated.' : 'Student added.');
            studentForm.reset();
            studentIdEl.value = '';
            studentSubmitBtn.textContent = 'Add Student';
            loadStudents();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error — could not save student.');
        } finally {
            studentSubmitBtn.disabled = false;
        }
    });

    // ============================================
    // STAFF  (backend route is "api/Faculty")
    // ============================================
    const staffForm = document.getElementById('staffForm');
    const staffIdEl = document.getElementById('staffId');
    const staffSubmitBtn = document.getElementById('staffSubmitBtn');

    async function loadStaff() {
        try {
            const res = await fetch(`${API_BASE}/api/Faculty?_=${Date.now()}`, { cache: 'no-store' });
            staff = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            staff = [];
            showToast('error', 'Failed to load staff.');
        }
        setEl('staffTabCount', staff.length);
        renderStaff(staff);
    }

    function renderStaff(list) {
        const tbody = document.getElementById('staffTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No staff yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.staffId ?? s.StaffId;
            const active = (s.isActive ?? s.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="staff" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(s.name ?? s.Name)}</td>
                <td>${esc(s.rollNumber ?? s.RollNumber)}</td>
                <td>${esc(s.department ?? s.Department)}</td>
                <td>${esc(s.section ?? s.Section ?? '-')}</td>
                <td>${esc(s.year ?? s.Year ?? '-')}</td>
                <td>${esc(s.email ?? s.Email)}</td>
                <td>${statusBtn}</td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-btn" title="Edit" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('staffSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderStaff(staff); return; }
        renderStaff(staff.filter(s =>
            (s.name ?? s.Name ?? '').toLowerCase().includes(q) ||
            (s.department ?? s.Department ?? '').toLowerCase().includes(q) ||
            (s.section ?? s.Section ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('staffTableBody')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-toggle-id]');
        if (toggleBtn) {
            toggleAccountStatus('staff', toggleBtn.dataset.toggleId);
            return;
        }

        const id = e.target.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const member = staff.find(s => String(s.staffId ?? s.StaffId) === String(id));
        if (!member) return;

        if (e.target.closest('.delete-btn')) {
            askDelete('staff', id, `staff member "${member.name ?? member.Name}"`);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            fillStaffForm(member);
        }
    });

    function fillStaffForm(s) {
        staffIdEl.value = s.staffId ?? s.StaffId ?? '';
        document.getElementById('staffName').value = s.name ?? s.Name ?? '';
        document.getElementById('staffRollNumber').value = s.rollNumber ?? s.RollNumber ?? '';
        document.getElementById('staffDept').value = s.department ?? s.Department ?? '';
        document.getElementById('staffSection').value = s.section ?? s.Section ?? '';
        document.getElementById('staffYear').value = s.year ?? s.Year ?? '';
        document.getElementById('staffEmail').value = s.email ?? s.Email ?? '';
        document.getElementById('staffPassword').value = '';
        staffSubmitBtn.textContent = 'Update Staff';
        document.getElementById('panel-staff').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('staffResetBtn')?.addEventListener('click', () => {
        staffForm.reset();
        staffIdEl.value = '';
        staffSubmitBtn.textContent = 'Add Staff';
    });

    staffForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = staffIdEl.value;
        const isEdit = !!id;

        const yearVal = document.getElementById('staffYear').value;
        const payload = {
            name: document.getElementById('staffName').value.trim(),
            rollNumber: document.getElementById('staffRollNumber').value.trim(),
            department: document.getElementById('staffDept').value.trim(),
            section: document.getElementById('staffSection').value.trim(),
            year: yearVal ? parseInt(yearVal, 10) : null,
            email: document.getElementById('staffEmail').value.trim(),
            password: document.getElementById('staffPassword').value
        };

        if (!payload.name || !payload.rollNumber || !payload.department || !payload.email) {
            showToast('error', 'Please fill all required fields.');
            return;
        }
        if (!isEdit && !payload.password) {
            showToast('error', 'Password is required for a new staff member.');
            return;
        }

        staffSubmitBtn.disabled = true;
        try {
            let res;
            if (isEdit) {
                const existing = staff.find(s => String(s.staffId ?? s.StaffId) === String(id));
                const body = { ...payload, staffId: parseInt(id, 10) };
                if (!body.password) body.password = existing ? (existing.password ?? existing.Password) : '';
                // UpdateStaff is a plain PUT api/Faculty (no id in the URL) — id lives in the body
                res = await fetch(`${API_BASE}/api/Faculty`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch(`${API_BASE}/api/Faculty`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                showToast('error', text || 'Could not save staff.');
                return;
            }
            showToast('success', isEdit ? 'Staff updated.' : 'Staff added.');
            staffForm.reset();
            staffIdEl.value = '';
            staffSubmitBtn.textContent = 'Add Staff';
            loadStaff();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error — could not save staff.');
        } finally {
            staffSubmitBtn.disabled = false;
        }
    });

    // ============================================
    // HOD
    // ============================================
    const hodForm = document.getElementById('hodForm');
    const hodIdEl = document.getElementById('hodId');
    const hodSubmitBtn = document.getElementById('hodSubmitBtn');

    async function loadHods() {
        try {
            const res = await fetch(`${API_BASE}/api/Hod?_=${Date.now()}`, { cache: 'no-store' });
            hods = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            hods = [];
            showToast('error', 'Failed to load HODs.');
        }
        setEl('hodTabCount', hods.length);
        renderHods(hods);
    }

    function renderHods(list) {
        const tbody = document.getElementById('hodTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No HODs yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(h => {
            const id = h.hodId ?? h.HodId;
            const active = (h.isActive ?? h.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="hod" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(h.name ?? h.Name)}</td>
                <td>${esc(h.rollNumber ?? h.RollNumber ?? '-')}</td>
                <td>${esc(h.department ?? h.Department)}</td>
                <td>${esc(h.email ?? h.Email ?? '-')}</td>
                <td>${statusBtn}</td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-btn" title="Edit" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('hodSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderHods(hods); return; }
        renderHods(hods.filter(h =>
            (h.name ?? h.Name ?? '').toLowerCase().includes(q) ||
            (h.rollNumber ?? h.RollNumber ?? '').toLowerCase().includes(q) ||
            (h.department ?? h.Department ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('hodTableBody')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-toggle-id]');
        if (toggleBtn) {
            toggleAccountStatus('hod', toggleBtn.dataset.toggleId);
            return;
        }

        const id = e.target.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const hod = hods.find(h => String(h.hodId ?? h.HodId) === String(id));
        if (!hod) return;

        if (e.target.closest('.delete-btn')) {
            askDelete('hod', id, `HOD "${hod.name ?? hod.Name}"`);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            fillHodForm(hod);
        }
    });

    function fillHodForm(h) {
        hodIdEl.value = h.hodId ?? h.HodId ?? '';
        document.getElementById('hodName').value = h.name ?? h.Name ?? '';
        document.getElementById('hodRollNumber').value = h.rollNumber ?? h.RollNumber ?? '';
        document.getElementById('hodDeptInput').value = h.department ?? h.Department ?? '';
        document.getElementById('hodEmail').value = h.email ?? h.Email ?? '';
        document.getElementById('hodPassword').value = ''; // Hod.Password is [JsonIgnore]d anyway
        hodSubmitBtn.textContent = 'Update HOD';
        document.getElementById('panel-hod').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('hodResetBtn')?.addEventListener('click', () => {
        hodForm.reset();
        hodIdEl.value = '';
        hodSubmitBtn.textContent = 'Add HOD';
    });

    hodForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = hodIdEl.value;
        const isEdit = !!id;

        const payload = {
            name: document.getElementById('hodName').value.trim(),
            rollNumber: document.getElementById('hodRollNumber').value.trim(),
            department: document.getElementById('hodDeptInput').value.trim(),
            email: document.getElementById('hodEmail').value.trim(),
            password: document.getElementById('hodPassword').value
        };

        if (!payload.name || !payload.department || !payload.email) {
            showToast('error', 'Please fill all required fields.');
            return;
        }
        if (!isEdit && !payload.password) {
            showToast('error', 'Password is required for a new HOD.');
            return;
        }

        hodSubmitBtn.disabled = true;
        try {
            let res;
            if (isEdit) {
                const body = { ...payload, hodId: parseInt(id, 10) };
                // Hod.Password is [JsonIgnore]'d on the way OUT but still bound on
                // the way IN, so leaving it blank on edit would wipe the password.
                // Warn instead of silently blanking it.
                if (!body.password) {
                    showToast('error', 'Re-enter the password to save changes to this HOD (it cannot be read back for editing).');
                    hodSubmitBtn.disabled = false;
                    return;
                }
                res = await fetch(`${API_BASE}/api/Hod`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await fetch(`${API_BASE}/api/Hod`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                showToast('error', text || 'Could not save HOD.');
                return;
            }
            showToast('success', isEdit ? 'HOD updated.' : 'HOD added.');
            hodForm.reset();
            hodIdEl.value = '';
            hodSubmitBtn.textContent = 'Add HOD';
            loadHods();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error — could not save HOD.');
        } finally {
            hodSubmitBtn.disabled = false;
        }
    });

    function setEl(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val ?? '';
    }

    // ============================================
    // CONTACT ADMIN REQUESTS
    // ============================================
    let requests = [];

    async function loadRequests() {
        try {
            const res = await fetch(`${API_BASE}/api/Admin/ContactRequests?_=${Date.now()}`, { cache: 'no-store' });
            requests = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            requests = [];
            showToast('error', 'Failed to load contact requests.');
        }
        setEl('requestsTabCount', requests.filter(r => !(r.isResolved ?? r.IsResolved)).length);
        renderRequests(requests);
    }

    function renderRequests(list) {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No requests yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(r => {
            const id = r.id ?? r.Id;
            const resolved = r.isResolved ?? r.IsResolved;
            const submitted = r.submittedDate ?? r.SubmittedDate;
            const submittedLabel = submitted ? new Date(submitted).toLocaleString() : '-';
            return `
            <tr>
                <td>${esc(r.registerNumber ?? r.RegisterNumber)}</td>
                <td>${esc(r.role ?? r.Role)}</td>
                <td>${esc(r.dob ?? r.Dob ?? '-')}</td>
                <td class="requests-msg-cell">${esc(r.message ?? r.Message)}</td>
                <td>${esc(submittedLabel)}</td>
                <td><span class="status-pill ${resolved ? 'status-resolved' : 'status-pending'}">${resolved ? 'Resolved' : 'Pending'}</span></td>
                <td>
                    <div class="row-actions">
                        ${!resolved ? `
                        <button class="row-btn resolve-btn" title="Mark resolved" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
                        </button>` : ''}
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.resolve-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                try {
                    const res = await fetch(`${API_BASE}/api/Admin/ContactRequests/${id}/Resolve`, { method: 'PUT' });
                    if (!res.ok) { showToast('error', 'Could not update request.'); return; }
                    showToast('success', 'Marked as resolved.');
                    loadRequests();
                } catch (err) {
                    console.error(err);
                    showToast('error', 'Network error while updating request.');
                }
            });
        });

        tbody.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                askDelete('request', btn.dataset.id, 'this contact request');
            });
        });
    }

    document.getElementById('requestsSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderRequests(requests); return; }
        renderRequests(requests.filter(r =>
            (r.registerNumber ?? r.RegisterNumber ?? '').toLowerCase().includes(q) ||
            (r.role ?? r.Role ?? '').toLowerCase().includes(q) ||
            (r.message ?? r.Message ?? '').toLowerCase().includes(q)
        ));
    });

    // ============================================
    // OD REQUESTS MANAGEMENT
    // ============================================
    let odRequests = [];
    let currentOdSubtab = 'pending'; // 'pending' | 'approved' | 'rejected' | 'noaction'
    let pendingUndoId = null;

    function odHasStarted(o) {
        if (!o.fromDate) return false;
        const from = new Date(o.fromDate);
        if (isNaN(from.getTime())) return false;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        from.setHours(0, 0, 0, 0);
        return today >= from;
    }

    function isOdPending(o) {
        const fac = o.facultyStatus || 'Pending';
        const hod = o.hodStatus || 'Pending';
        if (fac === 'Rejected' || hod === 'Rejected' || hod === 'Approved') return false;
        return !odHasStarted(o);
    }

    function isOdApproved(o) {
        return (o.hodStatus === 'Approved');
    }

    function isOdRejected(o) {
        return (o.facultyStatus === 'Rejected' || o.hodStatus === 'Rejected');
    }

    function isOdNoAction(o) {
        const fac = o.facultyStatus || 'Pending';
        const hod = o.hodStatus || 'Pending';
        if (fac === 'Rejected' || hod === 'Rejected' || hod === 'Approved') return false;
        return odHasStarted(o);
    }

    function getFilteredOdList() {
        if (currentOdSubtab === 'pending') return odRequests.filter(isOdPending);
        if (currentOdSubtab === 'approved') return odRequests.filter(isOdApproved);
        if (currentOdSubtab === 'rejected') return odRequests.filter(isOdRejected);
        if (currentOdSubtab === 'noaction') return odRequests.filter(isOdNoAction);
        return odRequests;
    }

    // Sub-tab button event handlers
    document.querySelectorAll('[data-od-subtab]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-od-subtab]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentOdSubtab = btn.dataset.odSubtab;

            const titleEl = document.getElementById('odRequestsListTitle');
            const subEl = document.getElementById('odRequestsListSub');
            if (currentOdSubtab === 'pending') {
                if (titleEl) titleEl.textContent = 'Pending OD Requests';
                if (subEl) subEl.textContent = 'Awaiting decision before the event begins';
            } else if (currentOdSubtab === 'approved') {
                if (titleEl) titleEl.textContent = 'Approved OD Requests';
                if (subEl) subEl.textContent = 'Successfully approved requests';
            } else if (currentOdSubtab === 'rejected') {
                if (titleEl) titleEl.textContent = 'Rejected OD Requests';
                if (subEl) subEl.textContent = 'Requests rejected by Staff or HOD';
            } else if (currentOdSubtab === 'noaction') {
                if (titleEl) titleEl.textContent = 'No Action OD Requests';
                if (subEl) subEl.textContent = 'Decision window closed — event date has started or finished';
            }

            filterAndRenderOdRequests();
        });
    });

    async function loadOdRequests() {
        const tbody = document.getElementById('odRequestsTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="14" class="table-empty">Loading OD requests...</td></tr>';
        try {
            const res = await fetch(`${API_BASE}/api/Admin/ODRequests?_=${Date.now()}`, { cache: 'no-store' });
            odRequests = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            odRequests = [];
            showToast('error', 'Failed to load OD requests.');
        }

        updateOdCounts();
        filterAndRenderOdRequests();
    }

    function updateOdCounts() {
        const totalPending = odRequests.filter(isOdPending).length;
        const totalApproved = odRequests.filter(isOdApproved).length;
        const totalRejected = odRequests.filter(isOdRejected).length;
        const totalNoAction = odRequests.filter(isOdNoAction).length;

        setEl('odRequestsTabCount', odRequests.length);
        setEl('odSubtabPendingCount', totalPending);
        setEl('odSubtabApprovedCount', totalApproved);
        setEl('odSubtabRejectedCount', totalRejected);
        setEl('odSubtabNoActionCount', totalNoAction);
    }

    function filterAndRenderOdRequests() {
        const q = (document.getElementById('odRequestsSearch')?.value || '').trim().toLowerCase();
        let list = getFilteredOdList();
        if (q) {
            list = list.filter(o =>
                (o.studentName || '').toLowerCase().includes(q) ||
                (o.registerNumber || '').toLowerCase().includes(q) ||
                (o.department || '').toLowerCase().includes(q) ||
                (o.section || '').toLowerCase().includes(q) ||
                (o.eventName || '').toLowerCase().includes(q) ||
                (o.collegeName || '').toLowerCase().includes(q) ||
                (o.groupName || '').toLowerCase().includes(q) ||
                (o.registerNumbers || '').toLowerCase().includes(q)
            );
        }
        renderOdRequests(list);
    }

    function fmtOdDate(dStr) {
        if (!dStr) return '-';
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return esc(dStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function renderOdRequests(list) {
        const tbody = document.getElementById('odRequestsTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="14" class="table-empty">No OD requests found in this category.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map((item, idx) => {
            const odId = item.odId ?? item.OdId;
            const isGroup = item.isGroupOd ?? false;
            const groupTag = isGroup
                ? `<span class="report-group-pill" style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);margin-top:3px;">Group: ${esc(item.groupName || 'Group')}</span>`
                : '';

            let regDisplay = esc(item.registerNumber || '-');
            if (isGroup && item.registerNumbers) {
                regDisplay = `<div><b>${esc(item.registerNumber || '-')}</b></div><div style="font-size:0.72rem;color:var(--surface-400);" title="${esc(item.registerNumbers)}">Members: ${esc(item.registerNumbers)}</div>`;
            }

            const facStatus = item.facultyStatus || 'Pending';
            const hodStatus = item.hodStatus || 'Pending';

            let overallStatus = 'Pending';
            let statusBadgeClass = 'status-pending';
            if (hodStatus === 'Approved') {
                overallStatus = 'Approved';
                statusBadgeClass = 'status-resolved';
            } else if (hodStatus === 'Rejected' || facStatus === 'Rejected') {
                overallStatus = 'Rejected';
                statusBadgeClass = 'status-rejected';
            } else if (facStatus === 'Approved') {
                overallStatus = 'Pending (HOD)';
                statusBadgeClass = 'status-pending';
            } else if (odHasStarted(item)) {
                overallStatus = 'No Action';
                statusBadgeClass = 'status-noaction';
            }

            const canUndo = (facStatus !== 'Pending' || hodStatus !== 'Pending');
            const certStatus = item.certificationStatus || 'Not Submitted';

            return `
            <tr>
                <td style="color:var(--surface-400);font-size:0.78rem;">${idx + 1}</td>
                <td>
                    <div style="font-weight:600;color:white;">${esc(item.studentName || '-')}</div>
                    ${groupTag}
                </td>
                <td>${regDisplay}</td>
                <td>${esc(item.department || '-')}</td>
                <td>${esc(item.section || '-')}</td>
                <td>${item.year ? 'Year ' + item.year : '-'}</td>
                <td><b>${esc(item.eventName || '-')}</b></td>
                <td>${esc(item.collegeName || '-')}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;background:rgba(255,255,255,0.06);">${isGroup ? 'Group OD' : 'Solo OD'}</span></td>
                <td>
                    <div style="font-size:0.78rem;white-space:nowrap;">${fmtOdDate(item.fromDate)} &rarr; ${fmtOdDate(item.toDate)}</div>
                    <div style="font-size:0.72rem;color:var(--surface-400);">${item.numberOfDays || 1} day(s)</div>
                </td>
                <td style="font-size:0.75rem;color:var(--surface-400);white-space:nowrap;">${fmtOdDate(item.appliedDate)}</td>
                <td>
                    <div><span class="status-pill ${statusBadgeClass}">${overallStatus}</span></div>
                    <div style="font-size:0.72rem;color:var(--surface-400);margin-top:3px;">
                        Staff: <b>${esc(facStatus)}</b> | HOD: <b>${esc(hodStatus)}</b>
                    </div>
                </td>
                <td><span style="font-size:0.75rem;color:#cbd5e1;">${esc(certStatus)}</span></td>
                <td>
                    <div class="row-actions" style="justify-content:center;">
                        <button class="row-btn edit-od-btn" title="Edit OD Details & Decision" data-id="${odId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        ${canUndo ? `
                        <button class="row-btn undo-od-btn" title="Undo Decision (Reset to Pending for Staff/HOD review)" data-id="${odId}" style="color:#fbbf24;border-color:rgba(251,191,36,0.3);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                        </button>` : ''}
                        <button class="row-btn delete-od-btn" title="Delete OD Request" data-id="${odId}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        // Wire click handlers on rendered rows
        tbody.querySelectorAll('.edit-od-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const item = odRequests.find(o => String(o.odId ?? o.OdId) === String(id));
                if (item) openEditOdModal(item);
            });
        });

        tbody.querySelectorAll('.undo-od-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const item = odRequests.find(o => String(o.odId ?? o.OdId) === String(id));
                if (item) openUndoConfirmModal(item);
            });
        });

        tbody.querySelectorAll('.delete-od-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const item = odRequests.find(o => String(o.odId ?? o.OdId) === String(id));
                if (item) {
                    askDelete('odrequest', id, `OD request for "${item.studentName}" (${item.eventName || 'OD'})`);
                }
            });
        });
    }

    document.getElementById('odRequestsSearch')?.addEventListener('input', () => {
        filterAndRenderOdRequests();
    });

    document.getElementById('refreshOdRequestsBtn')?.addEventListener('click', () => {
        loadOdRequests();
    });

    // ── Edit OD Modal Handlers ──
    const editOdModalOverlay = document.getElementById('editOdModalOverlay');
    const editOdForm = document.getElementById('editOdForm');

    function openEditOdModal(od) {
        document.getElementById('editOdId').value = od.odId ?? od.OdId ?? '';
        document.getElementById('editOdStudentName').value = od.studentName ?? od.StudentName ?? '';
        document.getElementById('editOdRegNo').value = od.registerNumber ?? od.RegisterNumber ?? '';
        document.getElementById('editOdDept').value = od.department ?? od.Department ?? '';
        document.getElementById('editOdSection').value = od.section ?? od.Section ?? '';
        document.getElementById('editOdEvent').value = od.eventName ?? od.Event ?? '';
        document.getElementById('editOdCollege').value = od.collegeName ?? od.CollegeIndustry ?? '';
        document.getElementById('editOdFromDate').value = od.fromDate ? String(od.fromDate).slice(0, 10) : '';
        document.getElementById('editOdToDate').value = od.toDate ? String(od.toDate).slice(0, 10) : '';
        document.getElementById('editOdDays').value = od.numberOfDays ?? 1;
        document.getElementById('editOdCompType').value = od.competitionType ?? od.CompetitionType ?? '';
        document.getElementById('editOdStartTime').value = od.startTime ?? '';
        document.getElementById('editOdEndTime').value = od.endTime ?? '';
        document.getElementById('editOdReason').value = od.reason ?? od.Reason ?? '';
        document.getElementById('editOdFacultyStatus').value = od.facultyStatus ?? 'Pending';
        document.getElementById('editOdHodStatus').value = od.hodStatus ?? 'Pending';

        if (editOdModalOverlay) editOdModalOverlay.classList.add('active');
    }

    function closeEditOdModal() {
        if (editOdModalOverlay) editOdModalOverlay.classList.remove('active');
    }

    document.getElementById('editOdModalCloseBtn')?.addEventListener('click', closeEditOdModal);
    document.getElementById('editOdCancelBtn')?.addEventListener('click', closeEditOdModal);
    editOdModalOverlay?.addEventListener('click', (e) => {
        if (e.target === editOdModalOverlay) closeEditOdModal();
    });

    editOdForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editOdId').value;
        if (!id) return;

        const payload = {
            studentName: document.getElementById('editOdStudentName').value.trim(),
            registerNumber: document.getElementById('editOdRegNo').value.trim(),
            department: document.getElementById('editOdDept').value.trim(),
            section: document.getElementById('editOdSection').value.trim(),
            event: document.getElementById('editOdEvent').value.trim(),
            collegeIndustry: document.getElementById('editOdCollege').value.trim(),
            fromDate: document.getElementById('editOdFromDate').value,
            toDate: document.getElementById('editOdToDate').value,
            numberOfDays: parseInt(document.getElementById('editOdDays').value, 10) || 1,
            competitionType: document.getElementById('editOdCompType').value.trim(),
            startTime: document.getElementById('editOdStartTime').value,
            endTime: document.getElementById('editOdEndTime').value,
            reason: document.getElementById('editOdReason').value.trim(),
            facultyStatus: document.getElementById('editOdFacultyStatus').value,
            hodStatus: document.getElementById('editOdHodStatus').value
        };

        if (!payload.studentName || !payload.registerNumber || !payload.department || !payload.event || !payload.fromDate || !payload.toDate) {
            showToast('error', 'Please fill all required fields.');
            return;
        }

        const saveBtn = document.getElementById('editOdSaveBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const res = await fetch(`${API_BASE}/api/Admin/ODRequests/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                showToast('error', text || 'Could not update OD request.');
                return;
            }

            showToast('success', 'OD request updated successfully.');
            closeEditOdModal();
            loadOdRequests();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error while updating OD request.');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    });

    // ── Undo Decision Modal Handlers ──
    const undoConfirmOverlay = document.getElementById('undoConfirmOverlay');

    function openUndoConfirmModal(od) {
        pendingUndoId = od.odId ?? od.OdId;
        document.getElementById('undoConfirmText').textContent =
            `This will reset the Staff and HOD decision for "${od.studentName}" (${od.eventName}) to Pending, allowing Staff and HOD to review and decide again.`;
        if (undoConfirmOverlay) undoConfirmOverlay.classList.add('active');
    }

    function closeUndoConfirmModal() {
        pendingUndoId = null;
        if (undoConfirmOverlay) undoConfirmOverlay.classList.remove('active');
    }

    document.getElementById('undoCancelBtn')?.addEventListener('click', closeUndoConfirmModal);
    undoConfirmOverlay?.addEventListener('click', (e) => {
        if (e.target === undoConfirmOverlay) closeUndoConfirmModal();
    });

    document.getElementById('undoConfirmBtn')?.addEventListener('click', async () => {
        if (!pendingUndoId) return;
        const id = pendingUndoId;
        closeUndoConfirmModal();

        try {
            const res = await fetch(`${API_BASE}/api/Admin/ODRequests/${id}/UndoDecision`, {
                method: 'POST'
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                showToast('error', text || 'Could not undo decision.');
                return;
            }

            showToast('success', 'Decision reset to Pending. Staff and HOD can now review again.');
            loadOdRequests();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error while resetting decision.');
        }
    });

    // ============================================
    // EVENTS MANAGEMENT
    // ============================================
    let events = [];
    const eventForm = document.getElementById('eventForm');
    const eventIdEl = document.getElementById('eventId');
    const eventSubmitBtn = document.getElementById('eventSubmitBtn');
    const eventFormTitle = document.getElementById('eventFormTitle');

    function getEventStatus(ev) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const start = ev.startingDate ? String(ev.startingDate).slice(0, 10) : '';
        const dead = ev.deadlineDate ? String(ev.deadlineDate).slice(0, 10) : '';

        if (start && todayStr < start) {
            return { label: 'Upcoming', badgeClass: 'badge-upcoming' };
        }
        if (dead && todayStr > dead) {
            return { label: 'Expired', badgeClass: 'badge-expired' };
        }
        return { label: 'Going on', badgeClass: 'badge-active' };
    }

    async function loadEvents() {
        try {
            const res = await fetch(`${API_BASE}/api/Events?_=${Date.now()}`, { cache: 'no-store' });
            events = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            events = [];
            showToast('error', 'Failed to load events.');
        }
        setEl('eventsTabCount', events.length);
        renderEvents(events);
    }

    function renderEvents(list) {
        const tbody = document.getElementById('eventsTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No events yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(ev => {
            const id = ev.id ?? ev.Id;
            const active = (ev.isActive ?? ev.IsActive) !== false;
            const statusInfo = getEventStatus(ev);
            const toggleSwitch = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="event" title="Event Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td><b>${esc(ev.eventName ?? ev.EventName)}</b></td>
                <td>${esc(ev.collegeName ?? ev.CollegeName)}</td>
                <td>${fmtOdDate(ev.startingDate ?? ev.StartingDate)}</td>
                <td>${fmtOdDate(ev.deadlineDate ?? ev.DeadlineDate)}</td>
                <td><span class="${statusInfo.badgeClass}">${statusInfo.label}</span></td>
                <td>${toggleSwitch}</td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-btn" title="Edit" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('eventsSearch')?.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (!q) { renderEvents(events); return; }
        renderEvents(events.filter(ev =>
            (ev.eventName ?? ev.EventName ?? '').toLowerCase().includes(q) ||
            (ev.collegeName ?? ev.CollegeName ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('eventsTableBody')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.account-toggle-switch');
        if (toggleBtn) {
            toggleAccountStatus('event', toggleBtn.dataset.toggleId);
            return;
        }

        const id = e.target.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const ev = events.find(x => String(x.id ?? x.Id) === String(id));
        if (!ev) return;

        if (e.target.closest('.delete-btn')) {
            askDelete('event', id, `event "${ev.eventName ?? ev.EventName}"`);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            fillEventForm(ev);
        }
    });

    function fillEventForm(ev) {
        eventIdEl.value = ev.id ?? ev.Id ?? '';
        document.getElementById('eventInputName').value = ev.eventName ?? ev.EventName ?? '';
        document.getElementById('eventCollegeName').value = ev.collegeName ?? ev.CollegeName ?? '';
        document.getElementById('eventStartingDate').value = ev.startingDate ? String(ev.startingDate).slice(0, 10) : '';
        document.getElementById('eventDeadlineDate').value = ev.deadlineDate ? String(ev.deadlineDate).slice(0, 10) : '';
        if (eventSubmitBtn) eventSubmitBtn.textContent = 'Update Event';
        if (eventFormTitle) eventFormTitle.textContent = 'Edit Event';
        document.getElementById('panel-events')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('eventResetBtn')?.addEventListener('click', () => {
        eventForm.reset();
        eventIdEl.value = '';
        if (eventSubmitBtn) eventSubmitBtn.textContent = 'Add Event';
        if (eventFormTitle) eventFormTitle.textContent = 'Add Event';
    });

    eventForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = eventIdEl.value;
        const isEdit = !!id;

        const payload = {
            eventName: document.getElementById('eventInputName').value.trim(),
            collegeName: document.getElementById('eventCollegeName').value.trim(),
            startingDate: document.getElementById('eventStartingDate').value,
            deadlineDate: document.getElementById('eventDeadlineDate').value
        };

        if (!payload.eventName || !payload.collegeName || !payload.startingDate || !payload.deadlineDate) {
            showToast('error', 'Please fill all required fields.');
            return;
        }
        if (payload.startingDate > payload.deadlineDate) {
            showToast('error', 'Deadline date cannot be earlier than Starting date.');
            return;
        }

        if (eventSubmitBtn) eventSubmitBtn.disabled = true;
        try {
            let res;
            if (isEdit) {
                res = await fetch(`${API_BASE}/api/Events/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch(`${API_BASE}/api/Events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                let msg = 'Could not save event.';
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.message) msg = parsed.message;
                } catch {
                    if (text && text.length < 150) msg = text;
                }
                showToast('error', msg);
                return;
            }
            showToast('success', isEdit ? 'Event updated.' : 'Event added.');
            eventForm.reset();
            eventIdEl.value = '';
            if (eventSubmitBtn) eventSubmitBtn.textContent = 'Add Event';
            if (eventFormTitle) eventFormTitle.textContent = 'Add Event';
            loadEvents();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error — could not save event.');
        } finally {
            if (eventSubmitBtn) eventSubmitBtn.disabled = false;
        }
    });

    // ── Initial load ──
    loadStudents();
    loadStaff();
    loadHods();
    loadRequests();
    loadOdRequests();
    loadEvents();
}