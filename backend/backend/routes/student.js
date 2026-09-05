const express = require('express');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @route   GET /api/student/dashboard
 * @desc    Get dashboard metrics, active applications, and upcoming drives for authenticated student
 * @access  Private (Authenticated Student)
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'User email not found in token'
      });
    }

    // 1. Fetch student record by email
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, college_id, name, email, roll_no, branch, batch_year, cgpa, skills, is_verified, created_at')
      .ilike('email', userEmail.trim())
      .maybeSingle();

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
    const upcomingDrivesPromise = supabase
      .from('drives')
      .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
      .eq('college_id', student.college_id)
      .or(`status.eq.upcoming,drive_date.gte.${today}`)
      .order('drive_date', { ascending: true });

    const [
      { data: applications, error: appsError },
      { data: upcomingDrives, error: drivesError }
    ] = await Promise.all([applicationsPromise, upcomingDrivesPromise]);

    if (appsError || drivesError) {
      const errorMsg = (appsError || drivesError).message;
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
    console.error('Get student dashboard error:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});


/**
 * @route   GET /api/student/profile
 * @desc    Get profile for currently authenticated student (looked up by email)
 * @access  Private (Authenticated Student)
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'User email not found in token'
      });
    }

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .ilike('email', userEmail.trim())
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch student profile'
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
      student
    });
  } catch (error) {
    console.error('Get student profile error:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

/**
 * @route   PUT /api/student/profile
 * @desc    Update editable fields for currently authenticated student
 * @access  Private (Authenticated Student)
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(400).json({
        status: 'error',
        message: 'User email not found in token'
      });
    }

    // 1. Verify that the student record exists
    const { data: existingStudent, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .ilike('email', userEmail.trim())
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({
        status: 'error',
        message: fetchError.message || 'Error checking student record'
      });
    }

    if (!existingStudent) {
      return res.status(404).json({
        status: 'error',
        message: 'Student profile not found'
      });
    }

    // 2. Extract only allowed editable fields
    const { name, roll_no, branch, batch_year, cgpa, skills } = req.body;
    const updatePayload = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Name must be a non-empty string'
        });
      }
      updatePayload.name = name.trim();
    }

    if (roll_no !== undefined) {
      if (typeof roll_no !== 'string' || !roll_no.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Roll number must be a non-empty string'
        });
      }
      updatePayload.roll_no = roll_no.trim();
    }

    if (branch !== undefined) {
      if (typeof branch !== 'string' || !branch.trim()) {
        return res.status(400).json({
          status: 'error',
          message: 'Branch must be a non-empty string'
        });
      }
      updatePayload.branch = branch.trim();
    }

    if (batch_year !== undefined) {
      updatePayload.batch_year = batch_year !== null ? String(batch_year).trim() : null;
    }

    if (cgpa !== undefined) {
      if (cgpa !== null) {
        const parsedCgpa = parseFloat(cgpa);
        if (isNaN(parsedCgpa) || parsedCgpa < 0 || parsedCgpa > 10) {
          return res.status(400).json({
            status: 'error',
            message: 'CGPA must be a valid number between 0 and 10'
          });
        }
        updatePayload.cgpa = String(parsedCgpa);
      } else {
        updatePayload.cgpa = null;
      }
    }

    if (skills !== undefined) {
      if (skills !== null && !Array.isArray(skills)) {
        return res.status(400).json({
          status: 'error',
          message: 'Skills must be an array of strings'
        });
      }
      if (Array.isArray(skills)) {
        updatePayload.skills = skills.map(s => String(s).trim()).filter(Boolean);
      } else {
        updatePayload.skills = null;
      }
    }

    // 3. Ensure at least one valid field was provided
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No valid editable fields provided. Allowed fields: name, roll_no, branch, batch_year, cgpa, skills'
      });
    }

    // 4. Update student record in Supabase
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update(updatePayload)
      .eq('id', existingStudent.id)
      .select('*')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'A student with this roll number already exists'
        });
      }
      return res.status(500).json({
        status: 'error',
        message: updateError.message || 'Failed to update student profile'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Student profile updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student profile error:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

module.exports = router;
