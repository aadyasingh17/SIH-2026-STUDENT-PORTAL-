async function loadStudentDashboardPage() {
  try {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) return;

    const token = session.access_token;

    const res = await fetch(`${API_BASE}/student/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const result = await res.json();

    if (result.status === 'success') {
      const firstName = (result.name || 'Student').split(' ')[0];

      setText('welcome-name', firstName);
      setText('dash-subtitle-name', result.name || 'Student');
      setText('dash-app-count', result.applications?.total ?? 0);
      setText('stat-cgpa', result.cgpa ?? '-');
    }

    const profRes = await fetch(`${API_BASE}/student/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const profResult = await profRes.json();

    if (profResult.status === 'success' && profResult.student) {
      const s = profResult.student;
      setValue('inp-name', s.name || '');
      setValue('inp-email', s.email || '');
      setText('out-name', s.name || '');
      setText('out-contact', s.email || '');
    }
  } catch (err) {
    console.error('Student dashboard load failed:', err);
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}