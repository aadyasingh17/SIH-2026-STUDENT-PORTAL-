const express = require('express');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/**
 * @route   GET /api/college/dashboard (or /dashboard)
 * @desc    Fetch placement analytics & summary KPIs for the logged-in college
 * @access  Private (College only)
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const collegeId = (req.college && (req.college.id || req.college.collegeId || req.college.college_id))
      || (req.user && (req.user.id || req.user.collegeId || req.user.college_id));

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    // 1. Total students count
    const totalStudentsPromise = supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('college_id', collegeId);

    // 2. Verified students count
    const verifiedStudentsPromise = supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('college_id', collegeId)
      .eq('is_verified', true);

    // 3. Active / Upcoming drives count
    const activeDrivesPromise = supabase
      .from('drives')
      .select('*', { count: 'exact', head: true })
      .eq('college_id', collegeId)
      .eq('status', 'upcoming');

    // 4. College drive IDs (to count total applications)
    const collegeDrivesPromise = supabase
      .from('drives')
      .select('id')
      .eq('college_id', collegeId);

    const [
      { count: totalStudents, error: totalErr },
      { count: verifiedStudents, error: verifiedErr },
      { count: activeDrives, error: drivesErr },
      { data: collegeDrives, error: collegeDrivesErr }
    ] = await Promise.all([
      totalStudentsPromise,
      verifiedStudentsPromise,
      activeDrivesPromise,
      collegeDrivesPromise
    ]);

    if (totalErr || verifiedErr || drivesErr || collegeDrivesErr) {
      const errorMsg = (totalErr || verifiedErr || drivesErr || collegeDrivesErr).message;
      return res.status(500).json({
        status: 'error',
        message: errorMsg || 'Failed to fetch dashboard metrics'
      });
    }

    // 5. Total applications across all drives of this college
    let totalApplications = 0;
    const driveIds = (collegeDrives || []).map(d => d.id).filter(Boolean);

    if (driveIds.length > 0) {
      const { count: appsCount, error: appsErr } = await supabase
        .from('drive_applications')
        .select('*', { count: 'exact', head: true })
        .in('drive_id', driveIds);

      if (!appsErr && appsCount !== null) {
        totalApplications = appsCount;
      }
    }

    return res.status(200).json({
      status: 'success',
      total_students: totalStudents || 0,
      verified_students: verifiedStudents || 0,
      active_drives: activeDrives || 0,
      total_applications: totalApplications || 0
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/college/profile (or /profile)
 * @desc    Fetch logged-in college's own profile data from colleges table
 * @access  Private (Protected via authMiddleware)
 */
const getCollegeProfile = async (req, res, next) => {
  try {
    const collegeId = (req.college && (req.college.id || req.college.collegeId || req.college.college_id))
      || (req.user && (req.user.id || req.user.collegeId || req.user.college_id));

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { data: college, error } = await supabase
      .from('colleges')
      .select('id, name, email, location, contact_person, phone, created_at')
      .eq('id', collegeId)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Database error while fetching college profile'
      });
    }

    if (!college) {
      return res.status(404).json({
        status: 'error',
        message: 'College profile not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      college,
      data: college
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/college/profile (or /profile)
 * @desc    Update college profile (name, location, contact_person, phone)
 * @access  Private (Protected via authMiddleware)
 */
const updateCollegeProfile = async (req, res, next) => {
  try {
    const collegeId = (req.college && (req.college.id || req.college.collegeId || req.college.college_id))
      || (req.user && (req.user.id || req.user.collegeId || req.user.college_id));

    if (!collegeId) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Missing college identifier in token'
      });
    }

    const { name, location, contact_person, phone } = req.body;
    const updatePayload = {};

    if (name !== undefined) updatePayload.name = typeof name === 'string' ? name.trim() : name;
    if (location !== undefined) updatePayload.location = location;
    if (contact_person !== undefined) updatePayload.contact_person = contact_person;
    if (phone !== undefined) updatePayload.phone = phone;

    // If nothing to update, return the current college profile
    if (Object.keys(updatePayload).length === 0) {
      const { data: currentCollege, error: fetchErr } = await supabase
        .from('colleges')
        .select('id, name, email, location, contact_person, phone, created_at')
        .eq('id', collegeId)
        .maybeSingle();

      if (fetchErr) {
        return res.status(500).json({
          status: 'error',
          message: fetchErr.message || 'Database error while fetching college profile'
        });
      }

      if (!currentCollege) {
        return res.status(404).json({
          status: 'error',
          message: 'College profile not found'
        });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        college: currentCollege,
        data: currentCollege
      });
    }

    const { data: updatedCollege, error } = await supabase
      .from('colleges')
      .update(updatePayload)
      .eq('id', collegeId)
      .select('id, name, email, location, contact_person, phone, created_at')
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to update profile'
      });
    }

    if (!updatedCollege) {
      return res.status(404).json({
        status: 'error',
        message: 'College profile not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      college: updatedCollege,
      data: updatedCollege
    });
  } catch (err) {
    next(err);
  }
};

// Protected profile routes using authMiddleware
router.get('/profile', authMiddleware, getCollegeProfile);
router.get('/api/college/profile', authMiddleware, getCollegeProfile);
router.put('/profile', authMiddleware, updateCollegeProfile);
router.put('/api/college/profile', authMiddleware, updateCollegeProfile);

// Protected dashboard analytics routes
router.get('/', authMiddleware, requireRole('college'), getDashboardStats);
router.get('/dashboard', authMiddleware, requireRole('college'), getDashboardStats);

// Attach handlers to router object for modular testing
router.getDashboardStats = getDashboardStats;
router.getCollegeProfile = getCollegeProfile;
router.updateCollegeProfile = updateCollegeProfile;

module.exports = router;
