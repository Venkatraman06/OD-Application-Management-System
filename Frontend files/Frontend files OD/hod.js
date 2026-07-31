const API_BASE = 'http://localhost:5088';
document.addEventListener('DOMContentLoaded', async () => {
    const hodId = localStorage.getItem('hodId');
    const dept  = localStorage.getItem('userDept');
    if (!hodId || !dept) { window.location.href = 'index.html'; return; }

    const name = localStorage.getItem('userName') || 'HOD';

    // ── Set HOD details ──
    setEl('hodName', name);
    setEl('hodDept', dept);
    setEl('hodID',   'HOD' + hodId);
    const avatar = document.getElementById('hodAvatar');
    if (avatar) { const sp = avatar.querySelector('span'); if (sp) sp.textContent = name.charAt(0).toUpperCase(); }

    let allODs = [];
    let currentFilter = 'pending';

    async function loadODs() {
        try {
            const res = await fetch(`${API_BASE}/api/Hod/ApprovedByFaculty/${encodeURIComponent(dept)}`);
            if (!res.ok) { console.error('Load ODs failed:', res.status); return; }
            allODs = await res.json();
            updateCounts(allODs);
            applyFilter(currentFilter);
        } catch (err) { console.error(err); showToast('error', 'Failed to load ODs'); }
    }

    function updateCounts(ods) {
        const pending  = ods.filter(o => o.hodStatus === 'Pending').length;
        const approved = ods.filter(o => o.hodStatus === 'Approved').length;
        const rejected = ods.filter(o => o.hodStatus === 'Rejected').length;

        setEl('statTotal',    ods.length);
        setEl('statPending',  pending);
        setEl('statApproved', approved);
        setEl('pendingCount',  pending);
        setEl('approvedCount', approved);
        setEl('rejectedCount', rejected);
    }

    function applyFilter(filter) {
        currentFilter = filter;
        const searchBox = document.getElementById('searchBox');
        if (searchBox) searchBox.style.display = (filter === 'approved' || filter === 'rejected') ? 'block' : 'none';

        let filtered;
        if      (filter === 'pending')  filtered = allODs.filter(o => o.hodStatus === 'Pending');
        else if (filter === 'approved') filtered = allODs.filter(o => o.hodStatus === 'Approved');
        else if (filter === 'rejected') filtered = allODs.filter(o => o.hodStatus === 'Rejected');
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
                        <h3>${od.studentName || ''} ${od.isGroupOd ? `<span class="status-badge" style="font-size:10px;padding:2px 8px;margin-left:6px;background:rgba(14,165,233,0.15);color:#7dd3fc;border:1px solid rgba(14,165,233,0.3)">GROUP: ${od.groupName || ''}</span>` : ''}</h3>
                        <p>${od.registerNumber || ''} &bull; ${od.department || ''} &bull; Year ${od.year || ''}</p>
                    </div>
                    <span class="status-badge approved">Faculty ✓</span>
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
                    ${od.isGroupOd ? renderMemberChipsHod(od) : ''}
                </div>
                ${od.hodStatus === 'Pending' ? `
                <div class="card-actions">
                    <button class="btn-approve" onclick="approveOD(${od.odId},'${esc(od.studentName)}')">✓ Final Approve</button>
                    <button class="btn-reject"  onclick="rejectOD(${od.odId},'${esc(od.studentName)}')">✕ Reject</button>
                </div>` : ''}
            </div>`).join('');
    }

    // ── Render group member chips for HOD (view faculty rejections, allow override) ──
    function renderMemberChipsHod(od) {
        const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const rejected = (od.facultyRejectedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const overridden = (od.hodApprovedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);

        if (members.length === 0) return '';

        const chips = members.map(reg => {
            const wasRejected = rejected.some(r => r.toLowerCase() === reg.toLowerCase());
            const isOverridden = overridden.some(r => r.toLowerCase() === reg.toLowerCase());
            const showAsRejected = wasRejected && !isOverridden;

            return `
                <div class="member-chip-wrap" style="display:inline-block;position:relative;margin:4px 6px 4px 0">
                    <button class="member-chip" ${showAsRejected ? `onclick="toggleMemberMenuHod(this, ${od.odId}, '${esc(reg)}')"` : ''}
                        style="padding:6px 14px;border-radius:100px;font-size:12px;font-weight:600;
                               cursor:${showAsRejected ? 'pointer' : 'default'};
                               border:1px solid ${showAsRejected ? 'rgba(239,68,68,0.4)' : isOverridden ? 'rgba(16,185,129,0.4)' : 'rgba(14,165,233,0.3)'};
                               background:${showAsRejected ? 'rgba(239,68,68,0.15)' : isOverridden ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.1)'};
                               color:${showAsRejected ? '#ef4444' : isOverridden ? '#10b981' : '#7dd3fc'}">
                        ${showAsRejected ? '✕ ' : isOverridden ? '✓ ' : ''}${reg}
                    </button>
                    ${showAsRejected ? `
                    <div class="member-menu" style="display:none;position:absolute;bottom:110%;left:0;z-index:10;
                         background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px;
                         box-shadow:0 8px 20px rgba(0,0,0,0.4);white-space:nowrap">
                        <button onclick="hodOverrideMember(${od.odId}, '${esc(reg)}')" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Approve Anyway</button>
                    </div>` : ''}
                </div>`;
        }).join('');

        return `<div style="margin-top:10px"><strong style="font-size:12px;color:#94a3b8">Group Members:</strong><div style="margin-top:6px">${chips}</div></div>`;
    }

    // ── Nav filters ──
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            applyFilter(btn.dataset.filter);
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

    window.approveOD = async (odId, name) => {
        if (!confirm(`Grant final HOD approval for ${name}?`)) return;
        await updateStatus(odId, 'Approved');
    };
    window.rejectOD = async (odId, name) => {
        if (!confirm(`Reject OD for ${name}?`)) return;
        await updateStatus(odId, 'Rejected');
    };

    async function updateStatus(odId, status) {
        try {
            const res = await fetch(`${API_BASE}/api/Hod/FinalApprove/${odId}?status=${status}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                showToast('success', `OD ${status.toLowerCase()} by HOD!`);
                if (status === 'Approved') {
                    const overlay = document.getElementById('successOverlay');
                    if (overlay) {
                        overlay.style.display = 'flex';
                        document.getElementById('successClose')?.addEventListener('click', () => {
                            overlay.style.display = 'none'; loadODs();
                        }, { once: true });
                    } else loadODs();
                } else loadODs();
            } else showToast('error', 'Failed to update');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    }

    window.toggleMemberMenuHod = (btn, odId, reg) => {
        document.querySelectorAll('.member-menu').forEach(m => {
            if (m !== btn.nextElementSibling) m.style.display = 'none';
        });
        const menu = btn.nextElementSibling;
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };

    window.hodOverrideMember = async (odId, reg) => {
        if (!confirm(`Approve ${reg} despite faculty rejection?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/HodOverrideMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} approved by HOD override`); loadODs(); }
            else showToast('error', 'Failed to override');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.member-chip-wrap')) {
            document.querySelectorAll('.member-menu').forEach(m => m.style.display = 'none');
        }
    });

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
