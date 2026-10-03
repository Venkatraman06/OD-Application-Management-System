const API_BASE = 'https://od-application-backend.onrender.com';

// ============================================
// JWT Admin Auth helpers
// ============================================

function getAdminToken() {
    return sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || localStorage.getItem('userToken') || '';
}

function logoutAdmin() {
    sessionStorage.removeItem('adminToken');
    localStorage.removeItem('adminToken');
    window.location.href = 'admin.html';
}

/**
 * Authenticated fetch wrapper for all Admin API calls.
 * Injects Authorization: Bearer <token>.
 * On 401 → session expired → redirect to login.
 * On 403 → account deactivated → redirect to login.
 */
async function adminFetch(url, options = {}) {
    const token = getAdminToken();
    const headers = Object.assign({}, options.headers || {});
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminToken');
        alert('Your session has expired. Please log in again.');
        window.location.href = 'admin.html';
        throw new Error('Session expired');
    }
    if (res.status === 403) {
        sessionStorage.removeItem('adminToken');
        localStorage.removeItem('adminToken');
        alert('Your Admin account has been deactivated. Please contact another Admin.');
        window.location.href = 'admin.html';
        throw new Error('Account deactivated');
    }
    return res;
}

document.addEventListener('DOMContentLoaded', () => {
    const gateOverlay  = document.getElementById('gateOverlay');
    const adminShell   = document.getElementById('adminShell');
    const loginForm    = document.getElementById('adminLoginForm');
    const adminIdInput = document.getElementById('adminIdInput');
    const pwdInput     = document.getElementById('adminPasswordInput');
    const gateError    = document.getElementById('gateError');
    const gateBtn      = document.getElementById('gateSubmitBtn');

    function showGate() {
        gateOverlay.style.display = 'flex';
        adminShell.style.display  = 'none';
    }

    function unlock() {
        gateOverlay.style.display = 'none';
        adminShell.style.display  = 'flex';
        initAdminApp();
    }

    // If a valid token is already stored, go straight to the dashboard
    if (getAdminToken()) {
        unlock();
    } else {
        showGate();
    }

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const adminId  = adminIdInput.value.trim();
        const password = pwdInput.value;

        if (!adminId || !password) {
            gateError.textContent = 'Please enter your Admin ID and password.';
            return;
        }

        gateBtn.disabled    = true;
        gateBtn.textContent = 'Signing in…';
        gateError.textContent = '';

        try {
            const res = await fetch(`${API_BASE}/api/Admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminId, password })
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                let msg = 'Invalid Admin ID or password.';
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.message) msg = parsed.message;
                } catch { /* plain text */ }
                gateError.textContent = msg;
                return;
            }

            const data = await res.json();
            if (!data.token) {
                gateError.textContent = 'Login failed: no token received.';
                return;
            }

            sessionStorage.setItem('adminToken', data.token);
            localStorage.setItem('adminToken', data.token);
            unlock();
        } catch (err) {
            console.error(err);
            gateError.textContent = 'Network error — could not connect to server.';
        } finally {
            gateBtn.disabled    = false;
            gateBtn.textContent = 'Sign In';
        }
    });
});

// ============================================
// Main admin app (only runs after the gate is unlocked)
// ============================================
function initAdminApp() {
    let students = [];
    let staff = [];
    let hods = [];

    // ── Tabs / Side Navigation ──
    const adminTabsNav = document.querySelector('.admin-tabs');
    if (adminTabsNav) {
        adminTabsNav.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                adminTabsNav.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }

    // ── Logout buttons (header + sidebar) ──
    document.getElementById('adminLogoutBtn')?.addEventListener('click', () => logoutAdmin());
    document.getElementById('adminSidebarLogoutBtn')?.addEventListener('click', () => logoutAdmin());

    // ── Nested sidebar nav ──
    function activateTabPanel(tab) {
        document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`panel-${tab}`);
        if (panel) panel.classList.add('active');
        if (tab === 'users')         { loadStudents(); loadStaff(); loadHods(); }
        else if (tab === 'requests')       loadRequests();
        else if (tab === 'odrequests')     loadOdRequests();
        else if (tab === 'certificates')   loadCertificates();
        else if (tab === 'events')         loadEvents();
        else if (tab === 'settings')       loadAdminSettings();
        else if (tab === 'accounts')       loadAdminAccounts();
    }

    // Parent (group header) buttons — toggle children open/closed
    document.querySelectorAll('.admin-nav-parent').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.group;
            const capGroup = group.charAt(0).toUpperCase() + group.slice(1);
            const childrenEl = document.getElementById(`navChildren${capGroup}`);
            const isOpen = childrenEl?.classList.contains('open');

            // Close all groups first
            document.querySelectorAll('.admin-nav-parent').forEach(other => {
                const og = other.dataset.group;
                const oc = document.getElementById(`navChildren${og.charAt(0).toUpperCase() + og.slice(1)}`);
                if (oc) oc.classList.remove('open');
                other.classList.remove('group-open', 'active');
            });
            document.querySelectorAll('.admin-nav-item:not(.admin-nav-parent)').forEach(b => b.classList.remove('active'));

            if (!isOpen) {
                if (childrenEl) childrenEl.classList.add('open');
                btn.classList.add('group-open', 'active');
                activateTabPanel(btn.dataset.tab);
            }
        });
    });

    // Standalone nav-item buttons (not parent groups)
    document.querySelectorAll('.admin-nav-item:not(.admin-nav-parent)').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.admin-nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-nav-parent').forEach(b => b.classList.remove('group-open'));
            document.querySelectorAll('.admin-nav-children').forEach(c => c.classList.remove('open'));
            document.querySelectorAll('.admin-nav-child').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            activateTabPanel(btn.dataset.tab);
        });
    });

    // Child buttons inside groups
    document.querySelectorAll('.admin-nav-child').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            const userType = btn.dataset.userType;
            const settingsSubtab = btn.dataset.settingsSubtab;

            document.querySelectorAll('.admin-nav-child').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');

            const parentBtn = btn.closest('.admin-nav-group')?.querySelector('.admin-nav-parent');
            if (parentBtn) parentBtn.classList.add('active', 'group-open');
            btn.closest('.admin-nav-children')?.classList.add('open');

            document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`panel-${tab}`);
            if (panel) panel.classList.add('active');

            if (userType) {
                switchUserSubSection(userType);
            } else if (settingsSubtab) {
                loadAdminSettings();
                requestAnimationFrame(() => switchSettingsSubtab(settingsSubtab));
            }
        });
    });

    // ── User Login Sub-Sections ──
    const userSectionStudent = document.getElementById('userSectionStudent');
    const userSectionStaff   = document.getElementById('userSectionStaff');
    const userSectionHod     = document.getElementById('userSectionHod');

    function switchUserSubSection(type) {
        const subtabUserStudent = document.getElementById('subtabUserStudent');
        const subtabUserStaff   = document.getElementById('subtabUserStaff');
        const subtabUserHod     = document.getElementById('subtabUserHod');
        [subtabUserStudent, subtabUserStaff, subtabUserHod].forEach(b => b?.classList.remove('active'));
        [userSectionStudent, userSectionStaff, userSectionHod].forEach(s => {
            if (s) { s.style.display = 'none'; s.classList.remove('active'); }
        });

        if (type === 'students' || type === 'student') {
            subtabUserStudent?.classList.add('active');
            if (userSectionStudent) { userSectionStudent.style.display = 'block'; userSectionStudent.classList.add('active'); }
            loadStudents();
        } else if (type === 'staff') {
            subtabUserStaff?.classList.add('active');
            if (userSectionStaff) { userSectionStaff.style.display = 'block'; userSectionStaff.classList.add('active'); }
            loadStaff();
        } else if (type === 'hod') {
            subtabUserHod?.classList.add('active');
            if (userSectionHod) { userSectionHod.style.display = 'block'; userSectionHod.classList.add('active'); }
            loadHods();
        }
    }

    document.getElementById('subtabUserStudent')?.addEventListener('click', () => switchUserSubSection('students'));
    document.getElementById('subtabUserStaff')?.addEventListener('click', () => switchUserSubSection('staff'));
    document.getElementById('subtabUserHod')?.addEventListener('click', () => switchUserSubSection('hod'));

    // ── Settings Sub-tab switcher ──
    function switchSettingsSubtab(subtab) {
        ['prefix', 'colors', 'academic'].forEach(s => {
            const cap = s.charAt(0).toUpperCase() + s.slice(1);
            const view = document.getElementById(`subtabViewSettings${cap}`);
            const btn  = document.getElementById(`subtabSettings${cap}`);
            if (view) view.style.display = (s === subtab) ? '' : 'none';
            if (btn)  btn.classList.toggle('active', s === subtab);
        });
        document.querySelectorAll('.admin-nav-child[data-settings-subtab]').forEach(c => {
            c.classList.toggle('active', c.dataset.settingsSubtab === subtab);
        });
        if (subtab === 'academic') {
            loadAcademicSemesters();
            checkPromoteCount();
        }
    }
    document.getElementById('subtabSettingsPrefix')?.addEventListener('click', () => switchSettingsSubtab('prefix'));
    document.getElementById('subtabSettingsColors')?.addEventListener('click', () => switchSettingsSubtab('colors'));
    document.getElementById('subtabSettingsAcademic')?.addEventListener('click', () => switchSettingsSubtab('academic'));



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
            const res = await adminFetch(`${API_BASE}/api/${endpoint}`, { method: 'DELETE' });
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
            const res = await adminFetch(`${API_BASE}/api/${endpoint}`, { method: 'PUT' });
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
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="table-empty">Loading OD history...</td></tr>';
        try {
            const res = await adminFetch(API_BASE + '/api/Student/OdHistory?_=' + Date.now(), { cache: 'no-store' });
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
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No OD history found.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const total = s.totalOdCount ?? s.TotalOdCount ?? 0;
            const approved = s.approvedCount ?? s.ApprovedCount ?? 0;
            const rejected = s.rejectedCount ?? s.RejectedCount ?? 0;
            const cat = s.category ?? s.Category ?? 'UG';
            return '<tr>' +
                '<td style="font-weight:600">' + esc(s.studentName ?? s.StudentName ?? s.name ?? s.Name) + '</td>' +
                '<td>' + esc(s.registerNumber ?? s.RegisterNumber) + '</td>' +
                '<td><span class="badge-category ' + (cat === 'PG' ? 'badge-pg' : '') + '">' + esc(cat) + '</span></td>' +
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
            (s.category ?? s.Category ?? '').toLowerCase().includes(q) ||
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
            const res = await adminFetch(`${API_BASE}/api/Student?_=${Date.now()}`, { cache: 'no-store' });
            students = res.ok ? await res.json() : [];
            if (window.setStudentNameLookup) {
                const map = {};
                students.forEach(s => {
                    const r = (s.registerNumber || s.RegisterNumber || '').trim();
                    const n = s.name || s.Name || '';
                    if (r) map[r] = n;
                });
                window.setStudentNameLookup(map);
            }
        } catch (err) {
            console.error(err);
            students = [];
            showToast('error', 'Failed to load students.');
        }
        setEl('studentTabCount', students.length);
        renderStudents(students);
        populateStudentFilterDropdowns();
    }

    function renderStudents(list) {
        const tbody = document.getElementById('studentTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No students yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.studentId ?? s.StudentId;
            const sName = s.name ?? s.Name ?? '';
            const sReg = s.registerNumber ?? s.RegisterNumber ?? '';
            const cat = s.category ?? s.Category ?? 'UG';
            const active = (s.isActive ?? s.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="student" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(sName)}</td>
                <td>${window.renderRegHover(sReg, sName)}</td>
                <td><span class="badge-category ${cat === 'PG' ? 'badge-pg' : ''}">${esc(cat)}</span></td>
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

    function populateStudentFilterDropdowns() {
        const depts = [...new Set(students.map(s => (s.department ?? s.Department ?? '').trim()).filter(Boolean))].sort();
        const secs  = [...new Set(students.map(s => (s.section ?? s.Section ?? '').trim()).filter(Boolean))].sort();
        const deptSel = document.getElementById('studentDeptFilter');
        const secSel  = document.getElementById('studentSectionFilter');
        if (deptSel) {
            const prev = deptSel.value;
            deptSel.innerHTML = '<option value="">All Depts</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
            if (prev) deptSel.value = prev;
        }
        if (secSel) {
            const prev = secSel.value;
            secSel.innerHTML = '<option value="">All Sections</option>' + secs.map(s => `<option value="${s}">Sec ${s}</option>`).join('');
            if (prev) secSel.value = prev;
        }
    }

    function applyStudentFilters() {
        const q    = (document.getElementById('studentSearch')?.value ?? '').trim().toLowerCase();
        const cat  = (document.getElementById('studentCategoryFilter')?.value ?? '').trim().toUpperCase();
        const dept = (document.getElementById('studentDeptFilter')?.value ?? '').trim().toLowerCase();
        const year = (document.getElementById('studentYearFilter')?.value ?? '').trim();
        const sec  = (document.getElementById('studentSectionFilter')?.value ?? '').trim().toLowerCase();
        let list = students;
        if (q)    list = list.filter(s => (s.name ?? s.Name ?? '').toLowerCase().includes(q) || (s.registerNumber ?? s.RegisterNumber ?? '').toLowerCase().includes(q) || (s.email ?? s.Email ?? '').toLowerCase().includes(q));
        if (cat)  list = list.filter(s => (s.category ?? s.Category ?? 'UG').toUpperCase() === cat);
        if (dept) list = list.filter(s => (s.department ?? s.Department ?? '').trim().toLowerCase() === dept);
        if (year) list = list.filter(s => String(s.year ?? s.Year ?? '') === year);
        if (sec)  list = list.filter(s => (s.section ?? s.Section ?? '').trim().toLowerCase() === sec);
        renderStudents(list);
    }

    document.getElementById('studentSearch')?.addEventListener('input', applyStudentFilters);
    document.getElementById('studentCategoryFilter')?.addEventListener('change', applyStudentFilters);
    document.getElementById('studentDeptFilter')?.addEventListener('change', applyStudentFilters);
    document.getElementById('studentYearFilter')?.addEventListener('change', applyStudentFilters);
    document.getElementById('studentSectionFilter')?.addEventListener('change', applyStudentFilters);

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

    // ── User Modals Helper ──
    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }
    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    }

    // Escape key closes any active modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
    });

    // Student Modal Controls
    const studentModalOverlay = document.getElementById('studentModalOverlay');
    const openAddStudentModalBtn = document.getElementById('openAddStudentModalBtn');
    const studentModalCloseBtn = document.getElementById('studentModalCloseBtn');
    const studentCancelBtn = document.getElementById('studentCancelBtn');
    const studentModalTitle = document.getElementById('studentModalTitle');

    openAddStudentModalBtn?.addEventListener('click', () => {
        studentForm?.reset();
        studentIdEl.value = '';
        const catEl = document.getElementById('studentCategory');
        if (catEl) catEl.value = 'UG';
        const studentPasswordHint = document.getElementById('studentPasswordHint');
        if (studentPasswordHint) studentPasswordHint.textContent = '(required for new student)';
        studentSubmitBtn.textContent = 'Add Student';
        if (studentModalTitle) studentModalTitle.textContent = 'Add Student';
        openModal('studentModalOverlay');
    });

    studentModalCloseBtn?.addEventListener('click', () => closeModal('studentModalOverlay'));
    studentCancelBtn?.addEventListener('click', () => closeModal('studentModalOverlay'));
    studentModalOverlay?.addEventListener('click', (e) => {
        if (e.target === studentModalOverlay) closeModal('studentModalOverlay');
    });

    function fillStudentForm(s) {
        studentIdEl.value = s.studentId ?? s.StudentId ?? '';
        document.getElementById('studentName').value = s.name ?? s.Name ?? '';
        document.getElementById('studentRegNo').value = s.registerNumber ?? s.RegisterNumber ?? '';
        const catEl = document.getElementById('studentCategory');
        if (catEl) catEl.value = s.category ?? s.Category ?? 'UG';
        document.getElementById('studentDept').value = s.department ?? s.Department ?? '';
        document.getElementById('studentSection').value = s.section ?? s.Section ?? '';
        document.getElementById('studentYear').value = s.year ?? s.Year ?? '';
        document.getElementById('studentSemester').value = s.semester ?? s.Semester ?? '';
        const dob = s.dob ?? s.dOB ?? s.DOB ?? '';
        document.getElementById('studentDob').value = dob ? String(dob).slice(0, 10) : '';
        document.getElementById('studentEmail').value = s.email ?? s.Email ?? '';
        document.getElementById('studentPassword').value = ''; // never prefill a password
        const studentPasswordHint = document.getElementById('studentPasswordHint');
        if (studentPasswordHint) studentPasswordHint.textContent = '(leave blank to keep existing)';
        studentSubmitBtn.textContent = 'Update Student';
        if (studentModalTitle) studentModalTitle.textContent = 'Edit Student';
        openModal('studentModalOverlay');
    }

    document.getElementById('studentResetBtn')?.addEventListener('click', () => {
        studentForm.reset();
        studentIdEl.value = '';
        const catEl = document.getElementById('studentCategory');
        if (catEl) catEl.value = 'UG';
        const studentPasswordHint = document.getElementById('studentPasswordHint');
        if (studentPasswordHint) studentPasswordHint.textContent = '(required for new student)';
        studentSubmitBtn.textContent = 'Add Student';
    });

    studentForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = studentIdEl.value;
        const isEdit = !!id;

        const payload = {
            name: document.getElementById('studentName').value.trim(),
            registerNumber: document.getElementById('studentRegNo').value.trim(),
            category: document.getElementById('studentCategory')?.value || 'UG',
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
                const body = { ...payload, studentId: parseInt(id, 10) };
                if (!body.password) delete body.password;
                res = await adminFetch(`${API_BASE}/api/Student/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await adminFetch(`${API_BASE}/api/Student`, {
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
            closeModal('studentModalOverlay');
            studentForm.reset();
            studentIdEl.value = '';
            const catEl = document.getElementById('studentCategory');
            if (catEl) catEl.value = 'UG';
            const studentPasswordHint = document.getElementById('studentPasswordHint');
            if (studentPasswordHint) studentPasswordHint.textContent = '(required for new student)';
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
            const res = await adminFetch(`${API_BASE}/api/Faculty?_=${Date.now()}`, { cache: 'no-store' });
            staff = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            staff = [];
            showToast('error', 'Failed to load staff.');
        }
        setEl('staffTabCount', staff.length);
        renderStaff(staff);
        populateStaffFilterDropdowns();
    }

    function renderStaff(list) {
        const tbody = document.getElementById('staffTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No staff yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(s => {
            const id = s.staffId ?? s.StaffId;
            const cat = s.category ?? s.Category ?? 'UG';
            const active = (s.isActive ?? s.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="staff" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(s.name ?? s.Name)}</td>
                <td>${esc(s.rollNumber ?? s.RollNumber)}</td>
                <td><span class="badge-category ${cat === 'PG' ? 'badge-pg' : ''}">${esc(cat)}</span></td>
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

    function populateStaffFilterDropdowns() {
        const depts = [...new Set(staff.map(s => (s.department ?? s.Department ?? '').trim()).filter(Boolean))].sort();
        const deptSel = document.getElementById('staffDeptFilter');
        if (deptSel) {
            const prev = deptSel.value;
            deptSel.innerHTML = '<option value="">All Depts</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
            if (prev) deptSel.value = prev;
        }
    }

    function applyStaffFilters() {
        const q    = (document.getElementById('staffSearch')?.value ?? '').trim().toLowerCase();
        const cat  = (document.getElementById('staffCategoryFilter')?.value ?? '').trim().toUpperCase();
        const dept = (document.getElementById('staffDeptFilter')?.value ?? '').trim().toLowerCase();
        const year = (document.getElementById('staffYearFilter')?.value ?? '').trim();
        let list = staff;
        if (q)    list = list.filter(s => (s.name ?? s.Name ?? '').toLowerCase().includes(q) || (s.rollNumber ?? s.RollNumber ?? '').toLowerCase().includes(q) || (s.email ?? s.Email ?? '').toLowerCase().includes(q));
        if (cat)  list = list.filter(s => (s.category ?? s.Category ?? 'UG').toUpperCase() === cat);
        if (dept) list = list.filter(s => (s.department ?? s.Department ?? '').trim().toLowerCase() === dept);
        if (year) list = list.filter(s => String(s.year ?? s.Year ?? '') === year);
        renderStaff(list);
    }

    document.getElementById('staffSearch')?.addEventListener('input', applyStaffFilters);
    document.getElementById('staffCategoryFilter')?.addEventListener('change', applyStaffFilters);
    document.getElementById('staffDeptFilter')?.addEventListener('change', applyStaffFilters);
    document.getElementById('staffYearFilter')?.addEventListener('change', applyStaffFilters);

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

    // Staff Modal Controls
    const staffModalOverlay = document.getElementById('staffModalOverlay');
    const openAddStaffModalBtn = document.getElementById('openAddStaffModalBtn');
    const staffModalCloseBtn = document.getElementById('staffModalCloseBtn');
    const staffCancelBtn = document.getElementById('staffCancelBtn');
    const staffModalTitle = document.getElementById('staffModalTitle');

    openAddStaffModalBtn?.addEventListener('click', () => {
        staffForm?.reset();
        staffIdEl.value = '';
        const catEl = document.getElementById('staffCategory');
        if (catEl) catEl.value = 'UG';
        const staffPasswordHint = document.getElementById('staffPasswordHint');
        if (staffPasswordHint) staffPasswordHint.textContent = '(required for new staff)';
        staffSubmitBtn.textContent = 'Add Staff';
        if (staffModalTitle) staffModalTitle.textContent = 'Add Staff';
        const previewDiv = document.getElementById('staffCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
        openModal('staffModalOverlay');
    });

    staffModalCloseBtn?.addEventListener('click', () => closeModal('staffModalOverlay'));
    staffCancelBtn?.addEventListener('click', () => closeModal('staffModalOverlay'));
    staffModalOverlay?.addEventListener('click', (e) => {
        if (e.target === staffModalOverlay) closeModal('staffModalOverlay');
    });

    function fillStaffForm(s) {
        staffIdEl.value = s.staffId ?? s.StaffId ?? '';
        document.getElementById('staffName').value = s.name ?? s.Name ?? '';
        document.getElementById('staffRollNumber').value = s.rollNumber ?? s.RollNumber ?? '';
        const catEl = document.getElementById('staffCategory');
        if (catEl) catEl.value = s.category ?? s.Category ?? 'UG';
        document.getElementById('staffDept').value = s.department ?? s.Department ?? '';
        document.getElementById('staffSection').value = s.section ?? s.Section ?? '';
        document.getElementById('staffYear').value = s.year ?? s.Year ?? '';
        document.getElementById('staffEmail').value = s.email ?? s.Email ?? '';
        document.getElementById('staffPassword').value = '';
        const staffPasswordHint = document.getElementById('staffPasswordHint');
        if (staffPasswordHint) staffPasswordHint.textContent = '(leave blank to keep existing)';
        staffSubmitBtn.textContent = 'Update Staff';
        if (staffModalTitle) staffModalTitle.textContent = 'Edit Staff';

        // Show current signature preview if one exists
        const sigUrl = s.signatureUrl ?? s.DigitalSignature ?? null;
        const previewDiv = document.getElementById('staffCurrentSignaturePreview');
        const previewImg = document.getElementById('staffCurrentSignatureImg');
        const sigFile = document.getElementById('staffSignatureFile');
        if (sigUrl && previewDiv && previewImg) {
            previewImg.src = `${API_BASE}${sigUrl}`;
            previewDiv.style.display = 'block';
        } else if (previewDiv) {
            previewDiv.style.display = 'none';
        }
        if (sigFile) sigFile.value = '';

        openModal('staffModalOverlay');
    }

    document.getElementById('staffRemoveSignatureBtn')?.addEventListener('click', async () => {
        const id = staffIdEl.value;
        if (!id) return;
        // To remove, we cannot delete via API in this version — just clear the preview to indicate no new upload
        // (Backend will not delete the file without explicit delete endpoint)
        const previewDiv = document.getElementById('staffCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
        showToast('info', 'Signature preview cleared. Upload a new signature to replace it.');
    });

    document.getElementById('staffResetBtn')?.addEventListener('click', () => {
        staffForm.reset();
        staffIdEl.value = '';
        const catEl = document.getElementById('staffCategory');
        if (catEl) catEl.value = 'UG';
        const staffPasswordHint = document.getElementById('staffPasswordHint');
        if (staffPasswordHint) staffPasswordHint.textContent = '(required for new staff)';
        staffSubmitBtn.textContent = 'Add Staff';
        const previewDiv = document.getElementById('staffCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
    });

    staffForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = staffIdEl.value;
        const isEdit = !!id;

        const yearVal = document.getElementById('staffYear').value;
        const payload = {
            name: document.getElementById('staffName').value.trim(),
            rollNumber: document.getElementById('staffRollNumber').value.trim(),
            category: document.getElementById('staffCategory')?.value || 'UG',
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
            let savedId = id ? parseInt(id, 10) : null;
            if (isEdit) {
                const body = { ...payload, staffId: parseInt(id, 10) };
                if (!body.password) delete body.password;
                // UpdateStaff is a plain PUT api/Faculty (no id in the URL) — id lives in the body
                res = await adminFetch(`${API_BASE}/api/Faculty`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await adminFetch(`${API_BASE}/api/Faculty`, {
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
            const saved = await res.json().catch(() => null);
            savedId = saved?.staffId ?? saved?.StaffId ?? savedId;

            // Upload signature if a file was selected
            const sigFile = document.getElementById('staffSignatureFile');
            if (sigFile?.files?.length && savedId) {
                const formData = new FormData();
                formData.append('signature', sigFile.files[0]);
                const sigRes = await adminFetch(`${API_BASE}/api/Faculty/${savedId}/UploadSignature`, {
                    method: 'POST',
                    body: formData
                });
                if (!sigRes.ok) {
                    const sigText = await sigRes.text().catch(() => '');
                    showToast('warning', `Staff saved but signature upload failed: ${sigText || 'Unknown error'}`);
                } else {
                    showToast('success', isEdit ? 'Staff updated with new signature.' : 'Staff added with signature.');
                }
            } else {
                showToast('success', isEdit ? 'Staff updated.' : 'Staff added.');
            }

            closeModal('staffModalOverlay');
            staffForm.reset();
            staffIdEl.value = '';
            const catEl = document.getElementById('staffCategory');
            if (catEl) catEl.value = 'UG';
            const staffPasswordHint = document.getElementById('staffPasswordHint');
            if (staffPasswordHint) staffPasswordHint.textContent = '(required for new staff)';
            staffSubmitBtn.textContent = 'Add Staff';
            const previewDiv = document.getElementById('staffCurrentSignaturePreview');
            if (previewDiv) previewDiv.style.display = 'none';
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

    // HOD Modal Controls
    const hodModalOverlay = document.getElementById('hodModalOverlay');
    const openAddHodModalBtn = document.getElementById('openAddHodModalBtn');
    const hodModalCloseBtn = document.getElementById('hodModalCloseBtn');
    const hodCancelBtn = document.getElementById('hodCancelBtn');
    const hodModalTitle = document.getElementById('hodModalTitle');

    openAddHodModalBtn?.addEventListener('click', () => {
        hodForm?.reset();
        hodIdEl.value = '';
        const catEl = document.getElementById('hodCategory');
        if (catEl) catEl.value = 'UG';
        const hodPasswordHint = document.getElementById('hodPasswordHint');
        if (hodPasswordHint) hodPasswordHint.textContent = '(required for new HOD)';
        hodSubmitBtn.textContent = 'Add HOD';
        if (hodModalTitle) hodModalTitle.textContent = 'Add HOD';
        const previewDiv = document.getElementById('hodCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
        openModal('hodModalOverlay');
    });

    hodModalCloseBtn?.addEventListener('click', () => closeModal('hodModalOverlay'));
    hodCancelBtn?.addEventListener('click', () => closeModal('hodModalOverlay'));
    hodModalOverlay?.addEventListener('click', (e) => {
        if (e.target === hodModalOverlay) closeModal('hodModalOverlay');
    });

    async function loadHods() {
        try {
            const res = await adminFetch(`${API_BASE}/api/Hod?_=${Date.now()}`, { cache: 'no-store' });
            hods = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            hods = [];
            showToast('error', 'Failed to load HODs.');
        }
        setEl('hodTabCount', hods.length);
        renderHods(hods);
        populateHodFilterDropdowns();
    }

    function renderHods(list) {
        const tbody = document.getElementById('hodTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No HODs yet.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(h => {
            const id = h.hodId ?? h.HodId;
            const cat = h.category ?? h.Category ?? 'UG';
            const active = (h.isActive ?? h.IsActive) !== false;
            const statusBtn = `<button type="button" class="account-toggle-switch ${active ? 'active' : 'inactive'}" data-toggle-id="${id}" data-role="hod" title="Status: ${active ? 'Active (ON)' : 'Deactivated (OFF)'}. Click to turn ${active ? 'OFF' : 'ON'}"><span class="toggle-slider"></span><span class="toggle-text">${active ? 'ON' : 'OFF'}</span></button>`;
            return `
            <tr>
                <td>${esc(h.name ?? h.Name)}</td>
                <td>${esc(h.rollNumber ?? h.RollNumber ?? '-')}</td>
                <td><span class="badge-category ${cat === 'PG' ? 'badge-pg' : ''}">${esc(cat)}</span></td>
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

    function populateHodFilterDropdowns() {
        const depts = [...new Set(hods.map(h => (h.department ?? h.Department ?? '').trim()).filter(Boolean))].sort();
        const deptSel = document.getElementById('hodDeptFilter');
        if (deptSel) {
            const prev = deptSel.value;
            deptSel.innerHTML = '<option value="">All Depts</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
            if (prev) deptSel.value = prev;
        }
    }

    function applyHodFilters() {
        const q    = (document.getElementById('hodSearch')?.value ?? '').trim().toLowerCase();
        const cat  = (document.getElementById('hodCategoryFilter')?.value ?? '').trim().toUpperCase();
        const dept = (document.getElementById('hodDeptFilter')?.value ?? '').trim().toLowerCase();
        let list = hods;
        if (q)    list = list.filter(h => (h.name ?? h.Name ?? '').toLowerCase().includes(q) || (h.rollNumber ?? h.RollNumber ?? '').toLowerCase().includes(q) || (h.email ?? h.Email ?? '').toLowerCase().includes(q));
        if (cat)  list = list.filter(h => (h.category ?? h.Category ?? 'UG').toUpperCase() === cat);
        if (dept) list = list.filter(h => (h.department ?? h.Department ?? '').trim().toLowerCase() === dept);
        renderHods(list);
    }

    document.getElementById('hodSearch')?.addEventListener('input', applyHodFilters);
    document.getElementById('hodCategoryFilter')?.addEventListener('change', applyHodFilters);
    document.getElementById('hodDeptFilter')?.addEventListener('change', applyHodFilters);

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
        const catEl = document.getElementById('hodCategory');
        if (catEl) catEl.value = h.category ?? h.Category ?? 'UG';
        document.getElementById('hodDeptInput').value = h.department ?? h.Department ?? '';
        document.getElementById('hodEmail').value = h.email ?? h.Email ?? '';
        document.getElementById('hodPassword').value = '';
        const hodPasswordHint = document.getElementById('hodPasswordHint');
        if (hodPasswordHint) hodPasswordHint.textContent = '(leave blank to keep existing)';
        hodSubmitBtn.textContent = 'Update HOD';
        if (hodModalTitle) hodModalTitle.textContent = 'Edit HOD';

        // Show current signature preview if one exists
        const sigUrl = h.signatureUrl ?? h.DigitalSignature ?? null;
        const previewDiv = document.getElementById('hodCurrentSignaturePreview');
        const previewImg = document.getElementById('hodCurrentSignatureImg');
        const sigFile = document.getElementById('hodSignatureFile');
        if (sigUrl && previewDiv && previewImg) {
            previewImg.src = `${API_BASE}${sigUrl}`;
            previewDiv.style.display = 'block';
        } else if (previewDiv) {
            previewDiv.style.display = 'none';
        }
        if (sigFile) sigFile.value = '';

        openModal('hodModalOverlay');
    }

    document.getElementById('hodRemoveSignatureBtn')?.addEventListener('click', async () => {
        const id = hodIdEl.value;
        if (!id) return;
        const previewDiv = document.getElementById('hodCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
        showToast('info', 'Signature preview cleared. Upload a new signature to replace it.');
    });

    document.getElementById('hodResetBtn')?.addEventListener('click', () => {
        hodForm.reset();
        hodIdEl.value = '';
        const catEl = document.getElementById('hodCategory');
        if (catEl) catEl.value = 'UG';
        const hodPasswordHint = document.getElementById('hodPasswordHint');
        if (hodPasswordHint) hodPasswordHint.textContent = '(required for new HOD)';
        hodSubmitBtn.textContent = 'Add HOD';
        const previewDiv = document.getElementById('hodCurrentSignaturePreview');
        if (previewDiv) previewDiv.style.display = 'none';
    });

    hodForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = hodIdEl.value;
        const isEdit = !!id;

        const payload = {
            name: document.getElementById('hodName').value.trim(),
            rollNumber: document.getElementById('hodRollNumber').value.trim(),
            category: document.getElementById('hodCategory')?.value || 'UG',
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
            let savedId = id ? parseInt(id, 10) : null;
            if (isEdit) {
                const body = { ...payload, hodId: parseInt(id, 10) };
                if (!body.password) delete body.password;
                res = await adminFetch(`${API_BASE}/api/Hod`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                res = await adminFetch(`${API_BASE}/api/Hod`, {
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
            const saved = await res.json().catch(() => null);
            savedId = saved?.hodId ?? saved?.HodId ?? savedId;

            // Upload signature if a file was selected
            const sigFile = document.getElementById('hodSignatureFile');
            if (sigFile?.files?.length && savedId) {
                const formData = new FormData();
                formData.append('signature', sigFile.files[0]);
                const sigRes = await adminFetch(`${API_BASE}/api/Hod/${savedId}/UploadSignature`, {
                    method: 'POST',
                    body: formData
                });
                if (!sigRes.ok) {
                    const sigText = await sigRes.text().catch(() => '');
                    showToast('warning', `HOD saved but signature upload failed: ${sigText || 'Unknown error'}`);
                } else {
                    showToast('success', isEdit ? 'HOD updated with new signature.' : 'HOD added with signature.');
                }
            } else {
                showToast('success', isEdit ? 'HOD updated.' : 'HOD added.');
            }

            closeModal('hodModalOverlay');
            hodForm.reset();
            hodIdEl.value = '';
            const catEl = document.getElementById('hodCategory');
            if (catEl) catEl.value = 'UG';
            const hodPasswordHint = document.getElementById('hodPasswordHint');
            if (hodPasswordHint) hodPasswordHint.textContent = '(required for new HOD)';
            hodSubmitBtn.textContent = 'Add HOD';
            const previewDiv = document.getElementById('hodCurrentSignaturePreview');
            if (previewDiv) previewDiv.style.display = 'none';
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
            const res = await adminFetch(`${API_BASE}/api/Admin/ContactRequests?_=${Date.now()}`, { cache: 'no-store' });
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
                    const res = await adminFetch(`${API_BASE}/api/Admin/ContactRequests/${id}/Resolve`, { method: 'PUT' });
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
            const res = await adminFetch(`${API_BASE}/api/Admin/ODRequests?_=${Date.now()}`, { cache: 'no-store' });
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
                    <div style="font-weight:600;color:white;">${esc(item.studentName || '-')} <span style="font-size:0.75rem;color:var(--surface-400);font-weight:normal;">(${window.formatOdId ? window.formatOdId(odId) : '#' + odId})</span></div>
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
            const res = await adminFetch(`${API_BASE}/api/Admin/ODRequests/${id}`, {
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
            const res = await adminFetch(`${API_BASE}/api/Admin/ODRequests/${id}/UndoDecision`, {
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
            const res = await adminFetch(`${API_BASE}/api/Events?_=${Date.now()}`, { cache: 'no-store' });
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
                res = await adminFetch(`${API_BASE}/api/Events/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await adminFetch(`${API_BASE}/api/Events`, {
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

    // ============================================
    // CERTIFICATES (PENDING & SUBMITTED)
    // ============================================
    let certPendingList = [];
    let certSubmittedList = [];
    let currentCertSubtab = 'pending';

    const subtabCertPending = document.getElementById('subtabCertPending');
    const subtabCertSubmitted = document.getElementById('subtabCertSubmitted');
    const subtabViewCertPending = document.getElementById('subtabViewCertPending');
    const subtabViewCertSubmitted = document.getElementById('subtabViewCertSubmitted');

    subtabCertPending?.addEventListener('click', () => {
        subtabCertPending.classList.add('active');
        subtabCertSubmitted?.classList.remove('active');
        if (subtabViewCertPending) subtabViewCertPending.style.display = 'block';
        if (subtabViewCertSubmitted) subtabViewCertSubmitted.style.display = 'none';
        currentCertSubtab = 'pending';
        filterAndRenderCertificates();
    });

    subtabCertSubmitted?.addEventListener('click', () => {
        subtabCertSubmitted.classList.add('active');
        subtabCertPending?.classList.remove('active');
        if (subtabViewCertSubmitted) subtabViewCertSubmitted.style.display = 'block';
        if (subtabViewCertPending) subtabViewCertPending.style.display = 'none';
        currentCertSubtab = 'submitted';
        filterAndRenderCertificates();
    });

    async function loadCertificates() {
        const pBody = document.getElementById('certPendingTableBody');
        const sBody = document.getElementById('certSubmittedTableBody');
        if (pBody) pBody.innerHTML = '<tr><td colspan="12" class="table-empty">Loading pending certificates...</td></tr>';
        if (sBody) sBody.innerHTML = '<tr><td colspan="12" class="table-empty">Loading submitted certificates...</td></tr>';

        try {
            const res = await adminFetch(`${API_BASE}/api/Admin/Certificates?_=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                certPendingList = data.pending || [];
                certSubmittedList = data.submitted || [];
            } else {
                certPendingList = [];
                certSubmittedList = [];
                showToast('error', 'Failed to load certificates.');
            }
        } catch (err) {
            console.error(err);
            certPendingList = [];
            certSubmittedList = [];
            showToast('error', 'Network error while loading certificates.');
        }

        setEl('certificatesTabCount', certPendingList.length + certSubmittedList.length);
        setEl('certPendingTabCount', certPendingList.length);
        setEl('certSubmittedTabCount', certSubmittedList.length);

        filterAndRenderCertificates();
    }

    function filterAndRenderCertificates() {
        if (currentCertSubtab === 'pending') {
            const q = (document.getElementById('certPendingSearch')?.value || '').trim().toLowerCase();
            let list = certPendingList;
            if (q) {
                list = list.filter(p =>
                    (p.studentName || '').toLowerCase().includes(q) ||
                    (p.registerNumber || '').toLowerCase().includes(q) ||
                    (p.department || '').toLowerCase().includes(q) ||
                    (p.section || '').toLowerCase().includes(q) ||
                    (p.eventName || '').toLowerCase().includes(q) ||
                    (p.collegeName || '').toLowerCase().includes(q) ||
                    (p.groupName || '').toLowerCase().includes(q)
                );
            }
            renderCertPending(list);
        } else {
            const q = (document.getElementById('certSubmittedSearch')?.value || '').trim().toLowerCase();
            let list = certSubmittedList;
            if (q) {
                list = list.filter(s =>
                    (s.studentName || '').toLowerCase().includes(q) ||
                    (s.registerNumber || '').toLowerCase().includes(q) ||
                    (s.department || '').toLowerCase().includes(q) ||
                    (s.section || '').toLowerCase().includes(q) ||
                    (s.eventName || '').toLowerCase().includes(q) ||
                    (s.collegeName || '').toLowerCase().includes(q) ||
                    (s.winningStatus || '').toLowerCase().includes(q)
                );
            }
            renderCertSubmitted(list);
        }
    }

    function renderCertPending(list) {
        const tbody = document.getElementById('certPendingTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="table-empty">No pending certificates found.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map((item, idx) => {
            const groupTag = item.isGroupOd
                ? `<span class="report-group-pill" style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);margin-top:3px;">Group: ${esc(item.groupName || 'Group')}</span>`
                : '';

            return `
            <tr>
                <td style="color:var(--surface-400);font-size:0.78rem;">${idx + 1}</td>
                <td>
                    <div style="font-weight:600;color:white;">${esc(item.studentName || '-')}</div>
                    ${groupTag}
                </td>
                <td>${window.renderRegHover(item.registerNumber, item.studentName)}</td>
                <td>${esc(item.department || '-')}</td>
                <td>${esc(item.section || '-')}</td>
                <td>${item.year ? 'Year ' + item.year : '-'}</td>
                <td><b>${esc(item.eventName || '-')}</b></td>
                <td>${esc(item.collegeName || '-')}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.72rem;font-weight:600;background:rgba(255,255,255,0.06);">${item.isGroupOd ? 'Group OD' : 'Solo OD'}</span></td>
                <td>
                    <div style="font-size:0.78rem;white-space:nowrap;">${fmtOdDate(item.fromDate)} &rarr; ${fmtOdDate(item.toDate)}</div>
                </td>
                <td>${item.numberOfDays || 1}</td>
                <td style="white-space:nowrap;">
                    <span class="status-badge badge-pending-cert" style="white-space:nowrap;display:inline-block;background:rgba(239,68,68,0.15);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);padding:3px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;">Certificate Pending</span>
                </td>
            </tr>`;
        }).join('');
    }

    function renderCertSubmitted(list) {
        const tbody = document.getElementById('certSubmittedTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="table-empty">No submitted certificates found.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map((item, idx) => {
            const rawUrl = item.certificatePhotoUrl || '';
            const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
            const groupTag = item.isGroupOd
                ? `<span class="report-group-pill" style="display:inline-block;padding:2px 8px;border-radius:100px;font-size:0.7rem;font-weight:700;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);margin-top:3px;">Group: ${esc(item.groupName || 'Group')}</span>`
                : '';

            const verifiedBadge = item.certificateVerified
                ? `<span style="color:#4ade80;font-weight:600;font-size:0.78rem;">✓ Verified</span>`
                : `<span style="color:var(--surface-400);font-size:0.78rem;">Uploaded</span>`;

            return `
            <tr>
                <td style="color:var(--surface-400);font-size:0.78rem;">${idx + 1}</td>
                <td>
                    <div style="font-weight:600;color:white;">${esc(item.studentName || '-')}</div>
                    ${groupTag}
                </td>
                <td>${window.renderRegHover(item.registerNumber, item.studentName)}</td>
                <td>${esc(item.department || '-')}</td>
                <td>${esc(item.section || '-')}</td>
                <td>${item.year ? 'Year ' + item.year : '-'}</td>
                <td><b>${esc(item.eventName || '-')}</b></td>
                <td>${esc(item.collegeName || '-')}</td>
                <td>
                    <div style="font-size:0.78rem;white-space:nowrap;">${fmtOdDate(item.fromDate)} &rarr; ${fmtOdDate(item.toDate)}</div>
                </td>
                <td><span class="status-badge cert-badge">${esc(item.winningStatus || 'Participant')}</span></td>
                <td>${verifiedBadge}</td>
                <td>
                    <div class="row-actions" style="justify-content:center;gap:6px;">
                        <button type="button" class="action-btn view-cert-btn" style="background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#c7d2fe;padding:5px 10px;border-radius:6px;cursor:pointer;font-size:0.78rem;display:inline-flex;align-items:center;gap:4px;" data-url="${esc(resolvedUrl)}" data-name="${esc(item.studentName)}" data-event="${esc(item.eventName)}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                            View
                        </button>
                        <a href="${esc(resolvedUrl)}" download target="_blank" class="action-btn" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);color:#f1f5f9;padding:5px 10px;border-radius:6px;text-decoration:none;font-size:0.78rem;display:inline-flex;align-items:center;gap:4px;" title="Download Certificate">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download
                        </a>
                    </div>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.view-cert-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                const name = btn.dataset.name;
                const ev = btn.dataset.event;
                openAdminCertPreview(url, name, ev);
            });
        });
    }

    document.getElementById('certPendingSearch')?.addEventListener('input', () => {
        filterAndRenderCertificates();
    });

    document.getElementById('certSubmittedSearch')?.addEventListener('input', () => {
        filterAndRenderCertificates();
    });

    document.getElementById('refreshCertPendingBtn')?.addEventListener('click', loadCertificates);
    document.getElementById('refreshCertSubmittedBtn')?.addEventListener('click', loadCertificates);

    // ── In-Page Certificate Preview Modal ──
    const adminCertOverlay = document.getElementById('adminCertPreviewOverlay');
    const adminCertImg = document.getElementById('adminCertPreviewImg');
    const adminCertIframe = document.getElementById('adminCertPreviewIframe');
    const adminCertFallback = document.getElementById('adminCertPreviewFallback');
    const adminCertDownloadBtn = document.getElementById('adminCertDownloadBtn');
    const adminCertTitle = document.getElementById('adminCertPreviewTitle');
    const adminCertSub = document.getElementById('adminCertPreviewSub');

    function openAdminCertPreview(url, studentName, eventName) {
        if (!url) { showToast('error', 'Certificate file not available.'); return; }

        if (adminCertTitle) adminCertTitle.textContent = `${studentName || 'Student'}'s Certificate`;
        if (adminCertSub) adminCertSub.textContent = eventName ? `Event: ${eventName}` : '';
        if (adminCertDownloadBtn) adminCertDownloadBtn.href = url;

        const isPdf = /\.pdf(\?.*)?$/i.test(url);
        const isImg = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);

        if (isPdf) {
            if (adminCertImg) adminCertImg.style.display = 'none';
            if (adminCertFallback) adminCertFallback.style.display = 'none';
            if (adminCertIframe) {
                adminCertIframe.style.display = 'block';
                adminCertIframe.src = url;
            }
        } else if (isImg || !isPdf) {
            if (adminCertIframe) adminCertIframe.style.display = 'none';
            if (adminCertFallback) adminCertFallback.style.display = 'none';
            if (adminCertImg) {
                adminCertImg.style.display = 'block';
                adminCertImg.src = url;
                adminCertImg.onerror = () => {
                    adminCertImg.style.display = 'none';
                    if (adminCertFallback) adminCertFallback.style.display = 'block';
                };
            }
        }

        if (adminCertOverlay) adminCertOverlay.style.display = 'flex';
    }

    function closeAdminCertPreview() {
        if (adminCertOverlay) adminCertOverlay.style.display = 'none';
        if (adminCertIframe) adminCertIframe.src = '';
        if (adminCertImg) adminCertImg.src = '';
    }

    document.getElementById('adminCertPreviewCloseBtn')?.addEventListener('click', closeAdminCertPreview);
    document.getElementById('adminCertPreviewCloseBtn2')?.addEventListener('click', closeAdminCertPreview);
    adminCertOverlay?.addEventListener('click', (e) => {
        if (e.target === adminCertOverlay) closeAdminCertPreview();
    });

    // ── Initial load ──
    loadStudents();
    loadStaff();
    loadHods();
    loadRequests();
    loadOdRequests();
    loadCertificates();
    loadEvents();

    // ============================================
    // ADMIN ACCOUNTS MANAGEMENT
    // ============================================
    let adminAccounts = [];
    const accountForm       = document.getElementById('accountForm');
    const accountIdEl       = document.getElementById('accountId');
    const accountSubmitBtn  = document.getElementById('accountSubmitBtn');
    const accountFormTitle  = document.getElementById('accountFormTitle');
    const accountPasswordHint = document.getElementById('accountPasswordHint');

    async function loadAdminAccounts() {
        const tbody = document.getElementById('accountsTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading admin accounts…</td></tr>';
        try {
            const res = await adminFetch(`${API_BASE}/api/Admin/Accounts?_=${Date.now()}`, { cache: 'no-store' });
            adminAccounts = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            adminAccounts = [];
            showToast('error', 'Failed to load admin accounts.');
        }
        setEl('accountsTabCount', adminAccounts.length);
        renderAdminAccounts(adminAccounts);
    }

    function renderAdminAccounts(list) {
        const tbody = document.getElementById('accountsTableBody');
        if (!tbody) return;
        if (!list.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No admin accounts found.</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(a => {
            const id     = a.id ?? a.Id;
            const active = (a.isActive ?? a.IsActive) !== false;
            const created = a.createdAt ?? a.CreatedAt;
            const createdLabel = created ? new Date(created).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
            const statusPill = active
                ? `<span class="status-pill status-resolved">Active</span>`
                : `<span class="status-pill status-rejected">Inactive</span>`;
            return `
            <tr>
                <td><b>${esc(a.adminId ?? a.AdminId)}</b></td>
                <td>${esc(a.name ?? a.Name ?? '-')}</td>
                <td>${esc(a.email ?? a.Email ?? '-')}</td>
                <td>${statusPill}</td>
                <td style="font-size:0.78rem;color:var(--surface-400);">${createdLabel}</td>
                <td>
                    <div class="row-actions">
                        <button class="row-btn edit-btn" title="Edit" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button class="row-btn" title="${active ? 'Deactivate' : 'Activate'}" data-toggle-id="${id}" style="color:${active ? '#fbbf24' : '#4ade80'};" title="${active ? 'Deactivate' : 'Activate'}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="10"/>${active ? '<line x1="8" y1="12" x2="16" y2="12"/>' : '<line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'}</svg>
                        </button>
                        <button class="row-btn delete-btn" title="Delete" data-id="${id}">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    document.getElementById('accountsTableBody')?.addEventListener('click', async (e) => {
        const toggleBtn = e.target.closest('[data-toggle-id]');
        if (toggleBtn) {
            const id = toggleBtn.dataset.toggleId;
            try {
                const res = await adminFetch(`${API_BASE}/api/Admin/Accounts/${id}/ToggleStatus`, { method: 'PUT' });
                if (!res.ok) { showToast('error', 'Failed to update status.'); return; }
                const data = await res.json();
                showToast('success', data.message || 'Status updated.');
                loadAdminAccounts();
            } catch (err) {
                console.error(err);
                showToast('error', 'Network error updating status.');
            }
            return;
        }

        const id = e.target.closest('[data-id]')?.dataset.id;
        if (!id) return;
        const account = adminAccounts.find(a => String(a.id ?? a.Id) === String(id));
        if (!account) return;

        if (e.target.closest('.delete-btn')) {
            askDelete('adminaccount', id, `admin account "${account.adminId ?? account.AdminId}"`);
            return;
        }
        if (e.target.closest('.edit-btn')) {
            fillAccountForm(account);
        }
    });

    // Route 'adminaccount' kind through the shared delete confirm handler
    const _origDeleteConfirmClick = document.getElementById('deleteConfirmBtn')?._adminAccountKindWired;
    if (!_origDeleteConfirmClick) {
        const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
        if (deleteConfirmBtn) {
            deleteConfirmBtn._adminAccountKindWired = true;
            // Patch the existing pendingDelete handler to support 'adminaccount' kind
            // by intercepting via the existing deleteOverlay flow already wired above.
            // We extend it by adding an extra handler for 'adminaccount' after the fact.
            // Re-wire using a capturing wrapper via a data-kind sentinel:
            const existingHandler = deleteConfirmBtn.onclick;
            deleteConfirmBtn.addEventListener('click', async () => {
                if (!pendingDelete || pendingDelete.kind !== 'adminaccount') return;
                const { id } = pendingDelete;
                pendingDelete = null;
                deleteOverlay.classList.remove('active');
                try {
                    const res = await adminFetch(`${API_BASE}/api/Admin/Accounts/${id}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const text = await res.text().catch(() => '');
                        let msg = 'Delete failed.';
                        try { const p = JSON.parse(text); if (p.message) msg = p.message; } catch { if (text && text.length < 150) msg = text; }
                        showToast('error', msg);
                        return;
                    }
                    showToast('success', 'Admin account deleted.');
                    loadAdminAccounts();
                } catch (err) {
                    console.error(err);
                    showToast('error', 'Network error while deleting admin account.');
                }
            });
        }
    }

    function fillAccountForm(a) {
        accountIdEl.value = a.id ?? a.Id ?? '';
        document.getElementById('accountAdminId').value = a.adminId ?? a.AdminId ?? '';
        document.getElementById('accountName').value    = a.name ?? a.Name ?? '';
        document.getElementById('accountEmail').value   = a.email ?? a.Email ?? '';
        document.getElementById('accountPassword').value = '';
        if (accountFormTitle) accountFormTitle.textContent = 'Edit Admin Account';
        if (accountPasswordHint) accountPasswordHint.textContent = '(leave blank to keep existing)';
        if (accountSubmitBtn) accountSubmitBtn.textContent = 'Update Admin';
        document.getElementById('panel-accounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    document.getElementById('accountResetBtn')?.addEventListener('click', () => {
        accountForm?.reset();
        if (accountIdEl) accountIdEl.value = '';
        if (accountFormTitle) accountFormTitle.textContent = 'Add Admin Account';
        if (accountPasswordHint) accountPasswordHint.textContent = '(required for new account)';
        if (accountSubmitBtn) accountSubmitBtn.textContent = 'Add Admin';
    });

    accountForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id     = accountIdEl.value;
        const isEdit = !!id;

        const payload = {
            adminId:  document.getElementById('accountAdminId').value.trim(),
            name:     document.getElementById('accountName').value.trim(),
            email:    document.getElementById('accountEmail').value.trim(),
            password: document.getElementById('accountPassword').value
        };

        if (!payload.adminId || !payload.name || !payload.email) {
            showToast('error', 'Please fill in Admin ID, Name, and Email.');
            return;
        }
        if (!isEdit && !payload.password) {
            showToast('error', 'Password is required for a new Admin account.');
            return;
        }

        if (accountSubmitBtn) accountSubmitBtn.disabled = true;
        try {
            let res;
            if (isEdit) {
                res = await adminFetch(`${API_BASE}/api/Admin/Accounts/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await adminFetch(`${API_BASE}/api/Admin/Accounts`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                let msg = 'Could not save admin account.';
                try { const p = JSON.parse(text); if (p.message) msg = p.message; } catch { if (text && text.length < 200) msg = text; }
                showToast('error', msg);
                return;
            }
            showToast('success', isEdit ? 'Admin account updated.' : 'Admin account created.');
            accountForm.reset();
            if (accountIdEl) accountIdEl.value = '';
            if (accountFormTitle) accountFormTitle.textContent = 'Add Admin Account';
            if (accountPasswordHint) accountPasswordHint.textContent = '(required for new account)';
            if (accountSubmitBtn) accountSubmitBtn.textContent = 'Add Admin';
            loadAdminAccounts();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error — could not save admin account.');
        } finally {
            if (accountSubmitBtn) accountSubmitBtn.disabled = false;
        }
    });

    // ============================================
    // ACADEMIC CALENDAR MANAGEMENT (ADMIN)
    // ============================================
    let adminCalKeys = [];
    let adminCalIdx = 0;

    function buildAdminCalKeys() {
        if (typeof CollegeWorkingDays === 'undefined') return;
        const seen = new Set();
        CollegeWorkingDays.list.forEach(d => seen.add(d.slice(0, 7)));
        adminCalKeys = [...seen].sort();
    }

    async function loadAdminCalendar() {
        const grid = document.getElementById('adminCalendarGrid');
        const label = document.getElementById('adminCalMonthLabel');
        const prevBtn = document.getElementById('adminCalPrevBtn');
        const nextBtn = document.getElementById('adminCalNextBtn');

        if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.7;">Loading calendar…</div>';
        if (label) label.textContent = '…';

        if (typeof CollegeWorkingDays !== 'undefined' && CollegeWorkingDays.syncWithBackend) {
            await CollegeWorkingDays.syncWithBackend(API_BASE);
        }

        adminCalKeys = [];
        buildAdminCalKeys();
        if (!adminCalKeys.length) {
            if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;opacity:0.6;">Calendar data not available.</div>';
            return;
        }

        const todayKey = new Date().toISOString().slice(0, 7);
        const idx = adminCalKeys.indexOf(todayKey);
        adminCalIdx = idx >= 0 ? idx : 0;

        renderAdminCalendarMonth();
    }

    function renderAdminCalendarMonth() {
        const grid = document.getElementById('adminCalendarGrid');
        const label = document.getElementById('adminCalMonthLabel');
        const prevBtn = document.getElementById('adminCalPrevBtn');
        const nextBtn = document.getElementById('adminCalNextBtn');

        if (!grid || !adminCalKeys.length) return;
        const monthKey = adminCalKeys[adminCalIdx];
        const [yearStr, monStr] = monthKey.split('-');
        const yearNum = parseInt(yearStr, 10);
        const monthNum = parseInt(monStr, 10) - 1;

        if (label) {
            label.textContent = new Date(yearNum, monthNum, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        if (prevBtn) prevBtn.disabled = adminCalIdx <= 0;
        if (nextBtn) nextBtn.disabled = adminCalIdx >= adminCalKeys.length - 1;

        const firstDow = new Date(yearNum, monthNum, 1).getDay();
        const daysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();

        let html = '';
        for (let i = 0; i < firstDow; i++) html += '<div class="calendar-day empty"></div>';

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${yearStr}-${monStr}-${String(day).padStart(2, '0')}`;
            const isWorking = typeof CollegeWorkingDays !== 'undefined' ? CollegeWorkingDays.isWorkingDay(dateStr) : true;
            const special = typeof CollegeWorkingDays !== 'undefined' ? CollegeWorkingDays.getSpecialDay(dateStr) : null;
            const isHoliday = special && special.dayType === 'Holiday';
            const isExam = special && special.dayType === 'Examination';
            const isToday = dateStr === todayStr;
            const specialName = special ? (special.name || special.dayType) : '';

            const formattedDate = `${String(day).padStart(2, '0')}-${monStr}-${yearStr}`;

            let classNames = 'calendar-day';
            if (!isWorking || isHoliday) {
                classNames += ' non-working';
                if (isHoliday) classNames += ' cal-holiday';
            } else {
                classNames += ' working';
                if (isExam) classNames += ' cal-examination';
            }
            if (isToday) classNames += ' cal-today';

            let tooltip = '';
            if (isToday) tooltip += `[Today] `;
            if (isHoliday) tooltip += `${formattedDate}\nHoliday\n${specialName}`;
            else if (!isWorking) tooltip += `Non-working day (${formattedDate})`;
            else if (isExam) tooltip += `${formattedDate}\nExamination\n${specialName}`;
            else tooltip += `Working day (${formattedDate})`;

            html += `<div class="${classNames}" title="${esc(tooltip)}">
                <span>${day}</span>
                ${specialName ? `<span class="cal-special-label">${esc(specialName)}</span>` : (isToday ? '<span class="cal-special-label today-tag">Today</span>' : '')}
            </div>`;
        }

        const totalCells = firstDow + daysInMonth;
        const targetCells = totalCells > 35 ? 42 : 35;
        for (let i = totalCells; i < targetCells; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        grid.innerHTML = html;
    }

    document.getElementById('adminCalPrevBtn')?.addEventListener('click', () => {
        if (adminCalIdx > 0) {
            adminCalIdx--;
            renderAdminCalendarMonth();
        }
    });

    document.getElementById('adminCalNextBtn')?.addEventListener('click', () => {
        if (adminCalIdx < adminCalKeys.length - 1) {
            adminCalIdx++;
            renderAdminCalendarMonth();
        }
    });

    document.getElementById('adminCalRefreshBtn')?.addEventListener('click', () => {
        loadAdminCalendar();
    });

    // ============================================
    // SETTINGS MANAGEMENT (OD PREFIX, CALENDAR COLORS, ACADEMIC CONFIG & PROMOTION)
    // ============================================
    let academicSemestersList = [];
    // Semesters filter & pagination state
    let semFilterCat = '';
    let semFilterYear = '';
    let semFilterSem = '';
    let semCurrentPage = 1;
    const SEM_PAGE_SIZE = 5;

    // Populate the Semester filter dropdown from actual data
    function updateSemesterFilterDropdown() {
        const sel = document.getElementById('semFilterSemester');
        if (!sel) return;
        const currentVal = sel.value;
        const semNums = [...new Set(academicSemestersList.map(i => i.semester ?? i.Semester).filter(Boolean))].sort((a, b) => a - b);
        sel.innerHTML = '<option value="">All</option>' + semNums.map(s => `<option value="${s}"${currentVal == s ? ' selected' : ''}>Semester ${s}</option>`).join('');
    }

    function getFilteredSemesters() {
        return academicSemestersList
            .filter(item => {
                const cat = (item.category ?? item.Category ?? '').toUpperCase();
                const yr = String(item.year ?? item.Year ?? '');
                const sem = String(item.semester ?? item.Semester ?? '');
                if (semFilterCat && cat !== semFilterCat.toUpperCase()) return false;
                if (semFilterYear && yr !== semFilterYear) return false;
                if (semFilterSem && sem !== semFilterSem) return false;
                return true;
            })
            // Latest first: sort by ID descending
            .sort((a, b) => ((b.id ?? b.Id ?? 0) - (a.id ?? a.Id ?? 0)));
    }



    async function loadAdminSettings() {
        try {
            const res = await adminFetch(`${API_BASE}/api/Settings?_=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const settings = await res.json();
                // OD Prefix
                if (document.getElementById('settingOdPrefix')) {
                    document.getElementById('settingOdPrefix').value = settings.OdIdPrefix || settings.odIdPrefix || 'OD-';
                }
                // Colors
                const weekend = settings.CalendarWeekendColor || settings.calendarWeekendColor || '#ef4444';
                const holiday = settings.CalendarHolidayColor || settings.calendarHolidayColor || '#f97316';
                const exam = settings.CalendarExamColor || settings.calendarExamColor || '#10b981';
                const today = settings.CalendarTodayColor || settings.calendarTodayColor || '#3b82f6';
                const workingDay = settings.CalendarWorkingDayColor || settings.calendarWorkingDayColor || '#10b981';

                setCalColorField('settingCalWeekend', 'settingCalWeekendText', weekend);
                setCalColorField('settingCalHoliday', 'settingCalHolidayText', holiday);
                setCalColorField('settingCalExam', 'settingCalExamText', exam);
                setCalColorField('settingCalToday', 'settingCalTodayText', today);
                setCalColorField('settingCalWorkingDay', 'settingCalWorkingDayText', workingDay);
            }
        } catch (err) {
            console.error(err);
            showToast('error', 'Failed to load system settings.');
        }

        loadAcademicSemesters();
        checkPromoteCount();
    }

    function setCalColorField(pickerId, textId, val) {
        const picker = document.getElementById(pickerId);
        const text = document.getElementById(textId);
        if (picker && val) picker.value = val;
        if (text && val) text.value = val;
    }

    // Two-way sync for color pickers and text inputs
    ['settingCalWeekend', 'settingCalHoliday', 'settingCalExam', 'settingCalToday', 'settingCalWorkingDay'].forEach(baseId => {
        const picker = document.getElementById(baseId);
        const text = document.getElementById(`${baseId}Text`);
        picker?.addEventListener('input', () => { if (text) text.value = picker.value; });
        text?.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(text.value.trim())) {
                if (picker) picker.value = text.value.trim();
            }
        });
    });

    // Reset Calendar Colors to default
    document.getElementById('resetCalColorsBtn')?.addEventListener('click', () => {
        setCalColorField('settingCalWeekend', 'settingCalWeekendText', '#ef4444');
        setCalColorField('settingCalHoliday', 'settingCalHolidayText', '#f97316');
        setCalColorField('settingCalExam', 'settingCalExamText', '#10b981');
        setCalColorField('settingCalToday', 'settingCalTodayText', '#3b82f6');
        setCalColorField('settingCalWorkingDay', 'settingCalWorkingDayText', '#10b981');
    });

    // Save OD ID Prefix
    document.getElementById('odPrefixForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const prefix = (document.getElementById('settingOdPrefix')?.value || '').trim();
        if (!prefix) {
            showToast('error', 'Please enter a valid OD ID prefix.');
            return;
        }

        const btn = document.getElementById('saveOdPrefixBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await adminFetch(`${API_BASE}/api/Settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ OdIdPrefix: prefix })
            });
            if (res.ok) {
                localStorage.setItem('od_id_prefix', prefix);
                showToast('success', 'OD ID prefix saved successfully.');
            } else {
                const text = await res.text();
                showToast('error', text || 'Failed to save prefix.');
            }
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error saving prefix.');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Save Calendar Colors
    document.getElementById('calendarColorsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            CalendarWeekendColor: (document.getElementById('settingCalWeekendText')?.value || '#ef4444').trim(),
            CalendarHolidayColor: (document.getElementById('settingCalHolidayText')?.value || '#f97316').trim(),
            CalendarExamColor: (document.getElementById('settingCalExamText')?.value || '#10b981').trim(),
            CalendarTodayColor: (document.getElementById('settingCalTodayText')?.value || '#3b82f6').trim(),
            CalendarWorkingDayColor: (document.getElementById('settingCalWorkingDayText')?.value || '#10b981').trim()
        };

        const btn = document.getElementById('saveCalColorsBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await adminFetch(`${API_BASE}/api/Settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (window.applyCalendarColors) {
                    window.applyCalendarColors(payload);
                }
                localStorage.setItem('od_calendar_colors', JSON.stringify(payload));
                showToast('success', 'Calendar colors updated successfully across all portals.');
                renderAdminCalendarMonth();
            } else {
                const text = await res.text();
                showToast('error', text || 'Failed to save calendar colors.');
            }
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error saving calendar colors.');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ── Academic Semesters List & Management ──
    async function loadAcademicSemesters() {
        const tbody = document.getElementById('academicSemestersTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="table-empty">Loading academic semesters…</td></tr>';

        try {
            const res = await adminFetch(`${API_BASE}/api/Settings/Academic?_=${Date.now()}`, { cache: 'no-store' });
            academicSemestersList = res.ok ? await res.json() : [];
        } catch (err) {
            console.error(err);
            academicSemestersList = [];
            showToast('error', 'Failed to load academic semesters.');
        }

        // Reset to page 1 whenever fresh data is loaded
        semCurrentPage = 1;
        updateSemesterFilterDropdown();
        renderAcademicSemesters();
    }

    function renderAcademicSemesters() {
        const tbody = document.getElementById('academicSemestersTableBody');
        if (!tbody) return;

        const filtered = getFilteredSemesters();
        const totalPages = Math.max(1, Math.ceil(filtered.length / SEM_PAGE_SIZE));
        if (semCurrentPage > totalPages) semCurrentPage = totalPages;

        const startIdx = (semCurrentPage - 1) * SEM_PAGE_SIZE;
        const pageItems = filtered.slice(startIdx, startIdx + SEM_PAGE_SIZE);

        // Update pagination UI
        const infoEl = document.getElementById('semPaginationInfo');
        const prevBtn = document.getElementById('semPrevBtn');
        const nextBtn = document.getElementById('semNextBtn');
        if (infoEl) infoEl.textContent = `Page ${semCurrentPage} of ${totalPages} (${filtered.length} record${filtered.length !== 1 ? 's' : ''})`;
        if (prevBtn) prevBtn.disabled = semCurrentPage <= 1;
        if (nextBtn) nextBtn.disabled = semCurrentPage >= totalPages;

        if (!pageItems.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No academic semesters match the selected filters.</td></tr>';
            return;
        }

        const todayStr = new Date().toISOString().slice(0, 10);

        tbody.innerHTML = pageItems.map(item => {
            const id = item.id ?? item.Id;
            const cat = item.category ?? item.Category ?? 'UG';
            const yr = item.year ?? item.Year;
            const sem = item.semester ?? item.Semester;
            const sDate = item.startDate ? String(item.startDate).slice(0, 10) : '';
            const eDate = item.endDate ? String(item.endDate).slice(0, 10) : '';

            let statusLabel = 'Upcoming';
            let statusBadgeClass = 'badge-upcoming';
            if (todayStr >= sDate && todayStr <= eDate) {
                statusLabel = 'Active';
                statusBadgeClass = 'badge-active';
            } else if (todayStr > eDate) {
                statusLabel = 'Completed';
                statusBadgeClass = 'badge-expired';
            }

            return `
            <tr>
                <td><span class="badge-category ${cat === 'PG' ? 'badge-pg' : ''}">${esc(cat)}</span></td>
                <td><b>Year ${yr}</b></td>
                <td><b>Semester ${sem}</b></td>
                <td>${fmtOdDate(sDate)}</td>
                <td>${fmtOdDate(eDate)}</td>
                <td><span class="${statusBadgeClass}">${statusLabel}</span></td>
                <td style="text-align:center;">
                    <button class="row-btn delete-academic-btn" title="Delete Semester" data-id="${id}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                    </button>
                </td>
            </tr>`;
        }).join('');

        tbody.querySelectorAll('.delete-academic-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                if (!confirm('Are you sure you want to delete this configured semester?')) return;
                try {
                    const res = await adminFetch(`${API_BASE}/api/Settings/Academic/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast('success', 'Academic semester deleted.');
                        loadAcademicSemesters();
                    } else {
                        const t = await res.text();
                        showToast('error', t || 'Failed to delete semester.');
                    }
                } catch (err) {
                    console.error(err);
                    showToast('error', 'Network error deleting semester.');
                }
            });
        });
    }

    // Semester filter event listeners
    document.getElementById('semFilterCategory')?.addEventListener('change', (e) => {
        semFilterCat = e.target.value;
        semCurrentPage = 1;
        renderAcademicSemesters();
    });
    document.getElementById('semFilterYear')?.addEventListener('change', (e) => {
        semFilterYear = e.target.value;
        semCurrentPage = 1;
        renderAcademicSemesters();
    });
    document.getElementById('semFilterSemester')?.addEventListener('change', (e) => {
        semFilterSem = e.target.value;
        semCurrentPage = 1;
        renderAcademicSemesters();
    });
    document.getElementById('semFilterResetBtn')?.addEventListener('click', () => {
        semFilterCat = ''; semFilterYear = ''; semFilterSem = '';
        semCurrentPage = 1;
        const selCat = document.getElementById('semFilterCategory');
        const selYr = document.getElementById('semFilterYear');
        const selSem = document.getElementById('semFilterSemester');
        if (selCat) selCat.value = '';
        if (selYr) selYr.value = '';
        if (selSem) selSem.value = '';
        renderAcademicSemesters();
    });
    document.getElementById('semPrevBtn')?.addEventListener('click', () => {
        if (semCurrentPage > 1) { semCurrentPage--; renderAcademicSemesters(); }
    });
    document.getElementById('semNextBtn')?.addEventListener('click', () => {
        const filtered = getFilteredSemesters();
        const totalPages = Math.ceil(filtered.length / SEM_PAGE_SIZE);
        if (semCurrentPage < totalPages) { semCurrentPage++; renderAcademicSemesters(); }
    });

    // Add Academic Semester Form
    document.getElementById('academicSemesterForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            category: document.getElementById('academicCategory').value,
            year: parseInt(document.getElementById('academicYear').value, 10),
            semester: parseInt(document.getElementById('academicSemester').value, 10),
            startDate: document.getElementById('academicStartDate').value,
            endDate: document.getElementById('academicEndDate').value
        };

        if (!payload.category || !payload.year || !payload.semester || !payload.startDate || !payload.endDate) {
            showToast('error', 'Please fill all fields.');
            return;
        }

        if (payload.startDate >= payload.endDate) {
            showToast('error', 'End Date must be after Start Date.');
            return;
        }

        const btn = document.getElementById('addAcademicSemesterBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await adminFetch(`${API_BASE}/api/Settings/Academic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text();
                let msg = 'Failed to save academic semester.';
                try {
                    const p = JSON.parse(text);
                    if (p.message) msg = p.message;
                } catch {
                    if (text && text.length < 150) msg = text;
                }
                showToast('error', msg);
                return;
            }

            showToast('success', 'Academic semester configuration added.');
            document.getElementById('academicSemesterForm').reset();
            loadAcademicSemesters();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error saving semester.');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // ── Student Promotion Handlers ──
    async function checkPromoteCount() {
        const cat = document.getElementById('promoteCategory')?.value || 'UG';
        const fromYr = parseInt(document.getElementById('promoteFromYear')?.value || '1', 10);
        const display = document.getElementById('promoteCountDisplay');

        if (display) display.textContent = 'Checking…';

        try {
            const res = await adminFetch(`${API_BASE}/api/Admin/PromoteEligibleCount?category=${encodeURIComponent(cat)}&fromYear=${fromYr}&_=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const count = data.count ?? 0;
                if (display) display.textContent = `${count} active student${count === 1 ? '' : 's'} eligible`;
            } else {
                if (display) display.textContent = 'Could not fetch count';
            }
        } catch (err) {
            console.error(err);
            if (display) display.textContent = 'Error fetching count';
        }
    }

    document.getElementById('promoteCategory')?.addEventListener('change', checkPromoteCount);
    document.getElementById('promoteFromYear')?.addEventListener('change', () => {
        const fromYr = parseInt(document.getElementById('promoteFromYear').value, 10);
        const toYrSel = document.getElementById('promoteToYear');
        if (toYrSel) {
            toYrSel.value = String(fromYr + 1);
        }
        checkPromoteCount();
    });
    document.getElementById('checkPromoteCountBtn')?.addEventListener('click', checkPromoteCount);

    const promoteConfirmOverlay = document.getElementById('promoteConfirmOverlay');
    const promoteConfirmText = document.getElementById('promoteConfirmText');

    function openPromoteModal() {
        const cat = document.getElementById('promoteCategory')?.value || 'UG';
        const fromYr = document.getElementById('promoteFromYear')?.value || '1';
        const toYr = document.getElementById('promoteToYear')?.value || '2';
        const countText = document.getElementById('promoteCountDisplay')?.textContent || '';

        if (promoteConfirmText) {
            promoteConfirmText.textContent = `Are you sure you want to promote all eligible ${cat} Year ${fromYr} students to Year ${toYr}? (${countText}). Their semester will automatically be updated based on configured dates.`;
        }
        if (promoteConfirmOverlay) promoteConfirmOverlay.classList.add('active');
    }

    function closePromoteModal() {
        if (promoteConfirmOverlay) promoteConfirmOverlay.classList.remove('active');
    }

    document.getElementById('promoteStudentsBtn')?.addEventListener('click', openPromoteModal);
    document.getElementById('promoteCancelBtn')?.addEventListener('click', closePromoteModal);
    promoteConfirmOverlay?.addEventListener('click', (e) => {
        if (e.target === promoteConfirmOverlay) closePromoteModal();
    });

    document.getElementById('promoteConfirmDoBtn')?.addEventListener('click', async () => {
        closePromoteModal();
        const payload = {
            category: document.getElementById('promoteCategory')?.value || 'UG',
            fromYear: parseInt(document.getElementById('promoteFromYear')?.value || '1', 10),
            toYear: parseInt(document.getElementById('promoteToYear')?.value || '2', 10)
        };

        const btn = document.getElementById('promoteStudentsBtn');
        if (btn) btn.disabled = true;

        try {
            const res = await adminFetch(`${API_BASE}/api/Admin/PromoteStudents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const text = await res.text();
                let msg = 'Promotion failed.';
                try {
                    const p = JSON.parse(text);
                    if (p.message) msg = p.message;
                } catch {
                    if (text && text.length < 150) msg = text;
                }
                showToast('error', msg);
                return;
            }

            const data = await res.json();
            showToast('success', data.message || 'Students promoted successfully.');
            checkPromoteCount();
            loadStudents();
        } catch (err) {
            console.error(err);
            showToast('error', 'Network error during student promotion.');
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}