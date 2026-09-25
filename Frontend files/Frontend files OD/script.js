const API_BASE = 'http://localhost:5088';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const rollNumberInput = document.getElementById('rollNumber');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePassword');
    const loginButton = document.getElementById('loginButton');

    togglePasswordBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        const eyeOpen = togglePasswordBtn.querySelector('.eye-open');
        const eyeClosed = togglePasswordBtn.querySelector('.eye-closed');
        eyeOpen.style.display = isPassword ? 'none' : 'block';
        eyeClosed.style.display = isPassword ? 'block' : 'none';
    });

    rollNumberInput.addEventListener('input', () => clearError('rollno'));
    passwordInput.addEventListener('input', () => clearError('password'));

    // ── Contact Admin modal ──────────────────────────────────────────────
    const signupLink = document.getElementById('signupLink');
    const contactAdminOverlay = document.getElementById('contactAdminOverlay');
    const contactAdminClose = document.getElementById('contactAdminClose');
    const contactAdminForm = document.getElementById('contactAdminForm');
    const contactAdminSubmit = document.getElementById('contactAdminSubmit');

    if (signupLink && contactAdminOverlay) {
        signupLink.addEventListener('click', (e) => {
            e.preventDefault();
            contactAdminOverlay.style.display = 'flex';
        });

        contactAdminClose.addEventListener('click', () => {
            contactAdminOverlay.style.display = 'none';
        });

        contactAdminOverlay.addEventListener('click', (e) => {
            if (e.target === contactAdminOverlay) contactAdminOverlay.style.display = 'none';
        });

        contactAdminForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const registerNumber = document.getElementById('contactRegNo').value.trim();
            const dob = document.getElementById('contactDob').value;
            const password = document.getElementById('contactPassword').value.trim();
            const role = document.getElementById('contactRole').value;
            const message = document.getElementById('contactReport').value.trim();

            if (!registerNumber || !dob || !password || !message) {
                showToast('error', 'Please fill in all fields');
                return;
            }

            setContactLoading(true);

            try {
                const response = await fetch(`${API_BASE}/api/Admin/ContactAdmin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registerNumber, dob, password, role, message })
                });

                if (response.ok) {
                    showToast('success', 'Your request has been sent to the admin.');
                    contactAdminForm.reset();
                    contactAdminOverlay.style.display = 'none';
                } else {
                    const err = await response.json().catch(() => ({}));
                    showToast('error', err.message || 'Could not send your request.');
                }
            } catch (err) {
                console.error('Contact admin error:', err);
                showToast('error', 'Could not reach the server. Please try again.');
            } finally {
                setContactLoading(false);
            }
        });
    }

    function setContactLoading(on) {
        const btnText = contactAdminSubmit.querySelector('.btn-text');
        const btnLoader = contactAdminSubmit.querySelector('.btn-loader');
        if (btnText) btnText.style.display = on ? 'none' : 'block';
        if (btnLoader) btnLoader.style.display = on ? 'block' : 'none';
        contactAdminSubmit.disabled = on;
    }

    // ── Forgot Password flow ─────────────────────────────────────────────
    const forgotPasswordLink = document.getElementById('forgotPassword');
    const forgotPasswordOverlay = document.getElementById('forgotPasswordOverlay');
    const forgotPasswordClose = document.getElementById('forgotPasswordClose');
    const forgotModalTitle = document.getElementById('forgotModalTitle');

    const forgotStep1Form = document.getElementById('forgotStep1Form');
    const forgotEmailInput = document.getElementById('forgotEmail');
    const forgotSendCodeBtn = document.getElementById('forgotSendCodeBtn');

    const forgotStep2Form = document.getElementById('forgotStep2Form');
    const forgotCodeInput = document.getElementById('forgotCode');
    const forgotEmailDisplay = document.getElementById('forgotEmailDisplay');
    const forgotVerifyCodeBtn = document.getElementById('forgotVerifyCodeBtn');
    const forgotBackToStep1Btn = document.getElementById('forgotBackToStep1Btn');
    const forgotResendLink = document.getElementById('forgotResendLink');

    const forgotStep3Form = document.getElementById('forgotStep3Form');
    const forgotNewPasswordInput = document.getElementById('forgotNewPassword');
    const forgotConfirmPasswordInput = document.getElementById('forgotConfirmPassword');
    const forgotResetSubmitBtn = document.getElementById('forgotResetSubmitBtn');
    const toggleForgotNewPasswordBtn = document.getElementById('toggleForgotNewPassword');
    const toggleForgotConfirmPasswordBtn = document.getElementById('toggleForgotConfirmPassword');

    toggleForgotNewPasswordBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!forgotNewPasswordInput) return;
        const isPass = forgotNewPasswordInput.type === 'password';
        forgotNewPasswordInput.type = isPass ? 'text' : 'password';
        const eyeOpen = toggleForgotNewPasswordBtn.querySelector('.eye-open');
        const eyeClosed = toggleForgotNewPasswordBtn.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = isPass ? 'none' : 'block';
        if (eyeClosed) eyeClosed.style.display = isPass ? 'block' : 'none';
    });

    toggleForgotConfirmPasswordBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!forgotConfirmPasswordInput) return;
        const isPass = forgotConfirmPasswordInput.type === 'password';
        forgotConfirmPasswordInput.type = isPass ? 'text' : 'password';
        const eyeOpen = toggleForgotConfirmPasswordBtn.querySelector('.eye-open');
        const eyeClosed = toggleForgotConfirmPasswordBtn.querySelector('.eye-closed');
        if (eyeOpen) eyeOpen.style.display = isPass ? 'none' : 'block';
        if (eyeClosed) eyeClosed.style.display = isPass ? 'block' : 'none';
    });

    const forgotStep4Success = document.getElementById('forgotStep4Success');
    const forgotSuccessLoginBtn = document.getElementById('forgotSuccessLoginBtn');

    let currentResetEmail = '';
    let verifiedResetCode = '';

    function showForgotStep(step) {
        if (forgotStep1Form) forgotStep1Form.style.display = step === 1 ? 'block' : 'none';
        if (forgotStep2Form) forgotStep2Form.style.display = step === 2 ? 'block' : 'none';
        if (forgotStep3Form) forgotStep3Form.style.display = step === 3 ? 'block' : 'none';
        if (forgotStep4Success) forgotStep4Success.style.display = step === 4 ? 'block' : 'none';

        if (forgotModalTitle) {
            if (step === 1) forgotModalTitle.textContent = 'Forgot Password';
            else if (step === 2) forgotModalTitle.textContent = 'Enter Verification Code';
            else if (step === 3) forgotModalTitle.textContent = 'Create New Password';
            else if (step === 4) forgotModalTitle.textContent = 'Password Reset';
        }
    }

    function resetForgotForms() {
        if (forgotStep1Form) forgotStep1Form.reset();
        if (forgotStep2Form) forgotStep2Form.reset();
        if (forgotStep3Form) forgotStep3Form.reset();
        if (forgotNewPasswordInput) forgotNewPasswordInput.type = 'password';
        if (forgotConfirmPasswordInput) forgotConfirmPasswordInput.type = 'password';
        if (toggleForgotNewPasswordBtn) {
            const op = toggleForgotNewPasswordBtn.querySelector('.eye-open');
            const cl = toggleForgotNewPasswordBtn.querySelector('.eye-closed');
            if (op) op.style.display = 'block';
            if (cl) cl.style.display = 'none';
        }
        if (toggleForgotConfirmPasswordBtn) {
            const op = toggleForgotConfirmPasswordBtn.querySelector('.eye-open');
            const cl = toggleForgotConfirmPasswordBtn.querySelector('.eye-closed');
            if (op) op.style.display = 'block';
            if (cl) cl.style.display = 'none';
        }
        currentResetEmail = '';
        verifiedResetCode = '';
        showForgotStep(1);
    }

    if (forgotPasswordLink && forgotPasswordOverlay) {
        forgotPasswordLink.addEventListener('click', (e) => {
            e.preventDefault();
            resetForgotForms();
            forgotPasswordOverlay.style.display = 'flex';
        });

        forgotPasswordClose?.addEventListener('click', () => {
            forgotPasswordOverlay.style.display = 'none';
        });

        forgotPasswordOverlay.addEventListener('click', (e) => {
            if (e.target === forgotPasswordOverlay) forgotPasswordOverlay.style.display = 'none';
        });

        forgotBackToStep1Btn?.addEventListener('click', () => {
            showForgotStep(1);
        });

        forgotSuccessLoginBtn?.addEventListener('click', () => {
            forgotPasswordOverlay.style.display = 'none';
            resetForgotForms();
        });

        // Step 1: Submit Email -> Send Code
        forgotStep1Form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = forgotEmailInput.value.trim();
            if (!email) {
                showToast('error', 'Please enter your registered Gmail address.');
                return;
            }

            setBtnLoading(forgotSendCodeBtn, true, 'Sending Code...');
            try {
                const res = await fetch(API_BASE + '/api/Auth/ForgotPassword/SendCode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    currentResetEmail = email;
                    if (forgotEmailDisplay) forgotEmailDisplay.textContent = email;
                    showToast('success', data.message || 'Verification code sent to your email.');
                    showForgotStep(2);
                    if (forgotCodeInput) forgotCodeInput.focus();
                } else {
                    showToast('error', data.message || 'Could not send verification code.');
                }
            } catch (err) {
                console.error('SendCode error:', err);
                showToast('error', 'Network error. Please try again.');
            } finally {
                setBtnLoading(forgotSendCodeBtn, false, 'Send Verification Code');
            }
        });

        // Resend code link in step 2
        forgotResendLink?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentResetEmail) {
                showForgotStep(1);
                return;
            }
            showToast('info', 'Resending verification code...');
            try {
                const res = await fetch(API_BASE + '/api/Auth/ForgotPassword/SendCode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentResetEmail })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    showToast('success', 'A new verification code has been sent.');
                } else {
                    showToast('error', data.message || 'Could not resend code.');
                }
            } catch (err) {
                showToast('error', 'Network error. Please try again.');
            }
        });

        // Step 2: Submit Code -> Verify
        forgotStep2Form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const code = forgotCodeInput.value.trim();
            if (!code || code.length < 4) {
                showToast('error', 'Please enter the verification code.');
                return;
            }

            setBtnLoading(forgotVerifyCodeBtn, true, 'Verifying...');
            try {
                const res = await fetch(API_BASE + '/api/Auth/ForgotPassword/VerifyCode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentResetEmail, code })
                });

                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    verifiedResetCode = code;
                    showToast('success', 'Verification code confirmed.');
                    showForgotStep(3);
                    if (forgotNewPasswordInput) forgotNewPasswordInput.focus();
                } else {
                    showToast('error', data.message || 'Invalid verification code.');
                }
            } catch (err) {
                console.error('VerifyCode error:', err);
                showToast('error', 'Network error. Please try again.');
            } finally {
                setBtnLoading(forgotVerifyCodeBtn, false, 'Verify');
            }
        });

        // Step 3: Submit New Password & Confirm -> Reset Password
        forgotStep3Form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = forgotNewPasswordInput.value.trim();
            const confirmPassword = forgotConfirmPasswordInput.value.trim();

            if (!newPassword || !confirmPassword) {
                showToast('error', 'Please enter and confirm your new password.');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('error', 'New Password and Confirm Password do not match.');
                return;
            }

            setBtnLoading(forgotResetSubmitBtn, true, 'Resetting Password...');
            try {
                const res = await fetch(API_BASE + '/api/Auth/ForgotPassword/ResetPassword', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: currentResetEmail,
                        code: verifiedResetCode,
                        newPassword,
                        confirmPassword
                    })
                });

                const data = await res.json().catch(() => ({}));
                if (res.ok) {
                    showToast('success', 'Password reset successfully!');
                    showForgotStep(4);
                } else {
                    showToast('error', data.message || 'Could not reset password.');
                }
            } catch (err) {
                console.error('ResetPassword error:', err);
                showToast('error', 'Network error. Please try again.');
            } finally {
                setBtnLoading(forgotResetSubmitBtn, false, 'Reset Password');
            }
        });
    }

    function setBtnLoading(btn, on, text) {
        if (!btn) return;
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');
        if (btnText) {
            btnText.textContent = text;
            btnText.style.display = on ? 'none' : 'block';
        }
        if (btnLoader) btnLoader.style.display = on ? 'block' : 'none';
        btn.disabled = on;
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError('rollno');
        clearError('password');

        const rollNumber = rollNumberInput.value.trim();
        const password = passwordInput.value.trim();

        if (!rollNumber) {
            showError('rollno', 'Register number required');
            return;
        }
        if (!password) {
            showError('password', 'Password required');
            return;
        }

        setLoading(true);
        await loginChain(rollNumber, password);
    });

    async function loginChain(username, password) {
        const studentResult = await tryLogin(`${API_BASE}/api/Student/login`, {
            registerNumber: username,
            password: password
        });

        if (studentResult.success) {
            localStorage.setItem('userType', 'student');
            localStorage.setItem('studentId', studentResult.data.studentId);
            localStorage.setItem('userName', studentResult.data.name);
            localStorage.setItem('userDept', studentResult.data.department);
            // Class section (e.g. "A", "B") — used to route this student's OD
            // requests to only the staff assigned to the same section.
            localStorage.setItem('userSection', studentResult.data.section || '');
            localStorage.setItem('userEmail', studentResult.data.email || '');
            localStorage.setItem('registerNumber', studentResult.data.registerNumber);
            showToast('success', 'Student login successful!');
            setTimeout(() => window.location.href = 'student.html', 1200);
            return;
        }

        if (studentResult.error && studentResult.status === 403) {
            showToast('error', studentResult.error);
            setLoading(false);
            return;
        }

        const facultyResult = await tryLogin(`${API_BASE}/api/Faculty/Login`, {
            name: username,
            password: password
        });

        if (facultyResult.success) {
            localStorage.setItem('userType', 'faculty');
            localStorage.setItem('facultyId', facultyResult.data.facultyId);
            localStorage.setItem('userName', facultyResult.data.name);
            localStorage.setItem('userRollNumber', facultyResult.data.rollNumber || '');
            localStorage.setItem('userDept', facultyResult.data.department);
            localStorage.setItem('userSection', facultyResult.data.section || '');
            localStorage.setItem('userYear', facultyResult.data.year || '');
            showToast('success', 'Faculty login successful!');
            setTimeout(() => window.location.href = 'teacher.html', 1200);
            return;
        }

        if (facultyResult.error && facultyResult.status === 403) {
            showToast('error', facultyResult.error);
            setLoading(false);
            return;
        }

        const hodResult = await tryLogin(`${API_BASE}/api/Hod/Login`, {
            name: username,
            password: password
        });

        if (hodResult.success) {
            localStorage.setItem('userType', 'hod');
            localStorage.setItem('hodId', hodResult.data.hodId);
            localStorage.setItem('userName', hodResult.data.name);
            localStorage.setItem('userRollNumber', hodResult.data.rollNumber || '');
            localStorage.setItem('userDept', hodResult.data.department);
            showToast('success', 'HOD login successful!');
            setTimeout(() => window.location.href = 'hod.html', 1200);
            return;
        }

        if (hodResult.error && hodResult.status === 403) {
            showToast('error', hodResult.error);
            setLoading(false);
            return;
        }

        showToast('error', 'Invalid credentials');
        setLoading(false);
    }

    async function tryLogin(url, body) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            }
            const errData = await response.json().catch(() => ({}));
            return { success: false, data: null, error: errData.message || null, status: response.status };
        } catch (err) {
            console.error('Login error:', err);
            return { success: false, data: null, error: null, status: 0 };
        }
    }

    function showError(field, message) {
        const group = document.getElementById(`${field}-group`);
        const err = document.getElementById(`${field}-error`);
        if (group) group.classList.add('error');
        if (err) err.textContent = message;
    }

    function clearError(field) {
        const group = document.getElementById(`${field}-group`);
        const err = document.getElementById(`${field}-error`);
        if (group) group.classList.remove('error');
        if (err) err.textContent = '';
    }

    function setLoading(on) {
        const btnText = loginButton.querySelector('.btn-text');
        const btnLoader = loginButton.querySelector('.btn-loader');
        if (btnText) btnText.style.display = on ? 'none' : 'block';
        if (btnLoader) btnLoader.style.display = on ? 'block' : 'none';
        loginButton.disabled = on;
    }

    function showToast(type, message) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
            error: `<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
        };
        toast.innerHTML = `${icons[type] || icons.error}
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>`;
        container.appendChild(toast);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        setTimeout(() => toast.remove(), 4000);
    }
});