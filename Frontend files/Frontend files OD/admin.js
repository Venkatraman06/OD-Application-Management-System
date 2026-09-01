const API_BASE = 'http://localhost:5088';

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
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`panel-${btn.dataset.tab}`)?.classList.add('active');
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

    // ── Delete confirmation modal (shared across all 3 tables) ──
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
            const endpoint = kind === 'student' ? `Student/${id}` : kind === 'staff' ? `Faculty/${id}` : `Hod/${id}`;
            const res = await fetch(`${API_BASE}/api/${endpoint}`, { method: 'DELETE' });
            if (!res.ok) { showToast('error', 'Delete failed.'); return; }
            showToast('success', 'Deleted.');
            if (kind === 'student') loadStudents();
            else if (kind === 'staff') loadStaff();
            else loadHods();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error while deleting.');
        }
        pendingDelete = null;
    });

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
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No students yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.studentId ?? s.StudentId;
            return `
            <tr>
                <td>${esc(s.name ?? s.Name)}</td>
                <td>${esc(s.registerNumber ?? s.RegisterNumber)}</td>
                <td>${esc(s.department ?? s.Department)}</td>
                <td>${esc(s.section ?? s.Section ?? '-')}</td>
                <td>${esc(s.year ?? s.Year)}</td>
                <td>${esc(s.semester ?? s.Semester)}</td>
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
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No staff yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.staffId ?? s.StaffId;
            return `
            <tr>
                <td>${esc(s.name ?? s.Name)}</td>
                <td>${esc(s.rollNumber ?? s.RollNumber)}</td>
                <td>${esc(s.department ?? s.Department)}</td>
                <td>${esc(s.section ?? s.Section ?? '-')}</td>
                <td>${esc(s.email ?? s.Email)}</td>
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

        const payload = {
            name: document.getElementById('staffName').value.trim(),
            rollNumber: document.getElementById('staffRollNumber').value.trim(),
            department: document.getElementById('staffDept').value.trim(),
            section: document.getElementById('staffSection').value.trim(),
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
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No HODs yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(h => {
            const id = h.hodId ?? h.HodId;
            return `
            <tr>
                <td>${esc(h.name ?? h.Name)}</td>
                <td>${esc(h.department ?? h.Department)}</td>
                <td>${esc(h.email ?? h.Email ?? '-')}</td>
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
            (h.department ?? h.Department ?? '').toLowerCase().includes(q)
        ));
    });

    document.getElementById('hodTableBody')?.addEventListener('click', (e) => {
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

    // ── Initial load ──
    loadStudents();
    loadStaff();
    loadHods();
}