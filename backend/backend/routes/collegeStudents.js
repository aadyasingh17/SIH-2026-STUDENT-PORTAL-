const express = require('express');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/**
 * Handler: List all students belonging to the logged-in college
 */
const getStudents = async (req, res, next) => {
  try {
    const collegeId = req.college.id;

    const { data: students, error } = await supabase
      .from('students')
      .select('*')
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
      students: students || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: Add a new student under the logged-in college
 */
const addStudent = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const { name, email, roll_no, branch, cgpa, batch_year, is_verified } = req.body;

    // Validate required fields
    if (!name || !email || !roll_no || !branch) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, email, roll_no, and branch are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRollNo = roll_no.trim();

    // Check for existing student in the same college with duplicate email or roll_no
    const { data: existingStudent, error: checkError } = await supabase
      .from('students')
      .select('id, email, roll_no')
      .eq('college_id', collegeId)
      .or(`email.eq.${normalizedEmail},roll_no.eq.${normalizedRollNo}`)
      .maybeSingle();

    if (existingStudent) {
      const field = existingStudent.email === normalizedEmail ? 'email' : 'roll number';
      return res.status(409).json({
        status: 'error',
        message: `A student with this ${field} already exists in your college`
      });
    }

    // Insert student scoped to logged-in college
    const { data: newStudent, error: insertError } = await supabase
      .from('students')
      .insert([
        {
          college_id: collegeId,
          name: name.trim(),
          email: normalizedEmail,
          roll_no: normalizedRollNo,
          branch: branch.trim(),
          cgpa: cgpa !== undefined ? parseFloat(cgpa) : null,
          batch_year: batch_year ? parseInt(batch_year, 10) : null,
          is_verified: is_verified !== undefined ? Boolean(is_verified) : false
        }
      ])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'A student with this roll number or email already exists'
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
      student: newStudent
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: Update a student's details or set is_verified to true
 */
const updateStudent = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const studentId = req.params.id;
    const { name, email, roll_no, branch, cgpa, batch_year, is_verified, placement_status } = req.body;

    // Build update payload dynamically
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = name.trim();
    if (email !== undefined) updatePayload.email = email.trim().toLowerCase();
    if (roll_no !== undefined) updatePayload.roll_no = roll_no.trim();
    if (branch !== undefined) updatePayload.branch = branch.trim();
    if (cgpa !== undefined) updatePayload.cgpa = parseFloat(cgpa);
    if (batch_year !== undefined) updatePayload.batch_year = parseInt(batch_year, 10);
    if (is_verified !== undefined) updatePayload.is_verified = Boolean(is_verified);
    if (placement_status !== undefined) updatePayload.placement_status = placement_status;

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
      .select()
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
      student: updatedStudent
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: Remove a student from the logged-in college
 */
const deleteStudent = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const studentId = req.params.id;

    // Delete only if student belongs to this college
    const { data: deletedStudent, error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId)
      .eq('college_id', collegeId)
      .select()
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
      student: deletedStudent
    });
  } catch (err) {
    next(err);
  }
};

// Route-level middleware binding for protected student routes
router.get('/', authMiddleware, requireRole('college'), getStudents);
router.get('/students', authMiddleware, requireRole('college'), getStudents);

router.post('/', authMiddleware, requireRole('college'), addStudent);
router.post('/students', authMiddleware, requireRole('college'), addStudent);

router.put('/:id', authMiddleware, requireRole('college'), updateStudent);
router.put('/students/:id', authMiddleware, requireRole('college'), updateStudent);

router.delete('/:id', authMiddleware, requireRole('college'), deleteStudent);
router.delete('/students/:id', authMiddleware, requireRole('college'), deleteStudent);

module.exports = router;
