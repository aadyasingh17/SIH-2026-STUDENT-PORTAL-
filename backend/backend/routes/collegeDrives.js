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
 * @route   POST /api/college/drives
 * @desc    Create a new campus placement drive for the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const createDrive = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const {
      company_name,
      role_title,
      title,
      role,
      eligibility_criteria,
      eligibility,
      criteria,
      drive_date,
      date,
      status
    } = req.body;

    const resolvedRoleTitle = (role_title || title || role || '').trim();
    const resolvedCompanyName = (company_name || '').trim();
    const resolvedDriveDate = drive_date || date;
    const resolvedEligibility = (eligibility_criteria || eligibility || criteria || null);

    // Validate required fields
    if (!resolvedCompanyName || !resolvedRoleTitle || !resolvedDriveDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Company name, role title, and drive date are required'
      });
    }

    // Parse and normalize drive date (YYYY-MM-DD)
    let formattedDate = resolvedDriveDate;
    try {
      formattedDate = new Date(resolvedDriveDate).toISOString().split('T')[0];
    } catch {
      formattedDate = resolvedDriveDate;
    }

    // Insert drive record scoped to logged-in college using actual Supabase schema
    const newDriveData = {
      college_id: collegeId,
      company_name: resolvedCompanyName,
      role_title: resolvedRoleTitle,
      eligibility_criteria: resolvedEligibility ? resolvedEligibility.trim() : null,
      drive_date: formattedDate,
      status: status || 'upcoming'
    };

    const { data: newDrive, error } = await supabase
      .from('drives')
      .insert([newDriveData])
      .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
      .single();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create placement drive'
      });
    }

    return res.status(201).json({
      status: 'success',
      message: 'Drive created successfully',
      drive: newDrive,
      data: newDrive
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/college/drives
 * @desc    List all drives created by the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const getDrives = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { data: drives, error } = await supabase
      .from('drives')
      .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
      .eq('college_id', collegeId)
      .order('drive_date', { ascending: true });

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch drives'
      });
    }

    return res.status(200).json({
      status: 'success',
      count: drives ? drives.length : 0,
      drives: drives || [],
      data: drives || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/college/drives/:id
 * @desc    Update a drive belonging to the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const updateDrive = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);
    const driveId = req.params.id;

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const {
      status,
      company_name,
      role_title,
      title,
      role,
      eligibility_criteria,
      eligibility,
      criteria,
      drive_date,
      date
    } = req.body;

    const updatePayload = {};
    if (status !== undefined) updatePayload.status = status;
    if (company_name !== undefined) updatePayload.company_name = company_name.trim();

    const resolvedRoleTitle = role_title || title || role;
    if (resolvedRoleTitle !== undefined) updatePayload.role_title = resolvedRoleTitle.trim();

    const resolvedEligibility = eligibility_criteria || eligibility || criteria;
    if (resolvedEligibility !== undefined) updatePayload.eligibility_criteria = resolvedEligibility ? resolvedEligibility.trim() : null;

    const resolvedDate = drive_date || date;
    if (resolvedDate !== undefined) {
      try {
        updatePayload.drive_date = new Date(resolvedDate).toISOString().split('T')[0];
      } catch {
        updatePayload.drive_date = resolvedDate;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No update fields provided'
      });
    }

    // Update only if drive belongs to this college
    const { data: updatedDrive, error: updateError } = await supabase
      .from('drives')
      .update(updatePayload)
      .eq('id', driveId)
      .eq('college_id', collegeId)
      .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
      .maybeSingle();

    if (updateError) {
      return res.status(500).json({
        status: 'error',
        message: updateError.message || 'Failed to update drive'
      });
    }

    if (!updatedDrive) {
      return res.status(404).json({
        status: 'error',
        message: 'Drive not found or does not belong to your college'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Drive updated successfully',
      drive: updatedDrive,
      data: updatedDrive
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/college/drives/:id
 * @desc    Delete a drive belonging to the logged-in college
 * @access  Private (Protected via authMiddleware)
 */
const deleteDrive = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);
    const driveId = req.params.id;

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    // Delete only if drive belongs to this college
    const { data: deletedDrive, error: deleteError } = await supabase
      .from('drives')
      .delete()
      .eq('id', driveId)
      .eq('college_id', collegeId)
      .select('id, college_id, company_name, role_title, eligibility_criteria, drive_date, status, created_at')
      .maybeSingle();

    if (deleteError) {
      return res.status(500).json({
        status: 'error',
        message: deleteError.message || 'Failed to delete drive'
      });
    }

    if (!deletedDrive) {
      return res.status(404).json({
        status: 'error',
        message: 'Drive not found or does not belong to your college'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Drive deleted successfully',
      drive: deletedDrive,
      data: deletedDrive
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/college/drives/:id/applications
 * @desc    List all student applications for a drive
 * @access  Private (Protected via authMiddleware)
 */
const getDriveApplications = async (req, res, next) => {
  try {
    const collegeId = getCollegeId(req);
    const driveId = req.params.id;

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    // Verify that the drive exists and belongs to the logged-in college
    const { data: drive, error: driveError } = await supabase
      .from('drives')
      .select('id, college_id, company_name, role_title')
      .eq('id', driveId)
      .eq('college_id', collegeId)
      .maybeSingle();

    if (driveError) {
      return res.status(500).json({
        status: 'error',
        message: driveError.message || 'Error verifying drive ownership'
      });
    }

    if (!drive) {
      return res.status(404).json({
        status: 'error',
        message: 'Drive not found or does not belong to your college'
      });
    }

    // Query drive_applications
    const { data: rawApps, error: rawError } = await supabase
      .from('drive_applications')
      .select('*')
      .eq('drive_id', driveId);

    if (rawError) {
      return res.status(500).json({
        status: 'error',
        message: rawError.message || 'Failed to fetch drive applications'
      });
    }

    const studentIds = (rawApps || []).map(a => a.student_id).filter(Boolean);
    let studentMap = {};

    if (studentIds.length > 0) {
      const { data: studentsList } = await supabase
        .from('students')
        .select('id, name, email, roll_no, branch, skills, is_verified')
        .in('id', studentIds);

      if (studentsList) {
        studentsList.forEach(s => { studentMap[s.id] = s; });
      }
    }

    const populatedApps = (rawApps || []).map(app => ({
      ...app,
      student: studentMap[app.student_id] || null
    }));

    return res.status(200).json({
      status: 'success',
      drive,
      count: populatedApps.length,
      applications: populatedApps,
      data: populatedApps
    });
  } catch (err) {
    next(err);
  }
};

// Protected routes using authMiddleware (supporting both /api/college and /api/college/drives mounts)
router.post('/', authMiddleware, createDrive);
router.post('/drives', authMiddleware, createDrive);
router.post('/api/college/drives', authMiddleware, createDrive);

router.get('/', authMiddleware, getDrives);
router.get('/drives', authMiddleware, getDrives);
router.get('/api/college/drives', authMiddleware, getDrives);

router.get('/:id/applications', authMiddleware, getDriveApplications);
router.get('/drives/:id/applications', authMiddleware, getDriveApplications);
router.get('/api/college/drives/:id/applications', authMiddleware, getDriveApplications);

router.put('/:id', authMiddleware, updateDrive);
router.put('/drives/:id', authMiddleware, updateDrive);
router.put('/api/college/drives/:id', authMiddleware, updateDrive);

router.delete('/:id', authMiddleware, deleteDrive);
router.delete('/drives/:id', authMiddleware, deleteDrive);
router.delete('/api/college/drives/:id', authMiddleware, deleteDrive);

// Attach handlers for testing
router.createDrive = createDrive;
router.getDrives = getDrives;
router.updateDrive = updateDrive;
router.deleteDrive = deleteDrive;
router.getDriveApplications = getDriveApplications;

module.exports = router;
