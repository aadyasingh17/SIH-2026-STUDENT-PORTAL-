// =========================================================
// COLLEGE DASHBOARD LOGIC (backend-connected)
// =========================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadCollegeDashboardPage() {
  const collegeData = getCollegeData();
  const welcomeEl = document.getElementById('college-welcome-msg');
  if (welcomeEl && collegeData) {
    welcomeEl.innerText = `Welcome, ${collegeData.name || collegeData.email}`;
  }

  await Promise.all([
    loadDashboardStats(),
    loadStudents(),
    loadDrives()
  ]);
}

async function loadDashboardStats() {
  try {
    const data = await collegeApiFetch('/college/dashboard');
    const totalEl = document.getElementById('stat-total-students');
    const verifiedEl = document.getElementById('stat-verified-students');
    const activeEl = document.getElementById('stat-active-drives');
    const appsEl = document.getElementById('stat-total-applications');

    if (totalEl) totalEl.innerText = data.total_students ?? 0;
    if (verifiedEl) verifiedEl.innerText = data.verified_students ?? 0;
    if (activeEl) activeEl.innerText = data.active_drives ?? 0;
    if (appsEl) appsEl.innerText = data.total_applications ?? 0;
  } catch (err) {
    console.error('Failed to load dashboard stats:', err);
  }
}

async function loadStudents() {
  const tbody = document.getElementById('students-table-body');
  const errorEl = document.getElementById('students-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.innerText = ''; }

  try {
    const data = await collegeApiFetch('/college/students');
    const students = data.students || [];

    if (!tbody) return;

    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 16px 8px; color: var(--qz-text-muted);">No students added yet.</td></tr>';
      return;
    }

    tbody.innerHTML = students.map(s => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 10px 8px;">${escapeHtml(s.name)}</td>
        <td style="padding: 10px 8px;">${escapeHtml(s.email)}</td>
        <td style="padding: 10px 8px;">${escapeHtml(s.roll_no || '-')}</td>
        <td style="padding: 10px 8px;">${escapeHtml(s.branch || '-')}</td>
        <td style="padding: 10px 8px;">${escapeHtml((s.skills || []).join(', ') || '-')}</td>
        <td style="padding: 10px 8px;">${s.is_verified ? '✅' : '❌'}</td>
        <td style="padding: 10px 8px;"><button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.75rem;" onclick="deleteStudentRow('${s.id}')">Delete</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load students:', err);
    if (errorEl) {
      errorEl.innerText = err.message || 'Failed to load students.';
      errorEl.style.display = 'block';
    }
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding: 16px 8px; color: var(--qz-text-muted);">Could not load students.</td></tr>';
    }
  }
}

async function submitAddStudent(event) {
  if (event) event.preventDefault();

  const errorEl = document.getElementById('add-student-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.innerText = ''; }

  const nameInput = document.getElementById('student-name-input');
  const emailInput = document.getElementById('student-email-input');
  const rollNoInput = document.getElementById('student-rollno-input');
  const branchInput = document.getElementById('student-branch-input');
  const skillsInput = document.getElementById('student-skills-input');
  const verifiedInput = document.getElementById('student-verified-input');
  const submitBtn = document.getElementById('add-student-submit-btn');

  const name = nameInput ? nameInput.value.trim() : '';
  const email = emailInput ? emailInput.value.trim() : '';
  const roll_no = rollNoInput ? rollNoInput.value.trim() : '';
  const branch = branchInput ? branchInput.value.trim() : '';
  const skills = skillsInput ? skillsInput.value.trim() : '';
  const is_verified = verifiedInput ? verifiedInput.checked : false;

  if (!name || !email) {
    if (errorEl) {
      errorEl.innerText = 'Name and email are required.';
      errorEl.style.display = 'block';
    }
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.innerText : 'Add Student';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Adding...';
  }

  try {
    await collegeApiFetch('/college/students', {
      method: 'POST',
      body: JSON.stringify({ name, email, roll_no, branch, skills, is_verified })
    });

    closeModal('add-student-modal');
    const form = document.getElementById('add-student-form');
    if (form) form.reset();

    await loadStudents();
    await loadDashboardStats();
  } catch (err) {
    console.error('Add student failed:', err);
    if (errorEl) {
      errorEl.innerText = err.message || 'Failed to add student.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}

async function deleteStudentRow(studentId) {
  if (!confirm('Are you sure you want to delete this student?')) return;

  try {
    await collegeApiFetch(`/college/students/${studentId}`, {
      method: 'DELETE'
    });
    await loadStudents();
    await loadDashboardStats();
  } catch (err) {
    console.error('Delete student failed:', err);
    alert(err.message || 'Failed to delete student.');
  }
}

async function loadDrives() {
  const tbody = document.getElementById('drives-table-body');
  const errorEl = document.getElementById('drives-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.innerText = ''; }

  try {
    const data = await collegeApiFetch('/college/drives');
    const drives = data.drives || [];

    if (!tbody) return;

    if (drives.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding: 16px 8px; color: var(--qz-text-muted);">No drives added yet.</td></tr>';
      return;
    }

    tbody.innerHTML = drives.map(d => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
        <td style="padding: 10px 8px;">${escapeHtml(d.company_name)}</td>
        <td style="padding: 10px 8px;">${escapeHtml(d.role_title)}</td>
        <td style="padding: 10px 8px;">${escapeHtml(d.eligibility_criteria || '-')}</td>
        <td style="padding: 10px 8px;">${escapeHtml(d.drive_date || '-')}</td>
        <td style="padding: 10px 8px;">${escapeHtml(d.status || '-')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load drives:', err);
    if (errorEl) {
      errorEl.innerText = err.message || 'Failed to load drives.';
      errorEl.style.display = 'block';
    }
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding: 16px 8px; color: var(--qz-text-muted);">Could not load drives.</td></tr>';
    }
  }
}

async function submitAddDrive(event) {
  if (event) event.preventDefault();

  const errorEl = document.getElementById('add-drive-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.innerText = ''; }

  const companyInput = document.getElementById('drive-company-input');
  const roleInput = document.getElementById('drive-role-input');
  const eligibilityInput = document.getElementById('drive-eligibility-input');
  const dateInput = document.getElementById('drive-date-input');
  const statusInput = document.getElementById('drive-status-input');
  const submitBtn = document.getElementById('add-drive-submit-btn');

  const company_name = companyInput ? companyInput.value.trim() : '';
  const role_title = roleInput ? roleInput.value.trim() : '';
  const eligibility_criteria = eligibilityInput ? eligibilityInput.value.trim() : '';
  const drive_date = dateInput ? dateInput.value : '';
  const status = statusInput ? statusInput.value : 'upcoming';

  if (!company_name || !role_title || !drive_date) {
    if (errorEl) {
      errorEl.innerText = 'Company name, role title, and drive date are required.';
      errorEl.style.display = 'block';
    }
    return;
  }

  const originalBtnText = submitBtn ? submitBtn.innerText : 'Add Drive';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerText = 'Adding...';
  }

  try {
    await collegeApiFetch('/college/drives', {
      method: 'POST',
      body: JSON.stringify({ company_name, role_title, eligibility_criteria, drive_date, status })
    });

    closeModal('add-drive-modal');
    const form = document.getElementById('add-drive-form');
    if (form) form.reset();

    await loadDrives();
    await loadDashboardStats();
  } catch (err) {
    console.error('Add drive failed:', err);
    if (errorEl) {
      errorEl.innerText = err.message || 'Failed to add drive.';
      errorEl.style.display = 'block';
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = originalBtnText;
    }
  }
}
