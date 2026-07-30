const API_BASE = 'http://localhost:5088';

document.addEventListener('DOMContentLoaded', async () => {
    const facultyId = localStorage.getItem('facultyId');
    const dept      = localStorage.getItem('userDept');
    if (!facultyId || !dept) { window.location.href = 'index.html'; return; }

    const name = localStorage.getItem('userName') || 'Faculty';

    // ── Set faculty details ──
    setEl('teacherName', name);
    setEl('teacherDept', dept);
    setEl('teacherID',   'FAC' + facultyId);
    const avatar = document.getElementById('teacherAvatar');
    if (avatar) { const sp = avatar.querySelector('span'); if (sp) sp.textContent = name.charAt(0).toUpperCase(); }

    // ── Stat pills: set correct IDs ──
    const statTotalEl   = document.querySelector('#statTotal .stat-number') || document.getElementById('statTotal');
    const statPendingEl = document.querySelector('#statPending .stat-number') || document.getElementById('statPending');

    let allODs = [];
    let currentFilter = 'pending';

    // ── Load ODs ──
    async function loadODs() {
        try {
            const res = await fetch(`${API_BASE}/api/Faculty/PendingODs/${encodeURIComponent(dept)}`);
            if (!res.ok) { console.error('Load ODs failed:', res.status); return; }
            allODs = await res.json();
            updateCounts(allODs);
            applyFilter(currentFilter);
        } catch (err) { console.error(err); showToast('error', 'Failed to load ODs'); }
    }

    function updateCounts(ods) {
        const total    = ods.length;
        const pending  = ods.filter(o => o.facultyStatus === 'Pending').length;
        const approved = ods.filter(o => o.facultyStatus === 'Approved').length;
        const rejected = ods.filter(o => o.facultyStatus === 'Rejected').length;

        if (statTotalEl)   statTotalEl.textContent   = total;
        if (statPendingEl) statPendingEl.textContent = pending;
        setEl('pendingCount',  pending);
        setEl('approvedCount', approved);
        setEl('rejectedCount', rejected);
    }

    function applyFilter(filter) {
        currentFilter = filter;
        const searchBox = document.getElementById('searchBox');

        // show search only for approved/rejected
        if (searchBox) searchBox.style.display = (filter === 'approved' || filter === 'rejected') ? 'block' : 'none';

        let filtered;
        if      (filter === 'pending')  filtered = allODs.filter(o => o.facultyStatus === 'Pending');
        else if (filter === 'approved') filtered = allODs.filter(o => o.facultyStatus === 'Approved');
        else if (filter === 'rejected') filtered = allODs.filter(o => o.facultyStatus === 'Rejected');
        else filtered = allODs;

        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            filtered = filtered.filter(o => (o.registerNumber||'').toLowerCase().includes(q));
        }

        renderODs(filtered, filter);
    }

    function renderODs(ods, filter) {
        const container = document.getElementById('requestsContainer');
        const empty     = document.getElementById('emptyState');
        setEl('sectionCount', `${ods.length} request${ods.length !== 1 ? 's' : ''}`);

        if (!ods || ods.length === 0) {
            if (container) container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';
        if (container) container.innerHTML = ods.map(od => `
            <div class="request-card">
                <div class="card-header">
                    <div class="student-avatar">${(od.studentName||'S').charAt(0).toUpperCase()}</div>
                    <div class="student-info">
                        <h3>${od.studentName || ''}</h3>
                        <p>${od.registerNumber || ''} &bull; ${od.department || ''} &bull; Year ${od.year || ''}</p>
                    </div>
                    <span class="status-badge ${bdg(od.facultyStatus)}">${od.facultyStatus || 'Pending'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Event:</strong> ${od.event || ''}</p>
                    <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                    <p><strong>Dates:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)} &nbsp;|&nbsp; <strong>Days:</strong> ${od.numberOfDays || ''}</p>
                    <p><strong>Applied On:</strong> ${fmtDT(od.appliedDate)}</p>
                    <p><strong>Reason:</strong> ${od.reason || ''}</p>
                    <p style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06)">
                        <strong>HOD Status:</strong>
                        <span class="status-badge ${bdg(od.hodStatus)}" style="font-size:11px;padding:2px 10px;margin-left:6px">${od.hodStatus || 'Pending'}</span>
                    </p>
                </div>
                ${od.facultyStatus === 'Pending' ? `
                <div class="card-actions">
                    <button class="btn-approve" onclick="approveOD(${od.odId},'${esc(od.studentName)}')">✓ Approve</button>
                    <button class="btn-reject"  onclick="rejectOD(${od.odId},'${esc(od.studentName)}')">✕ Reject</button>
                </div>` : ''}
            </div>`).join('');
    }

    // ── Nav filters ──
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const f = btn.dataset.filter;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            applyFilter(f);
        });
    });

    // ── Search ──
    const searchInput = document.getElementById('searchInput');
    const clearBtn    = document.getElementById('clearSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            if (clearBtn) clearBtn.style.display = searchInput.value ? 'block' : 'none';
            applyFilter(currentFilter);
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            clearBtn.style.display = 'none';
            applyFilter(currentFilter);
        });
    }

    document.getElementById('refreshBtn')?.addEventListener('click', loadODs);
    // ── Auto-refresh so HOD/email-approved changes reflect without manual refresh ──
    setInterval(loadODs, 15000);

    window.approveOD = async (odId, name) => { if (confirm(`Approve OD for ${name}?`)) await updateStatus(odId, 'Approved'); };
    window.rejectOD  = async (odId, name) => { if (confirm(`Reject OD for ${name}?`))  await updateStatus(odId, 'Rejected'); };

    async function updateStatus(odId, status) {
        try {
            const res = await fetch(`${API_BASE}/api/Faculty/Approve/${odId}?status=${status}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) { showToast('success', `OD ${status.toLowerCase()}!`); loadODs(); }
            else showToast('error', 'Failed to update');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    }

    function bdg(s) { return s === 'Approved' ? 'approved' : s === 'Rejected' ? 'rejected' : 'pending'; }
    function fmtDate(d) { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB'); } catch { return d; } }
    function fmtDT(d)   { if (!d) return ''; try { const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB') + ' ' + dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); } catch { return d; } }
    function esc(s) { return (s||'').replace(/'/g, "\\'"); }
    function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val ?? ''; }
    function showToast(type, msg) {
        const c = document.getElementById('toastContainer'); if (!c) return;
        const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg;
        c.appendChild(t); setTimeout(() => t.remove(), 3500);
    }

    document.getElementById('logoutBtn')?.addEventListener('click', () => { localStorage.clear(); window.location.href = 'index.html'; });

    loadODs();
});
