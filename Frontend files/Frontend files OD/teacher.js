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
    let allCerts = [];
    let certsLoaded = false;
    let currentFilter = 'pending';

    const sectionMeta = {
        pending: {
            title: 'Pending OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'
        },
        approved: {
            title: 'Accepted OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
        },
        rejected: {
            title: 'Rejected OD Requests',
            emptyTitle: 'No OD Requests Here',
            emptyText: 'No requests found in this category.',
            icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        },
        certificates: {
            title: 'Finished OD Certificates',
            emptyTitle: 'No Finished ODs Yet',
            emptyText: 'Once an approved OD\'s dates are finished, it will appear here.',
            icon: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>'
        }
    };

    // ── Load OD requests (pending/approved/rejected) ──
    async function loadODs() {
        try {
            const res = await fetch(`${API_BASE}/api/Faculty/PendingODs/${encodeURIComponent(dept)}?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { console.error('Load ODs failed:', res.status); return; }
            allODs = await res.json();
            updateCounts(allODs);
            if (currentFilter !== 'certificates') applyFilter(currentFilter);
        } catch (err) { console.error(err); showToast('error', 'Failed to load ODs'); }
    }

    // ── Load certificates (view-only) — faculty-approved ODs whose dates have finished ──
    // Shows BOTH uploaded and not-yet-uploaded, same as HOD page.
    async function loadCertificates() {
        try {
            // Cache-bust: avoids a stale cached response masking a certificate
            // the student just uploaded.
            const res = await fetch(`${API_BASE}/api/Faculty/PendingODs/${encodeURIComponent(dept)}?_=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { console.error('Load certificates failed:', res.status); return; }
            const data = await res.json();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            allCerts = data.filter(o => {
                if (o.facultyStatus !== 'Approved') return false;
                const to = o.toDate ? new Date(o.toDate) : null;
                if (!to || isNaN(to.getTime())) return false;
                to.setHours(0, 0, 0, 0);
                return to < today;
            });
            certsLoaded = true;
            setEl('certificatesCount', allCerts.length);
            if (currentFilter === 'certificates') renderCertificates(searchFilterCerts(allCerts));
        } catch (err) { console.error(err); showToast('error', 'Failed to load certificates'); }
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

    function searchFilterCerts(certs) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput && searchInput.value.trim()) {
            const q = searchInput.value.trim().toLowerCase();
            return certs.filter(c => (c.registerNumber || '').toLowerCase().includes(q));
        }
        return certs;
    }

    function applySectionMeta(filter) {
        const meta = sectionMeta[filter] || sectionMeta.pending;
        setEl('sectionTitleText', meta.title);
        setEl('emptyStateTitle', meta.emptyTitle);
        setEl('emptyStateText', meta.emptyText);
        const iconEl = document.getElementById('sectionTitleIcon');
        if (iconEl) iconEl.innerHTML = meta.icon;
    }

    function applyFilter(filter) {
        currentFilter = filter;
        const searchBox = document.getElementById('searchBox');
        applySectionMeta(filter);

        if (filter === 'certificates') {
            if (searchBox) searchBox.style.display = 'block';
            if (certsLoaded) {
                renderCertificates(searchFilterCerts(allCerts));
            } else {
                if (document.getElementById('requestsContainer')) {
                    document.getElementById('requestsContainer').innerHTML =
                        '<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Loading certificates...</div>';
                }
                loadCertificates();
            }
            return;
        }

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
                        <h3>${od.studentName || ''} ${od.isGroupOd ? `<span class="status-badge" style="font-size:10px;padding:2px 8px;margin-left:6px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3)">GROUP: ${od.groupName || ''}</span>` : ''}</h3>
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
                    ${od.isGroupOd ? renderMemberChips(od) : ''}
                </div>
                ${od.facultyStatus === 'Pending' ? `
                <div class="card-actions">
                    <button class="btn-approve" onclick="approveOD(${od.odId},'${esc(od.studentName)}')">✓ Approve</button>
                    <button class="btn-reject"  onclick="rejectOD(${od.odId},'${esc(od.studentName)}')">✕ Reject</button>
                </div>` : ''}
            </div>`).join('');
    }

    // ── Render certificate cards (view-only — shows BOTH uploaded and not-yet-uploaded) ──
    function renderCertificates(certs) {
        const container = document.getElementById('requestsContainer');
        const empty     = document.getElementById('emptyState');
        setEl('sectionCount', `${certs.length} finished OD${certs.length !== 1 ? 's' : ''}`);

        if (!certs || certs.length === 0) {
            if (container) container.innerHTML = '';
            if (empty) empty.style.display = 'flex';
            return;
        }
        if (empty) empty.style.display = 'none';

        if (container) container.innerHTML = certs.map(od => {
            const rawUrl = od.certificatePhotoUrl || '';
            const resolvedUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`) : '';
            // Cache-bust so a re-uploaded certificate never shows the browser's
            // cached copy of the old file.
            const certUrl = resolvedUrl ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}_=${Date.now()}` : '';
            const isImage = /\.(png|jpe?g|gif|webp)$/i.test(rawUrl);

            return `
            <div class="request-card cert-card">
                <div class="card-header">
                    <div class="student-avatar">${(od.studentName||'S').charAt(0).toUpperCase()}</div>
                    <div class="student-info">
                        <h3>${od.studentName || ''} ${od.isGroupOd ? `<span class="status-badge" style="font-size:10px;padding:2px 8px;margin-left:6px;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3)">GROUP: ${od.groupName || ''}</span>` : ''}</h3>
                        <p>${od.registerNumber || ''} &bull; ${od.department || ''}</p>
                    </div>
                    <span class="status-badge cert-badge">${rawUrl ? 'Certificate Uploaded' : 'Not Uploaded'}</span>
                </div>
                <div class="card-body">
                    <p><strong>Event:</strong> ${od.event || ''}</p>
                    <p><strong>College:</strong> ${od.collegeIndustry || ''}</p>
                    <p><strong>OD Finished:</strong> ${fmtDate(od.fromDate)} → ${fmtDate(od.toDate)}</p>
                </div>
                ${certUrl ? `
                <div class="cert-preview-row">
                    ${isImage
                        ? `<img src="${certUrl}" alt="Certificate" class="cert-thumb" onclick="openCertPreview('${certUrl}','${esc(od.studentName)}')">`
                        : `<div class="cert-file-icon" onclick="openCertPreview('${certUrl}','${esc(od.studentName)}')">
                               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
                                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                   <polyline points="14 2 14 8 20 8"/>
                               </svg>
                           </div>`
                    }
                    <a href="${certUrl}" target="_blank" rel="noopener" class="cert-view-link">View Full Certificate ↗</a>
                </div>` : `<p class="cert-none-text">OD finished — student has not uploaded a certificate yet.</p>`}
            </div>`;
        }).join('');
    }

    // ── Certificate preview modal (view-only, no download/upload controls) ──
    const certPreviewOverlay = document.getElementById('certPreviewOverlay');
    window.openCertPreview = (url, studentName) => {
        setEl('certPreviewTitle', `${studentName || 'Student'}'s Certificate`);
        const img = document.getElementById('certPreviewImage');
        const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);
        if (img) {
            if (isImage) {
                img.src = url;
                img.style.display = 'block';
            } else {
                img.style.display = 'none';
                window.open(url, '_blank');
            }
        }
        if (certPreviewOverlay) certPreviewOverlay.classList.add('active');
    };
    document.getElementById('certPreviewCloseBtn')?.addEventListener('click', () => {
        certPreviewOverlay?.classList.remove('active');
    });
    certPreviewOverlay?.addEventListener('click', (e) => {
        if (e.target === certPreviewOverlay) certPreviewOverlay.classList.remove('active');
    });

    // ── Render group member chips with per-member reject/unreject ──
    function renderMemberChips(od) {
        const members = (od.registerNumbers || '').split(',').map(r => r.trim()).filter(r => r);
        const rejected = (od.facultyRejectedRegisterNumbers || '').split(',').map(r => r.trim()).filter(r => r);

        if (members.length === 0) return '';

        const chips = members.map(reg => {
            const isRejected = rejected.some(r => r.toLowerCase() === reg.toLowerCase());
            return `
                <div class="member-chip-wrap" style="display:inline-block;position:relative;margin:4px 6px 4px 0">
                    <button class="member-chip ${isRejected ? 'rejected' : ''}"
                        onclick="toggleMemberMenu(this, ${od.odId}, '${esc(reg)}')"
                        style="padding:6px 14px;border-radius:100px;font-size:12px;font-weight:600;cursor:pointer;
                               border:1px solid ${isRejected ? 'rgba(239,68,68,0.4)' : 'rgba(99,102,241,0.3)'};
                               background:${isRejected ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.1)'};
                               color:${isRejected ? '#ef4444' : '#a5b4fc'}">
                        ${isRejected ? '✕ ' : ''}${reg}
                    </button>
                    <div class="member-menu" style="display:none;position:absolute;bottom:110%;left:0;z-index:10;
                         background:#1e293b;border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:6px;
                         box-shadow:0 8px 20px rgba(0,0,0,0.4);white-space:nowrap">
                        ${isRejected
                            ? `<button onclick="unrejectMember(${od.odId}, '${esc(reg)}')" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Undo Reject</button>`
                            : `<button onclick="rejectMember(${od.odId}, '${esc(reg)}')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3);border-radius:6px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer">Reject This Member</button>`
                        }
                    </div>
                </div>`;
        }).join('');

        return `<div style="margin-top:10px"><strong style="font-size:12px;color:#94a3b8">Group Members:</strong><div style="margin-top:6px">${chips}</div></div>`;
    }

    // ── Nav filters (Pending / Accepted / Rejected / Certificates) ──
    document.querySelectorAll('.nav-item[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const f = btn.dataset.filter;
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            const clearBtn = document.getElementById('clearSearch');
            if (clearBtn) clearBtn.style.display = 'none';
            applyFilter(f);
        });
    });

    // ── Search (works for OD requests and for certificates) ──
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

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        if (currentFilter === 'certificates') loadCertificates();
        else loadODs();
    });

    // ── Auto-refresh so HOD/email-approved changes reflect without manual refresh ──
    setInterval(() => {
        loadODs();
        if (certsLoaded) loadCertificates();
    }, 15000);

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

    // ── Group member menu toggle ──
    window.toggleMemberMenu = (btn, odId, reg) => {
        document.querySelectorAll('.member-menu').forEach(m => {
            if (m !== btn.nextElementSibling) m.style.display = 'none';
        });
        const menu = btn.nextElementSibling;
        if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };

    window.rejectMember = async (odId, reg) => {
        if (!confirm(`Reject register number ${reg} from this group OD?`)) return;
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/RejectMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} rejected`); loadODs(); }
            else showToast('error', 'Failed to reject member');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    window.unrejectMember = async (odId, reg) => {
        try {
            const res = await fetch(`${API_BASE}/api/OdApply/${odId}/UnrejectMember?registerNumber=${encodeURIComponent(reg)}`, {
                method: 'PUT'
            });
            if (res.ok) { showToast('success', `${reg} rejection undone`); loadODs(); }
            else showToast('error', 'Failed to undo rejection');
        } catch (err) { console.error(err); showToast('error', 'Network error'); }
    };

    // Close member menus when clicking elsewhere
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
    // Load the certificates badge count in the background too, so it's ready before the tab is clicked
    loadCertificates();
});