const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../src/middlewares/authMiddleware');
const requireRole = require('../src/middlewares/requireRole');

const router = express.Router();

/**
 * Helper to safely extract student ID from the decoded JWT payload
 * Strictly prevents taking student_id from request body
 */
const getStudentId = (req) => {
  return (req.student && (req.student.id || req.student.studentId || req.student.student_id))
    || (req.user && (req.user.id || req.user.studentId || req.user.student_id))
    || (req.college && (req.college.id || req.college.studentId || req.college.student_id));
};

/**
 * Common unauthorized helper response
 */
const unauthorizedResponse = (res) => {
  return res.status(401).json({
    status: 'error',
    message: 'Unauthorized: Missing student identifier in token'
  });
};

/* ==========================================================================
   1. AUTHENTICATION (PUBLIC)
   ========================================================================== */

/**
 * @route   POST /api/student/login
 * @desc    Authenticate student & generate JWT using students table + password_hash
 * @access  Public
 */
const loginStudent = async (req, res, next) => {
  try {
    const { email, roll_no, password } = req.body;
    const identifier = (email || roll_no || req.body.identifier || '').trim();

    if (!identifier || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email (or roll number) and password are required'
      });
    }

    const normalizedIdentifier = identifier.toLowerCase();

    // Query student by email or roll_no from existing students table (NOT Supabase Auth)
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .or(`email.eq.${normalizedIdentifier},roll_no.eq.${identifier}`)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({
        status: 'error',
        message: fetchError.message || 'Error querying student account'
      });
    }

    if (!student) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Compare hashed password against password_hash column (with fallback to password)
    const storedHash = student.password_hash || student.password;
    if (!storedHash) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const isMatch = await bcrypt.compare(password, storedHash);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Generate JWT token containing student id and role: "student"
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const token = jwt.sign(
      {
        id: student.id,
        studentId: student.id,
        role: 'student',
        email: student.email,
        college_id: student.college_id
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Omit sensitive hash fields from returned student object
    const { password: _, password_hash: __, ...studentData } = student;

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      token,
      student: studentData,
      data: studentData
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================================================
   DASHBOARD (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/dashboard
 * @desc    Get dashboard metrics, active applications, and upcoming drives for authenticated student
 * @access  Private (Authenticated Student)
 */
const getStudentDashboard = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    const userEmail = req.user?.email || req.student?.email;

    if (!studentId && !userEmail) {
      return unauthorizedResponse(res);
    }

    // 1. Fetch student record by JWT ID or email fallback
    let studentQuery = supabase
      .from('students')
      .select('id, college_id, name, email, roll_no, branch, batch_year, cgpa, skills, is_verified, created_at');

    if (studentId) {
      studentQuery = studentQuery.eq('id', studentId);
    } else {
      studentQuery = studentQuery.ilike('email', userEmail.trim());
    }

    const { data: student, error: studentError } = await studentQuery.maybeSingle();

    if (studentError) {
      return res.status(500).json({
        status: 'error',
        message: studentError.message || 'Error fetching student record'
      });
    }

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student record not found'
      });
    }

    // 2. Query drive applications for this student only
    const applicationsPromise = supabase
      .from('drive_applications')
      .select(`
        id,
        drive_id,
        student_id,
        status,
        created_at,
        drives (
          id,
          company_name,
          role_title,
          drive_date,
          status,
          eligibility_criteria
        )
      `)
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });

    // 3. Query upcoming placement drives for student's college
    const today = new Date().toISOString().split('T')[0];
    const upcomingDrivesPromise = student.college_id
      ? supabase
          .from('drives')
          .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
          .eq('college_id', student.college_id)
          .or(`status.eq.upcoming,drive_date.gte.${today}`)
          .order('drive_date', { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [
      { data: applications, error: appsError },
      { data: upcomingDrives, error: drivesError }
    ] = await Promise.all([applicationsPromise, upcomingDrivesPromise]);

    if (appsError || drivesError) {
      const errorMsg = (appsError || drivesError)?.message;
      return res.status(500).json({
        status: 'error',
        message: errorMsg || 'Error fetching dashboard metrics'
      });
    }

    const appList = applications || [];
    const totalApplications = appList.length;
    const activeApplications = appList.filter(app => {
      const s = (app.status || '').toLowerCase();
      return s !== 'rejected' && s !== 'withdrawn' && s !== 'cancelled';
    }).length;

    return res.status(200).json({
      status: 'success',
      name: student.name,
      email: student.email,
      roll_no: student.roll_no,
      branch: student.branch,
      batch_year: student.batch_year,
      cgpa: student.cgpa,
      skills: student.skills || [],
      is_verified: student.is_verified,
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        roll_no: student.roll_no,
        branch: student.branch,
        batch_year: student.batch_year,
        cgpa: student.cgpa,
        skills: student.skills || [],
        is_verified: student.is_verified
      },
      applications: {
        total: totalApplications,
        active: activeApplications,
        history: appList
      },
      upcoming_drives: upcomingDrives || [],
      total_applications: totalApplications,
      active_applications: activeApplications,
      application_history: appList
    });
  } catch (error) {
    next(error);
  }
};

/* ==========================================================================
   2. PROFILE (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/profile
 * @desc    Get authenticated student profile
 * @access  Private (Student)
 */
const getStudentProfile = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    const userEmail = req.user?.email || req.student?.email;
    if (!studentId && !userEmail) return unauthorizedResponse(res);

    const { data: student, error } = await supabase
      .from('students')
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at, batch_year, cgpa')
      .eq('id', studentId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Database error while fetching student profile'
      });
    }

    if (!student) {
      return res.status(404).json({
        status: 'error',
        message: 'Student profile not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      student,
      data: student
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/student/profile
 * @desc    Update authenticated student profile
 * @access  Private (Student)
 */
const updateStudentProfile = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { name, branch, skills, batch_year, cgpa, roll_no } = req.body;
    const updatePayload = {};

    if (name !== undefined) updatePayload.name = name.trim();
    if (branch !== undefined) updatePayload.branch = branch.trim();
    if (roll_no !== undefined) updatePayload.roll_no = roll_no.trim();

    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        updatePayload.skills = skills.map(s => typeof s === 'string' ? s.trim() : String(s)).filter(Boolean);
      } else if (typeof skills === 'string') {
        updatePayload.skills = skills.split(',').map(s => s.trim()).filter(Boolean);
      } else if (skills === null) {
        updatePayload.skills = [];
      }
    }

    if (batch_year !== undefined) {
      updatePayload.batch_year = batch_year ? parseInt(batch_year, 10) || batch_year : null;
    }

    if (cgpa !== undefined) {
      updatePayload.cgpa = cgpa !== null && cgpa !== '' ? parseFloat(cgpa) : null;
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update fields provided'
      });
    }

    const { data: updatedStudent, error } = await supabase
      .from('students')
      .update(updatePayload)
      .eq('id', studentId)
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at, batch_year, cgpa')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update profile'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      student: updatedStudent,
      data: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   3. EDUCATION (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/education
 * @desc    Fetch all education history for authenticated student
 * @access  Private (Student)
 */
const getEducation = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: education, error } = await supabase
      .from('student_education')
      .select('*')
      .eq('student_id', studentId)
      .order('year', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch education records'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: education ? education.length : 0,
      education: education || [],
      data: education || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/education
 * @desc    Add new education record
 * @access  Private (Student)
 */
const addEducation = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { degree, institution, year, cgpa } = req.body;

    if (!degree || !institution) {
      return res.status(400).json({
        status: 'error',
        message: 'Degree and institution are required'
      });
    }

    const payload = {
      student_id: studentId,
      degree: degree.trim(),
      institution: institution.trim(),
      year: year ? parseInt(year, 10) || year : null,
      cgpa: cgpa !== undefined && cgpa !== null && cgpa !== '' ? parseFloat(cgpa) : null
    };

    const { data: newEducation, error } = await supabase
      .from('student_education')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to add education record'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Education record added successfully',
      education: newEducation,
      data: newEducation
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/student/education/:id
 * @desc    Update an education record
 * @access  Private (Student)
 */
const updateEducation = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const recordId = req.params.id || req.body.id || req.query.id;
    if (!recordId) {
      return res.status(400).json({
        status: 'error',
        message: 'Education record ID is required'
      });
    }

    const { degree, institution, year, cgpa } = req.body;
    const updatePayload = {};

    if (degree !== undefined) updatePayload.degree = degree.trim();
    if (institution !== undefined) updatePayload.institution = institution.trim();
    if (year !== undefined) updatePayload.year = year ? parseInt(year, 10) || year : null;
    if (cgpa !== undefined) updatePayload.cgpa = cgpa !== null && cgpa !== '' ? parseFloat(cgpa) : null;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update fields provided'
      });
    }

    const { data: updatedRecord, error } = await supabase
      .from('student_education')
      .update(updatePayload)
      .eq('id', recordId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update education record'
      });
    }

    if (!updatedRecord) {
      return res.status(404).json({
        status: 'error',
        message: 'Education record not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Education record updated successfully',
      education: updatedRecord,
      data: updatedRecord
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/student/education/:id
 * @desc    Delete an education record
 * @access  Private (Student)
 */
const deleteEducation = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const recordId = req.params.id || req.body.id || req.query.id;
    if (!recordId) {
      return res.status(400).json({
        status: 'error',
        message: 'Education record ID is required'
      });
    }

    const { data: deletedRecord, error } = await supabase
      .from('student_education')
      .delete()
      .eq('id', recordId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete education record'
      });
    }

    if (!deletedRecord) {
      return res.status(404).json({
        status: 'error',
        message: 'Education record not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Education record deleted successfully',
      education: deletedRecord,
      data: deletedRecord
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   4. SKILLS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/skills
 * @desc    Get skills list for authenticated student
 * @access  Private (Student)
 */
const getSkills = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: skills, error } = await supabase
      .from('student_skills')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch skills'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: skills ? skills.length : 0,
      skills: skills || [],
      data: skills || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/skills
 * @desc    Add a skill for authenticated student
 * @access  Private (Student)
 */
const addSkill = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { skill_name, proficiency_level } = req.body;

    if (!skill_name) {
      return res.status(400).json({
        status: 'error',
        message: 'Skill name is required'
      });
    }

    const payload = {
      student_id: studentId,
      skill_name: skill_name.trim(),
      proficiency_level: proficiency_level ? proficiency_level.trim() : 'Beginner'
    };

    const { data: newSkill, error } = await supabase
      .from('student_skills')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to add skill'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Skill added successfully',
      skill: newSkill,
      data: newSkill
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/student/skills/:id
 * @desc    Delete a skill for authenticated student
 * @access  Private (Student)
 */
const deleteSkill = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const skillId = req.params.id || req.body.id || req.query.id;
    if (!skillId) {
      return res.status(400).json({
        status: 'error',
        message: 'Skill ID is required'
      });
    }

    const { data: deletedSkill, error } = await supabase
      .from('student_skills')
      .delete()
      .eq('id', skillId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete skill'
      });
    }

    if (!deletedSkill) {
      return res.status(404).json({
        status: 'error',
        message: 'Skill not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Skill deleted successfully',
      skill: deletedSkill,
      data: deletedSkill
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   5. RESUME (PROTECTED)
   ========================================================================== */

/**
 * @route   POST /api/student/resume
 * @desc    Upload/Save student resume file_url
 * @access  Private (Student)
 */
const uploadResume = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { file_url, resume_url, url } = req.body;
    const targetUrl = file_url || resume_url || url;

    if (!targetUrl) {
      return res.status(400).json({
        status: 'error',
        message: 'Resume file_url is required'
      });
    }

    const payload = {
      student_id: studentId,
      file_url: targetUrl.trim(),
      uploaded_at: new Date().toISOString()
    };

    const { data: newResume, error } = await supabase
      .from('resumes')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to save resume'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Resume uploaded successfully',
      resume: newResume,
      data: newResume
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/resume
 * @desc    Get uploaded resumes for authenticated student
 * @access  Private (Student)
 */
const getResume = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: resumes, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('student_id', studentId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch resume'
      });
    }

    return res.status(200).json({
      status: 'success',
      resume: resumes && resumes.length > 0 ? resumes[0] : null,
      resumes: resumes || [],
      data: resumes || []
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   6. CERTIFICATIONS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/certifications
 * @desc    List all certifications for authenticated student
 * @access  Private (Student)
 */
const getCertifications = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: certs, error } = await supabase
      .from('certifications')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch certifications'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: certs ? certs.length : 0,
      certifications: certs || [],
      data: certs || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/certifications
 * @desc    Add a certification
 * @access  Private (Student)
 */
const addCertification = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { title, issuer, issue_date, certificate_url } = req.body;

    if (!title || !issuer) {
      return res.status(400).json({
        status: 'error',
        message: 'Title and issuer are required'
      });
    }

    const payload = {
      student_id: studentId,
      title: title.trim(),
      issuer: issuer.trim(),
      issue_date: issue_date || null,
      certificate_url: certificate_url ? certificate_url.trim() : null
    };

    const { data: newCert, error } = await supabase
      .from('certifications')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to add certification'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Certification added successfully',
      certification: newCert,
      data: newCert
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/student/certifications/:id
 * @desc    Delete a certification
 * @access  Private (Student)
 */
const deleteCertification = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const certId = req.params.id || req.body.id || req.query.id;
    if (!certId) {
      return res.status(400).json({
        status: 'error',
        message: 'Certification ID is required'
      });
    }

    const { data: deletedCert, error } = await supabase
      .from('certifications')
      .delete()
      .eq('id', certId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete certification'
      });
    }

    if (!deletedCert) {
      return res.status(404).json({
        status: 'error',
        message: 'Certification not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Certification deleted successfully',
      certification: deletedCert,
      data: deletedCert
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   7. PROJECTS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/projects
 * @desc    Get all projects for authenticated student
 * @access  Private (Student)
 */
const getProjects = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch projects'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: projects ? projects.length : 0,
      projects: projects || [],
      data: projects || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/projects
 * @desc    Add a project
 * @access  Private (Student)
 */
const addProject = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { title, description, tech_stack, project_url } = req.body;

    if (!title) {
      return res.status(400).json({
        status: 'error',
        message: 'Project title is required'
      });
    }

    const payload = {
      student_id: studentId,
      title: title.trim(),
      description: description ? description.trim() : null,
      tech_stack: tech_stack ? (Array.isArray(tech_stack) ? tech_stack.join(', ') : tech_stack.trim()) : null,
      project_url: project_url ? project_url.trim() : null
    };

    const { data: newProject, error } = await supabase
      .from('projects')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to add project'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Project added successfully',
      project: newProject,
      data: newProject
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/student/projects/:id
 * @desc    Update a project
 * @access  Private (Student)
 */
const updateProject = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const projectId = req.params.id || req.body.id || req.query.id;
    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    const { title, description, tech_stack, project_url } = req.body;
    const updatePayload = {};

    if (title !== undefined) updatePayload.title = title.trim();
    if (description !== undefined) updatePayload.description = description ? description.trim() : null;
    if (tech_stack !== undefined) {
      updatePayload.tech_stack = tech_stack ? (Array.isArray(tech_stack) ? tech_stack.join(', ') : tech_stack.trim()) : null;
    }
    if (project_url !== undefined) updatePayload.project_url = project_url ? project_url.trim() : null;

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update fields provided'
      });
    }

    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update(updatePayload)
      .eq('id', projectId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update project'
      });
    }

    if (!updatedProject) {
      return res.status(404).json({
        status: 'error',
        message: 'Project not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Project updated successfully',
      project: updatedProject,
      data: updatedProject
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/student/projects/:id
 * @desc    Delete a project
 * @access  Private (Student)
 */
const deleteProject = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const projectId = req.params.id || req.body.id || req.query.id;
    if (!projectId) {
      return res.status(400).json({
        status: 'error',
        message: 'Project ID is required'
      });
    }

    const { data: deletedProject, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete project'
      });
    }

    if (!deletedProject) {
      return res.status(404).json({
        status: 'error',
        message: 'Project not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Project deleted successfully',
      project: deletedProject,
      data: deletedProject
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   8. INTERNSHIP APPLICATIONS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/internship-applications
 * @desc    Get all internship applications for authenticated student
 * @access  Private (Student)
 */
const getInternshipApplications = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: apps, error } = await supabase
      .from('internship_applications')
      .select('*')
      .eq('student_id', studentId)
      .order('applied_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch internship applications'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: apps ? apps.length : 0,
      applications: apps || [],
      data: apps || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/internship-applications
 * @desc    Apply for an internship
 * @access  Private (Student)
 */
const applyInternship = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { internship_id, status } = req.body;

    if (!internship_id) {
      return res.status(400).json({
        status: 'error',
        message: 'internship_id is required'
      });
    }

    // Check if already applied
    const { data: existingApp, error: checkError } = await supabase
      .from('internship_applications')
      .select('id')
      .eq('student_id', studentId)
      .eq('internship_id', internship_id)
      .maybeSingle();

    if (existingApp) {
      return res.status(409).json({
        status: 'error',
        message: 'You have already applied for this internship'
      });
    }

    const payload = {
      student_id: studentId,
      internship_id,
      status: status || 'applied',
      applied_at: new Date().toISOString()
    };

    const { data: newApp, error } = await supabase
      .from('internship_applications')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'You have already applied for this internship'
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to submit internship application'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Internship application submitted successfully',
      application: newApp,
      data: newApp
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   9. JOB APPLICATIONS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/job-applications
 * @desc    Get all job applications for authenticated student
 * @access  Private (Student)
 */
const getJobApplications = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: apps, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('student_id', studentId)
      .order('applied_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch job applications'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: apps ? apps.length : 0,
      applications: apps || [],
      data: apps || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/job-applications
 * @desc    Apply for a job
 * @access  Private (Student)
 */
const applyJob = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { job_id, status } = req.body;

    if (!job_id) {
      return res.status(400).json({
        status: 'error',
        message: 'job_id is required'
      });
    }

    // Check if already applied
    const { data: existingApp, error: checkError } = await supabase
      .from('job_applications')
      .select('id')
      .eq('student_id', studentId)
      .eq('job_id', job_id)
      .maybeSingle();

    if (existingApp) {
      return res.status(409).json({
        status: 'error',
        message: 'You have already applied for this job'
      });
    }

    const payload = {
      student_id: studentId,
      job_id,
      status: status || 'applied',
      applied_at: new Date().toISOString()
    };

    const { data: newApp, error } = await supabase
      .from('job_applications')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'You have already applied for this job'
        });
      }
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to submit job application'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Job application submitted successfully',
      application: newApp,
      data: newApp
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   10. SAVED OPPORTUNITIES (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/saved-opportunities
 * @desc    Get all saved opportunities for authenticated student
 * @access  Private (Student)
 */
const getSavedOpportunities = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: saved, error } = await supabase
      .from('saved_opportunities')
      .select('*')
      .eq('student_id', studentId)
      .order('saved_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch saved opportunities'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: saved ? saved.length : 0,
      opportunities: saved || [],
      data: saved || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/saved-opportunities
 * @desc    Save an opportunity (job, internship, etc.)
 * @access  Private (Student)
 */
const saveOpportunity = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { opportunity_id, opportunity_type } = req.body;

    if (!opportunity_id) {
      return res.status(400).json({
        status: 'error',
        message: 'opportunity_id is required'
      });
    }

    // Check if already saved
    const { data: existingSaved } = await supabase
      .from('saved_opportunities')
      .select('id')
      .eq('student_id', studentId)
      .eq('opportunity_id', opportunity_id)
      .maybeSingle();

    if (existingSaved) {
      return res.status(409).json({
        status: 'error',
        message: 'Opportunity is already saved'
      });
    }

    const payload = {
      student_id: studentId,
      opportunity_id,
      opportunity_type: opportunity_type || 'job',
      saved_at: new Date().toISOString()
    };

    const { data: newSaved, error } = await supabase
      .from('saved_opportunities')
      .insert([payload])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to save opportunity'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Opportunity saved successfully',
      opportunity: newSaved,
      data: newSaved
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/student/saved-opportunities/:id
 * @desc    Remove an opportunity from saved list
 * @access  Private (Student)
 */
const deleteSavedOpportunity = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const targetId = req.params.id || req.body.id || req.body.opportunity_id || req.query.id || req.query.opportunity_id;
    if (!targetId) {
      return res.status(400).json({
        status: 'error',
        message: 'Saved opportunity ID or opportunity_id is required'
      });
    }

    // Try deleting by record primary key or opportunity_id
    const { data: deletedRecord, error } = await supabase
      .from('saved_opportunities')
      .delete()
      .eq('student_id', studentId)
      .or(`id.eq.${targetId},opportunity_id.eq.${targetId}`)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to remove saved opportunity'
      });
    }

    if (!deletedRecord) {
      return res.status(404).json({
        status: 'error',
        message: 'Saved opportunity not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Opportunity removed from saved',
      opportunity: deletedRecord,
      data: deletedRecord
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   11. NOTIFICATIONS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/notifications
 * @desc    Fetch notifications for authenticated student
 * @access  Private (Student)
 */
const getNotifications = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch notifications'
      });
    }

    const unreadCount = (notifications || []).filter(n => !n.is_read).length;

    return res.status(200).json({
      status: 'success',
      count: notifications ? notifications.length : 0,
      unread_count: unreadCount,
      notifications: notifications || [],
      data: notifications || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/student/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private (Student)
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const notifId = req.params.id;
    if (!notifId) {
      return res.status(400).json({
        status: 'error',
        message: 'Notification ID is required'
      });
    }

    const { data: updatedNotif, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notifId)
      .eq('student_id', studentId)
      .select('*')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update notification'
      });
    }

    if (!updatedNotif) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification not found or does not belong to you'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Notification marked as read',
      notification: updatedNotif,
      data: updatedNotif
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   12. PLACEMENT STATS (PROTECTED)
   ========================================================================== */

/**
 * @route   GET /api/student/placement-stats
 * @desc    Fetch placement offers and stats for authenticated student
 * @access  Private (Student)
 */
const getPlacementStats = async (req, res, next) => {
  try {
    const studentId = getStudentId(req);
    if (!studentId) return unauthorizedResponse(res);

    const { data: stats, error } = await supabase
      .from('placement_stats')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch placement stats'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: stats ? stats.length : 0,
      placement_stats: stats || [],
      data: stats || []
    });
  } catch (err) {
    next(err);
  }
};

/* ==========================================================================
   ROUTE DEFINITIONS & COMPATIBILITY BINDINGS
   ========================================================================== */

// 1. Auth (Public)
router.post('/login', loginStudent);
router.post('/api/student/login', loginStudent);

// 2. Profile (Protected)
router.get('/profile', authMiddleware, getStudentProfile);
router.get('/api/student/profile', authMiddleware, getStudentProfile);
router.put('/profile', authMiddleware, updateStudentProfile);
router.put('/api/student/profile', authMiddleware, updateStudentProfile);

// 3. Education (Protected)
router.get('/education', authMiddleware, getEducation);
router.get('/api/student/education', authMiddleware, getEducation);
router.post('/education', authMiddleware, addEducation);
router.post('/api/student/education', authMiddleware, addEducation);
router.put('/education/:id', authMiddleware, updateEducation);
router.put('/education', authMiddleware, updateEducation);
router.put('/api/student/education/:id', authMiddleware, updateEducation);
router.delete('/education/:id', authMiddleware, deleteEducation);
router.delete('/education', authMiddleware, deleteEducation);
router.delete('/api/student/education/:id', authMiddleware, deleteEducation);

// 4. Skills (Protected)
router.get('/skills', authMiddleware, getSkills);
router.get('/api/student/skills', authMiddleware, getSkills);
router.post('/skills', authMiddleware, addSkill);
router.post('/api/student/skills', authMiddleware, addSkill);
router.delete('/skills/:id', authMiddleware, deleteSkill);
router.delete('/skills', authMiddleware, deleteSkill);
router.delete('/api/student/skills/:id', authMiddleware, deleteSkill);

// 5. Resume (Protected)
router.post('/resume', authMiddleware, uploadResume);
router.post('/api/student/resume', authMiddleware, uploadResume);
router.get('/resume', authMiddleware, getResume);
router.get('/api/student/resume', authMiddleware, getResume);

// 6. Certifications (Protected)
router.get('/certifications', authMiddleware, getCertifications);
router.get('/api/student/certifications', authMiddleware, getCertifications);
router.post('/certifications', authMiddleware, addCertification);
router.post('/api/student/certifications', authMiddleware, addCertification);
router.delete('/certifications/:id', authMiddleware, deleteCertification);
router.delete('/certifications', authMiddleware, deleteCertification);
router.delete('/api/student/certifications/:id', authMiddleware, deleteCertification);

// 7. Projects (Protected)
router.get('/projects', authMiddleware, getProjects);
router.get('/api/student/projects', authMiddleware, getProjects);
router.post('/projects', authMiddleware, addProject);
router.post('/api/student/projects', authMiddleware, addProject);
router.put('/projects/:id', authMiddleware, updateProject);
router.put('/projects', authMiddleware, updateProject);
router.put('/api/student/projects/:id', authMiddleware, updateProject);
router.delete('/projects/:id', authMiddleware, deleteProject);
router.delete('/projects', authMiddleware, deleteProject);
router.delete('/api/student/projects/:id', authMiddleware, deleteProject);

// 8. Internship Applications (Protected)
router.get('/internship-applications', authMiddleware, getInternshipApplications);
router.get('/api/student/internship-applications', authMiddleware, getInternshipApplications);
router.post('/internship-applications', authMiddleware, applyInternship);
router.post('/api/student/internship-applications', authMiddleware, applyInternship);

// 9. Job Applications (Protected)
router.get('/job-applications', authMiddleware, getJobApplications);
router.get('/api/student/job-applications', authMiddleware, getJobApplications);
router.post('/job-applications', authMiddleware, applyJob);
router.post('/api/student/job-applications', authMiddleware, applyJob);

// 10. Saved Opportunities (Protected)
router.get('/saved-opportunities', authMiddleware, getSavedOpportunities);
router.get('/api/student/saved-opportunities', authMiddleware, getSavedOpportunities);
router.post('/saved-opportunities', authMiddleware, saveOpportunity);
router.post('/api/student/saved-opportunities', authMiddleware, saveOpportunity);
router.delete('/saved-opportunities/:id', authMiddleware, deleteSavedOpportunity);
router.delete('/saved-opportunities', authMiddleware, deleteSavedOpportunity);
router.delete('/api/student/saved-opportunities/:id', authMiddleware, deleteSavedOpportunity);

// 11. Notifications (Protected)
router.get('/notifications', authMiddleware, getNotifications);
router.get('/api/student/notifications', authMiddleware, getNotifications);
router.put('/notifications/:id/read', authMiddleware, markNotificationAsRead);
router.patch('/notifications/:id/read', authMiddleware, markNotificationAsRead);
router.put('/api/student/notifications/:id/read', authMiddleware, markNotificationAsRead);
router.patch('/api/student/notifications/:id/read', authMiddleware, markNotificationAsRead);

// 12. Placement Stats (Protected)
router.get('/placement-stats', authMiddleware, getPlacementStats);
router.get('/api/student/placement-stats', authMiddleware, getPlacementStats);

// Dashboard (Protected)
router.get('/dashboard', authMiddleware, getStudentDashboard);
router.get('/api/student/dashboard', authMiddleware, getStudentDashboard);

// Attach handlers for unit testing
router.loginStudent = loginStudent;
router.getStudentDashboard = getStudentDashboard;
router.getStudentProfile = getStudentProfile;
router.updateStudentProfile = updateStudentProfile;
router.getEducation = getEducation;
router.addEducation = addEducation;
router.updateEducation = updateEducation;
router.deleteEducation = deleteEducation;
router.getSkills = getSkills;
router.addSkill = addSkill;
router.deleteSkill = deleteSkill;
router.uploadResume = uploadResume;
router.getResume = getResume;
router.getCertifications = getCertifications;
router.addCertification = addCertification;
router.deleteCertification = deleteCertification;
router.getProjects = getProjects;
router.addProject = addProject;
router.updateProject = updateProject;
router.deleteProject = deleteProject;
router.getInternshipApplications = getInternshipApplications;
router.applyInternship = applyInternship;
router.getJobApplications = getJobApplications;
router.applyJob = applyJob;
router.getSavedOpportunities = getSavedOpportunities;
router.saveOpportunity = saveOpportunity;
router.deleteSavedOpportunity = deleteSavedOpportunity;
router.getNotifications = getNotifications;
router.markNotificationAsRead = markNotificationAsRead;
router.getPlacementStats = getPlacementStats;

module.exports = router;
