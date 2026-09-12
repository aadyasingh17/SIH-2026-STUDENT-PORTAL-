require('dotenv').config();
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const supabase = require('../config/supabaseClient');

// Helper to make HTTP requests against local Express app
function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port: port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING STUDENT PORTAL API INTEGRATION TESTS ---');

  // Start temporary server on random port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test server listening on port ${port}`);

  let testStudentId = null;
  let testEmail = `test_student_${Date.now()}@university.edu`;
  let testPassword = 'Password123!';
  let authToken = null;

  try {
    // 0. Setup: Ensure a college exists or get existing college
    const { data: colleges } = await supabase.from('colleges').select('id').limit(1);
    let collegeId = colleges && colleges[0] ? colleges[0].id : null;

    if (!collegeId) {
      const { data: newCollege } = await supabase
        .from('colleges')
        .insert([{ name: 'Test College', email: `college_${Date.now()}@test.com`, password_hash: 'hash' }])
        .select('id')
        .single();
      collegeId = newCollege.id;
    }

    // Create test student with hashed password
    const hashedPassword = await bcrypt.hash(testPassword, 10);
    const { data: student, error: createError } = await supabase
      .from('students')
      .insert([{
        college_id: collegeId,
        name: 'Alex Test Student',
        email: testEmail,
        roll_no: `R-${Date.now().toString().slice(-4)}`,
        branch: 'Computer Science',
        password_hash: hashedPassword,
        skills: ['JavaScript', 'Node.js'],
        cgpa: 8.5
      }])
      .select('*')
      .single();

    if (createError || !student) {
      throw new Error(`Failed to create test student: ${createError?.message}`);
    }
    testStudentId = student.id;
    console.log(`Created test student: ${testEmail} (ID: ${testStudentId})`);

    // 1. Test Auth: POST /api/student/login
    console.log('\n[1/12] Testing POST /api/student/login...');
    const loginRes = await makeRequest(server, {
      path: '/api/student/login',
      method: 'POST'
    }, { email: testEmail, password: testPassword });

    if (loginRes.status !== 200 || !loginRes.data.token) {
      throw new Error(`Login failed (${loginRes.status}): ${JSON.stringify(loginRes.data)}`);
    }
    authToken = loginRes.data.token;
    console.log('✅ Login successful, JWT token issued.');

    // Decode token to verify payload
    const decoded = jwt.decode(authToken);
    if (decoded.id !== testStudentId || decoded.role !== 'student') {
      throw new Error(`Invalid token payload: ${JSON.stringify(decoded)}`);
    }
    console.log(`✅ Token payload verified: role="${decoded.role}", id="${decoded.id}"`);

    // 1b. Test Unauthorized without token
    const unauthRes = await makeRequest(server, {
      path: '/api/student/profile',
      method: 'GET'
    });
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 for unauthorized access, got ${unauthRes.status}`);
    }
    console.log('✅ Auth middleware correctly rejected unauthenticated request with 401.');

    const authHeaders = { Authorization: `Bearer ${authToken}` };

    // 2. Test Profile: GET /api/student/profile & PUT /api/student/profile
    console.log('\n[2/12] Testing Profile Endpoints...');
    const profileGet = await makeRequest(server, { path: '/api/student/profile', headers: authHeaders });
    if (profileGet.status !== 200 || profileGet.data.student.email !== testEmail) {
      throw new Error(`Profile GET failed: ${JSON.stringify(profileGet.data)}`);
    }
    console.log('✅ GET /api/student/profile succeeded.');

    const profilePut = await makeRequest(server, {
      path: '/api/student/profile',
      method: 'PUT',
      headers: authHeaders
    }, { name: 'Alex Updated', cgpa: 9.1, skills: ['JavaScript', 'Node.js', 'PostgreSQL'] });
    if (profilePut.status !== 200 || profilePut.data.student.name !== 'Alex Updated') {
      throw new Error(`Profile PUT failed: ${JSON.stringify(profilePut.data)}`);
    }
    console.log('✅ PUT /api/student/profile succeeded.');

    // 2b. Test Dashboard: GET /api/student/dashboard
    console.log('\n[2b] Testing Dashboard Endpoint...');
    const dashGet = await makeRequest(server, { path: '/api/student/dashboard', headers: authHeaders });
    if (dashGet.status !== 200 || !dashGet.data.student || dashGet.data.status !== 'success') {
      throw new Error(`Dashboard GET failed: ${JSON.stringify(dashGet.data)}`);
    }
    console.log('✅ GET /api/student/dashboard succeeded (student metrics, applications, upcoming drives).');

    // 3. Test Education: GET/POST/PUT/DELETE /api/student/education
    console.log('\n[3/12] Testing Education Endpoints...');
    const eduPost = await makeRequest(server, {
      path: '/api/student/education',
      method: 'POST',
      headers: authHeaders
    }, { degree: 'B.Tech CSE', institution: 'Apex University', year: 2026, cgpa: 9.1 });
    if (eduPost.status !== 201 || !eduPost.data.education.id) {
      throw new Error(`Education POST failed: ${JSON.stringify(eduPost.data)}`);
    }
    const eduId = eduPost.data.education.id;
    console.log(`✅ POST /api/student/education created record ID: ${eduId}`);

    const eduGet = await makeRequest(server, { path: '/api/student/education', headers: authHeaders });
    if (eduGet.status !== 200 || eduGet.data.count < 1) {
      throw new Error(`Education GET failed: ${JSON.stringify(eduGet.data)}`);
    }
    console.log('✅ GET /api/student/education succeeded.');

    const eduPut = await makeRequest(server, {
      path: `/api/student/education/${eduId}`,
      method: 'PUT',
      headers: authHeaders
    }, { cgpa: 9.3 });
    if (eduPut.status !== 200 || eduPut.data.education.cgpa !== 9.3) {
      throw new Error(`Education PUT failed: ${JSON.stringify(eduPut.data)}`);
    }
    console.log('✅ PUT /api/student/education/:id succeeded.');

    const eduDel = await makeRequest(server, {
      path: `/api/student/education/${eduId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    if (eduDel.status !== 200) {
      throw new Error(`Education DELETE failed: ${JSON.stringify(eduDel.data)}`);
    }
    console.log('✅ DELETE /api/student/education/:id succeeded.');

    // 4. Test Skills: GET/POST/DELETE /api/student/skills
    console.log('\n[4/12] Testing Skills Endpoints...');
    const skillPost = await makeRequest(server, {
      path: '/api/student/skills',
      method: 'POST',
      headers: authHeaders
    }, { skill_name: 'Docker', proficiency_level: 'Intermediate' });
    if (skillPost.status !== 201 || !skillPost.data.skill.id) {
      throw new Error(`Skills POST failed: ${JSON.stringify(skillPost.data)}`);
    }
    const skillId = skillPost.data.skill.id;
    console.log(`✅ POST /api/student/skills created skill ID: ${skillId}`);

    const skillGet = await makeRequest(server, { path: '/api/student/skills', headers: authHeaders });
    if (skillGet.status !== 200 || skillGet.data.count < 1) {
      throw new Error(`Skills GET failed: ${JSON.stringify(skillGet.data)}`);
    }
    console.log('✅ GET /api/student/skills succeeded.');

    const skillDel = await makeRequest(server, {
      path: `/api/student/skills/${skillId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    if (skillDel.status !== 200) {
      throw new Error(`Skills DELETE failed: ${JSON.stringify(skillDel.data)}`);
    }
    console.log('✅ DELETE /api/student/skills/:id succeeded.');

    // 5. Test Resume: POST /api/student/resume & GET /api/student/resume
    console.log('\n[5/12] Testing Resume Endpoints...');
    const resumePost = await makeRequest(server, {
      path: '/api/student/resume',
      method: 'POST',
      headers: authHeaders
    }, { file_url: 'https://example.com/resumes/alex_resume.pdf' });
    if (resumePost.status !== 201 || !resumePost.data.resume.id) {
      throw new Error(`Resume POST failed: ${JSON.stringify(resumePost.data)}`);
    }
    console.log('✅ POST /api/student/resume succeeded.');

    const resumeGet = await makeRequest(server, { path: '/api/student/resume', headers: authHeaders });
    if (resumeGet.status !== 200 || !resumeGet.data.resume) {
      throw new Error(`Resume GET failed: ${JSON.stringify(resumeGet.data)}`);
    }
    console.log('✅ GET /api/student/resume succeeded.');

    // 6. Test Certifications: GET/POST/DELETE /api/student/certifications
    console.log('\n[6/12] Testing Certifications Endpoints...');
    const certPost = await makeRequest(server, {
      path: '/api/student/certifications',
      method: 'POST',
      headers: authHeaders
    }, { title: 'AWS Cloud Practitioner', issuer: 'Amazon Web Services', issue_date: '2026-01-15' });
    if (certPost.status !== 201 || !certPost.data.certification.id) {
      throw new Error(`Certifications POST failed: ${JSON.stringify(certPost.data)}`);
    }
    const certId = certPost.data.certification.id;
    console.log(`✅ POST /api/student/certifications created cert ID: ${certId}`);

    const certGet = await makeRequest(server, { path: '/api/student/certifications', headers: authHeaders });
    if (certGet.status !== 200 || certGet.data.count < 1) {
      throw new Error(`Certifications GET failed: ${JSON.stringify(certGet.data)}`);
    }
    console.log('✅ GET /api/student/certifications succeeded.');

    const certDel = await makeRequest(server, {
      path: `/api/student/certifications/${certId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    if (certDel.status !== 200) {
      throw new Error(`Certifications DELETE failed: ${JSON.stringify(certDel.data)}`);
    }
    console.log('✅ DELETE /api/student/certifications/:id succeeded.');

    // 7. Test Projects: GET/POST/PUT/DELETE /api/student/projects
    console.log('\n[7/12] Testing Projects Endpoints...');
    const projPost = await makeRequest(server, {
      path: '/api/student/projects',
      method: 'POST',
      headers: authHeaders
    }, { title: 'AI Student Portal', description: 'Placement engine', tech_stack: 'Node, React, Supabase' });
    if (projPost.status !== 201 || !projPost.data.project.id) {
      throw new Error(`Projects POST failed: ${JSON.stringify(projPost.data)}`);
    }
    const projId = projPost.data.project.id;
    console.log(`✅ POST /api/student/projects created project ID: ${projId}`);

    const projGet = await makeRequest(server, { path: '/api/student/projects', headers: authHeaders });
    if (projGet.status !== 200 || projGet.data.count < 1) {
      throw new Error(`Projects GET failed: ${JSON.stringify(projGet.data)}`);
    }
    console.log('✅ GET /api/student/projects succeeded.');

    const projPut = await makeRequest(server, {
      path: `/api/student/projects/${projId}`,
      method: 'PUT',
      headers: authHeaders
    }, { description: 'Updated placement engine platform' });
    if (projPut.status !== 200 || projPut.data.project.description !== 'Updated placement engine platform') {
      throw new Error(`Projects PUT failed: ${JSON.stringify(projPut.data)}`);
    }
    console.log('✅ PUT /api/student/projects/:id succeeded.');

    const projDel = await makeRequest(server, {
      path: `/api/student/projects/${projId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    if (projDel.status !== 200) {
      throw new Error(`Projects DELETE failed: ${JSON.stringify(projDel.data)}`);
    }
    console.log('✅ DELETE /api/student/projects/:id succeeded.');

    // 8. Test Internship Applications: GET & POST /api/student/internship-applications
    console.log('\n[8/12] Testing Internship Applications Endpoints...');
    const testInternshipId = '00000000-0000-0000-0000-000000000001';
    const internPost = await makeRequest(server, {
      path: '/api/student/internship-applications',
      method: 'POST',
      headers: authHeaders
    }, { internship_id: testInternshipId });
    if (internPost.status !== 201) {
      throw new Error(`Internship POST failed: ${JSON.stringify(internPost.data)}`);
    }
    console.log('✅ POST /api/student/internship-applications succeeded.');

    // Check duplicate rejection
    const internDup = await makeRequest(server, {
      path: '/api/student/internship-applications',
      method: 'POST',
      headers: authHeaders
    }, { internship_id: testInternshipId });
    if (internDup.status !== 409) {
      throw new Error(`Expected 409 on duplicate internship application, got ${internDup.status}`);
    }
    console.log('✅ Duplicate internship application correctly rejected with 409.');

    const internGet = await makeRequest(server, { path: '/api/student/internship-applications', headers: authHeaders });
    if (internGet.status !== 200 || internGet.data.count < 1) {
      throw new Error(`Internship GET failed: ${JSON.stringify(internGet.data)}`);
    }
    console.log('✅ GET /api/student/internship-applications succeeded.');

    // 9. Test Job Applications: GET & POST /api/student/job-applications
    console.log('\n[9/12] Testing Job Applications Endpoints...');
    const testJobId = '00000000-0000-0000-0000-000000000002';
    const jobPost = await makeRequest(server, {
      path: '/api/student/job-applications',
      method: 'POST',
      headers: authHeaders
    }, { job_id: testJobId });
    if (jobPost.status !== 201) {
      throw new Error(`Job POST failed: ${JSON.stringify(jobPost.data)}`);
    }
    console.log('✅ POST /api/student/job-applications succeeded.');

    const jobDup = await makeRequest(server, {
      path: '/api/student/job-applications',
      method: 'POST',
      headers: authHeaders
    }, { job_id: testJobId });
    if (jobDup.status !== 409) {
      throw new Error(`Expected 409 on duplicate job application, got ${jobDup.status}`);
    }
    console.log('✅ Duplicate job application correctly rejected with 409.');

    const jobGet = await makeRequest(server, { path: '/api/student/job-applications', headers: authHeaders });
    if (jobGet.status !== 200 || jobGet.data.count < 1) {
      throw new Error(`Job GET failed: ${JSON.stringify(jobGet.data)}`);
    }
    console.log('✅ GET /api/student/job-applications succeeded.');

    // 10. Test Saved Opportunities: GET/POST/DELETE /api/student/saved-opportunities
    console.log('\n[10/12] Testing Saved Opportunities Endpoints...');
    const testOppId = '00000000-0000-0000-0000-000000000003';
    const oppPost = await makeRequest(server, {
      path: '/api/student/saved-opportunities',
      method: 'POST',
      headers: authHeaders
    }, { opportunity_id: testOppId, opportunity_type: 'job' });
    if (oppPost.status !== 201 || !oppPost.data.opportunity.id) {
      throw new Error(`Saved Opportunities POST failed: ${JSON.stringify(oppPost.data)}`);
    }
    const savedId = oppPost.data.opportunity.id;
    console.log(`✅ POST /api/student/saved-opportunities created saved ID: ${savedId}`);

    const oppGet = await makeRequest(server, { path: '/api/student/saved-opportunities', headers: authHeaders });
    if (oppGet.status !== 200 || oppGet.data.count < 1) {
      throw new Error(`Saved Opportunities GET failed: ${JSON.stringify(oppGet.data)}`);
    }
    console.log('✅ GET /api/student/saved-opportunities succeeded.');

    const oppDel = await makeRequest(server, {
      path: `/api/student/saved-opportunities/${savedId}`,
      method: 'DELETE',
      headers: authHeaders
    });
    if (oppDel.status !== 200) {
      throw new Error(`Saved Opportunities DELETE failed: ${JSON.stringify(oppDel.data)}`);
    }
    console.log('✅ DELETE /api/student/saved-opportunities/:id succeeded.');

    // 11. Test Notifications: GET /api/student/notifications & PUT /api/student/notifications/:id/read
    console.log('\n[11/12] Testing Notifications Endpoints...');
    const { data: newNotif, error: notifErr } = await supabase
      .from('notifications')
      .insert([{ student_id: testStudentId, message: 'Welcome to Student Portal!', is_read: false }])
      .select('*')
      .single();
    if (notifErr) throw new Error(`Failed to seed notification: ${notifErr.message}`);

    const notifGet = await makeRequest(server, { path: '/api/student/notifications', headers: authHeaders });
    if (notifGet.status !== 200 || notifGet.data.count < 1 || notifGet.data.unread_count < 1) {
      throw new Error(`Notifications GET failed: ${JSON.stringify(notifGet.data)}`);
    }
    console.log(`✅ GET /api/student/notifications returned ${notifGet.data.count} notification(s) with ${notifGet.data.unread_count} unread.`);

    const notifPut = await makeRequest(server, {
      path: `/api/student/notifications/${newNotif.id}/read`,
      method: 'PUT',
      headers: authHeaders
    });
    if (notifPut.status !== 200 || !notifPut.data.notification.is_read) {
      throw new Error(`Notifications read PUT failed: ${JSON.stringify(notifPut.data)}`);
    }
    console.log('✅ PUT /api/student/notifications/:id/read marked notification as read.');

    // 12. Test Placement Stats: GET /api/student/placement-stats
    console.log('\n[12/12] Testing Placement Stats Endpoints...');
    const { data: newStat, error: statErr } = await supabase
      .from('placement_stats')
      .insert([{
        student_id: testStudentId,
        offer_status: 'offered',
        company_name: 'Tech Corp',
        package: '18 LPA'
      }])
      .select('*')
      .single();
    if (statErr) throw new Error(`Failed to seed placement stat: ${statErr.message}`);

    const statGet = await makeRequest(server, { path: '/api/student/placement-stats', headers: authHeaders });
    if (statGet.status !== 200 || statGet.data.count < 1) {
      throw new Error(`Placement Stats GET failed: ${JSON.stringify(statGet.data)}`);
    }
    console.log(`✅ GET /api/student/placement-stats returned ${statGet.data.count} placement stat record(s).`);

    console.log('\n=========================================');
    console.log('🎉 ALL 12 STUDENT MODULES PASSED WITH 100% SUCCESS!');
    console.log('=========================================');

  } finally {
    // Cleanup test data
    if (testStudentId) {
      console.log('\nCleaning up test artifacts...');
      await supabase.from('notifications').delete().eq('student_id', testStudentId);
      await supabase.from('placement_stats').delete().eq('student_id', testStudentId);
      await supabase.from('job_applications').delete().eq('student_id', testStudentId);
      await supabase.from('internship_applications').delete().eq('student_id', testStudentId);
      await supabase.from('resumes').delete().eq('student_id', testStudentId);
      await supabase.from('students').delete().eq('id', testStudentId);
      console.log('Cleanup completed.');
    }
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
