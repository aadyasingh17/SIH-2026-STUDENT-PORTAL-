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
    const collegeId = req.college.id;

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

// Route-level middleware binding for protected dashboard routes
router.get('/', authMiddleware, requireRole('college'), getDashboardStats);
router.get('/dashboard', authMiddleware, requireRole('college'), getDashboardStats);

module.exports = router;
