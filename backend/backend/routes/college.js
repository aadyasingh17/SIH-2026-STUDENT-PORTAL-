const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

// Sub-module routers
const collegeStudents = require('./collegeStudents');
const collegeDrives = require('./collegeDrives');
const collegeDashboard = require('./collegeDashboard');

const router = express.Router();

/**
 * ============================================================================
 * PUBLIC ROUTES (No authMiddleware)
 * ============================================================================
 */

/**
 * @route   POST /api/college/signup
 * @desc    Register a new college account
 * @access  Public
 */
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, location, contact_person, phone } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if college already exists
    const { data: existingCollege, error: checkError } = await supabase
      .from('colleges')
      .select('id, email')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingCollege) {
      return res.status(409).json({
        status: 'error',
        message: 'A college with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new college record using password_hash column
    const { data: newCollege, error: insertError } = await supabase
      .from('colleges')
      .insert([
        {
          name: name || 'Unnamed College',
          email: normalizedEmail,
          password_hash: hashedPassword,
          location: location || null,
          contact_person: contact_person || null,
          phone: phone || null
        }
      ])
      .select('id, name, email, location, contact_person, phone, created_at')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({
          status: 'error',
          message: 'A college with this email already exists'
        });
      }
      return res.status(500).json({
        status: 'error',
        message: insertError.message || 'Database error while creating college account'
      });
    }

    // Issue JWT token
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const token = jwt.sign(
      { id: newCollege.id, role: 'college' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      status: 'success',
      message: 'College registered successfully',
      token,
      college: newCollege
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/college/login
 * @desc    Authenticate college & generate JWT
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Query college by email
    const { data: college, error: fetchError } = await supabase
      .from('colleges')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (fetchError || !college) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Compare passwords against password_hash column (with fallback to password)
    const storedHash = college.password_hash || college.password;
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

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const token = jwt.sign(
      { id: college.id, role: 'college' },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const { password: _, password_hash: __, ...collegeData } = college;

    return res.status(200).json({
      status: 'success',
      message: 'Login successful',
      token,
      college: collegeData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ============================================================================
 * PROTECTED ROUTES (authMiddleware applied explicitly)
 * ============================================================================
 */

/**
 * @route   GET /api/college/profile
 * @desc    Get college profile
 * @access  Private (College only)
 */
router.get('/profile', authMiddleware, requireRole('college'), async (req, res, next) => {
  try {
    const { data: college, error } = await supabase
      .from('colleges')
      .select('id, name, email, location, contact_person, phone, created_at')
      .eq('id', req.college.id)
      .maybeSingle();

    if (error || !college) {
      return res.status(404).json({
        status: 'error',
        message: 'College profile not found'
      });
    }

    return res.status(200).json({
      status: 'success',
      college
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/college/profile
 * @desc    Update college profile
 * @access  Private (College only)
 */
router.put('/profile', authMiddleware, requireRole('college'), async (req, res, next) => {
  try {
    const { name, location, contact_person, phone } = req.body;
    const updatePayload = {};

    if (name !== undefined) updatePayload.name = name.trim();
    if (location !== undefined) updatePayload.location = location;
    if (contact_person !== undefined) updatePayload.contact_person = contact_person;
    if (phone !== undefined) updatePayload.phone = phone;

    const { data: updatedCollege, error } = await supabase
      .from('colleges')
      .update(updatePayload)
      .eq('id', req.college.id)
      .select('id, name, email, location, contact_person, phone, created_at')
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
      college: updatedCollege
    });
  } catch (err) {
    next(err);
  }
});

// Protected sub-module routes (students, drives, dashboard)
router.use('/students', collegeStudents);
router.use('/drives', collegeDrives);
router.use('/dashboard', collegeDashboard);

module.exports = router;
