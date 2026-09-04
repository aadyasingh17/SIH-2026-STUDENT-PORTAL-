const express = require('express');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/**
 * Handler: Create a new campus placement drive
 */
const createDrive = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const {
      company_name,
      role_title,
      eligibility_criteria,
      drive_date,
      package_lpa,
      location,
      description,
      status
    } = req.body;

    // Validate required fields
    if (!company_name || !role_title || !drive_date) {
      return res.status(400).json({
        status: 'error',
        message: 'Company name, role title, and drive date are required'
      });
    }

    // Insert drive scoped to logged-in college
    const { data: newDrive, error } = await supabase
      .from('drives')
      .insert([
        {
          college_id: collegeId,
          company_name: company_name.trim(),
          role_title: role_title.trim(),
          eligibility_criteria: eligibility_criteria || null,
          drive_date: new Date(drive_date).toISOString(),
          package_lpa: package_lpa !== undefined ? parseFloat(package_lpa) : null,
          location: location || null,
          description: description || null,
          status: status || 'upcoming'
        }
      ])
      .select()
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
      drive: newDrive
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: List all drives belonging to the logged-in college
 */
const getDrives = async (req, res, next) => {
  try {
    const collegeId = req.college.id;

    const { data: drives, error } = await supabase
      .from('drives')
      .select('*')
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
      drives: drives || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: List all applications for a drive, joined with student details
 */
const getDriveApplications = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const driveId = req.params.id;

    // Verify that the drive exists and belongs to the logged-in college
    const { data: drive, error: driveError } = await supabase
      .from('drives')
      .select('id, company_name, role_title')
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

    // Query drive_applications joined with student details
    const { data: applications, error: appsError } = await supabase
      .from('drive_applications')
      .select(`
        id,
        drive_id,
        student_id,
        status,
        applied_at,
        resume_url,
        notes,
        students (
          id,
          name,
          email,
          roll_no,
          branch,
          cgpa
        )
      `)
      .eq('drive_id', driveId)
      .order('applied_at', { ascending: false });

    if (appsError) {
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
          .select('id, name, email, roll_no, branch, cgpa')
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
        applications: populatedApps
      });
    }

    return res.status(200).json({
      status: 'success',
      drive,
      count: applications ? applications.length : 0,
      applications: applications || []
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Handler: Update drive status or details
 */
const updateDrive = async (req, res, next) => {
  try {
    const collegeId = req.college.id;
    const driveId = req.params.id;
    const {
      status,
      company_name,
      role_title,
      eligibility_criteria,
      drive_date,
      package_lpa,
      location,
      description
    } = req.body;

    const updatePayload = {};
    if (status !== undefined) updatePayload.status = status;
    if (company_name !== undefined) updatePayload.company_name = company_name.trim();
    if (role_title !== undefined) updatePayload.role_title = role_title.trim();
    if (eligibility_criteria !== undefined) updatePayload.eligibility_criteria = eligibility_criteria;
    if (drive_date !== undefined) updatePayload.drive_date = new Date(drive_date).toISOString();
    if (package_lpa !== undefined) updatePayload.package_lpa = parseFloat(package_lpa);
    if (location !== undefined) updatePayload.location = location;
    if (description !== undefined) updatePayload.description = description;

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
      .select()
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
      drive: updatedDrive
    });
  } catch (err) {
    next(err);
  }
};

// Route-level middleware binding for protected drive routes
router.post('/', authMiddleware, requireRole('college'), createDrive);
router.post('/drives', authMiddleware, requireRole('college'), createDrive);

router.get('/', authMiddleware, requireRole('college'), getDrives);
router.get('/drives', authMiddleware, requireRole('college'), getDrives);

router.get('/:id/applications', authMiddleware, requireRole('college'), getDriveApplications);
router.get('/drives/:id/applications', authMiddleware, requireRole('college'), getDriveApplications);

router.put('/:id', authMiddleware, requireRole('college'), updateDrive);
router.put('/drives/:id', authMiddleware, requireRole('college'), updateDrive);

module.exports = router;
