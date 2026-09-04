const express = require('express');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/**
 * Helper to safely extract college ID from the decoded JWT payload
 */
const getCollegeId = (req) => {
  return (req.college && (req.college.id || req.college.collegeId || req.college.college_id))
    || (req.user && (req.user.id || req.user.collegeId || req.user.college_id));
};

/**
 * @route   GET /api/college/students
 * @desc    Fetch all students linked to the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const getStudents = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { data: students, error } = await supabase
      .from('students')
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at')
      .eq('college_id', collegeId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch students'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: students ? students.length : 0,
      students: students || [],
      data: students || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/college/students
 * @desc    Add a new student linked to the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const addStudent = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { name, email, roll_no, branch, skills, is_verified } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        status: 'error',
        message: 'Name and email are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRollNo = roll_no ? roll_no.trim() : null;
    const studentBranch = branch ? branch.trim() : null;

    // Normalize skills to a string array for PostgreSQL text[]
    let parsedSkills = [];
    if (Array.isArray(skills)) {
      parsedSkills = skills.map(s => typeof s === 'string' ? s.trim() : String(s)).filter(Boolean);
    } else if (typeof skills === 'string' && skills.trim().length > 0) {
      parsedSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Check for existing student in the same college with duplicate email or roll_no
    let checkQuery = supabase
      .from('students')
      .select('id, email, roll_no')
      .eq('college_id', collegeId);

    if (normalizedRollNo) {
      checkQuery = checkQuery.or(`email.eq.${normalizedEmail},roll_no.eq.${normalizedRollNo}`);
    } else {
      checkQuery = checkQuery.eq('email', normalizedEmail);
    }

    const { data: existingStudent, error: checkError } = await checkQuery.maybeSingle();

    if (existingStudent) {
      const field = existingStudent.email === normalizedEmail ? 'email' : 'roll number';
      return res.status(409).json({
        status: 'error',
        message: `A student with this ${field} already exists in your college`
      });
    }

    // Insert student record using actual Supabase schema columns
    const newStudentData = {
      college_id: collegeId,
      name: name.trim(),
      email: normalizedEmail,
      roll_no: normalizedRollNo,
      branch: studentBranch,
      skills: parsedSkills,
      is_verified: is_verified !== undefined ? Boolean(is_verified) : false
    };

    console.log('newStudentData:', newStudentData);

    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert([newStudentData])
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'A student with this email or roll number already exists'
        });
      }
      return res.status(500).json({
        status: 'error',
        message: insertError.message || 'Failed to add student'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Student added successfully',
      student: newStudent,
      data: newStudent
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/college/students/:id
 * @desc    Update a student's details or verification status
 * @access  Private (Protected via authMiddleware)
 */
const updateStudent = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);
    const studentId = req.params.id;

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { name, email, roll_no, branch, skills, is_verified } = req.body;
    const updatePayload = {};

    if (name !== undefined) updatePayload.name = name.trim();
    if (email !== undefined) updatePayload.email = email.trim().toLowerCase();
    if (roll_no !== undefined) updatePayload.roll_no = roll_no.trim();
    if (branch !== undefined) updatePayload.branch = branch.trim();
    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        updatePayload.skills = skills.map(s => typeof s === 'string' ? s.trim() : String(s)).filter(Boolean);
      } else if (typeof skills === 'string') {
        updatePayload.skills = skills.split(',').map(s => s.trim()).filter(Boolean);
      } else if (skills === null) {
        updatePayload.skills = [];
      }
    }
    if (is_verified !== undefined) updatePayload.is_verified = Boolean(is_verified);

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update fields provided'
      });
    }

    // Update only if student belongs to this college
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update(updatePayload)
      .eq('id', studentId)
      .eq('college_id', collegeId)
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at')
      .maybeSingle();

    if (updateError) {
      return res.status(500).json({
        status: 'error',
        message: updateError.message || 'Failed to update student'
      });
    }

    if (!updatedStudent) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found or does not belong to your college'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Student updated successfully',
      student: updatedStudent,
      data: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/college/students/:id
 * @desc    Delete a student record belonging to the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const deleteStudent = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);
    const studentId = req.params.id;

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    // Delete only if student belongs to this college
    const { data: deletedStudent, error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId)
      .eq('college_id', collegeId)
      .select('id, college_id, name, email, roll_no, branch, skills, is_verified, created_at')
      .maybeSingle();

    if (deleteError) {
      return res.status(500).json({
        status: 'error',
        message: deleteError.message || 'Failed to delete student'
      });
    }

    if (!deletedStudent) {
      return res.status(404).json({
        status: 'error',
        message: 'Student not found or does not belong to your college'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Student deleted successfully',
      student: deletedStudent,
      data: deletedStudent
    });
  } catch (err) {
    next(err);
  }
};

// Protected routes using authMiddleware (supporting both /api/college and /api/college/students mounts)
router.get('/', authMiddleware, getStudents);
router.get('/students', authMiddleware, getStudents);
router.get('/api/college/students', authMiddleware, getStudents);

router.post('/', authMiddleware, addStudent);
router.post('/students', authMiddleware, addStudent);
router.post('/api/college/students', authMiddleware, addStudent);

router.put('/:id', authMiddleware, updateStudent);
router.put('/students/:id', authMiddleware, updateStudent);

router.delete('/:id', authMiddleware, deleteStudent);
router.delete('/students/:id', authMiddleware, deleteStudent);

// Attach handlers for direct testing
router.getStudents = getStudents;
router.addStudent = addStudent;
router.updateStudent = updateStudent;
router.deleteStudent = deleteStudent;

module.exports = router;
