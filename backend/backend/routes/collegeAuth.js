const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabaseClient');
const authMiddleware = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

/**
 * @route   POST /api/college/signup
 * @desc    Register a new college account (Public)
 * @access  Public
 */
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, location, contact_person, phone } = req.body;

    // Validate required fields
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

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new college record into Supabase using password_hash column
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

    // Generate JWT containing college id and role: "college"
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const token = jwt.sign(
      {
        id: newCollege.id,
        role: 'college'
      },
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
 * @desc    Authenticate college & generate JWT (Public)
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
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

    if (fetchError) {
      return res.status(500).json({
        status: 'error',
        message: fetchError.message || 'Error querying college account'
      });
    }

    if (!college) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Compare hashed password against password_hash column (with fallback to password)
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

    // Generate JWT containing college id and role: "college"
    const jwtSecret = process.env.JWT_SECRET || 'default_jwt_secret';
    const token = jwt.sign(
      {
        id: college.id,
        role: 'college'
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Omit sensitive hash fields from returned object
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
 * @route   GET /api/college/profile
 * @desc    Get logged in college profile (Protected)
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
 * @desc    Update college profile (Protected)
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

module.exports = router;
