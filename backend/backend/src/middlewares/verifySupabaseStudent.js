const supabase = require('../../config/supabaseClient');

const verifySupabaseStudent = async (req, res, next) => {
  console.log('=== verifySupabaseStudent CALLED ===');
  console.log('Headers received:', req.headers.authorization);

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('DEBUG: No valid Bearer header found');
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: No token provided'
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    console.log('DEBUG token:', token ? token.substring(0, 20) + '...' : 'NO TOKEN');

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    console.log('DEBUG userError:', userError);
    console.log('DEBUG userData:', userData);

    if (userError || !userData || !userData.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Invalid or expired Supabase token'
      });
    }

    const email = (userData.user.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(401).json({
        status: 'error',
        message: 'Unauthorized: Token has no email'
      });
    }

    let { data: student, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) {
      return res.status(500).json({
        status: 'error',
        message: fetchError.message || 'Error looking up student record'
      });
    }

    if (!student) {
      // Naya student directly Supabase Auth se aaya hai, kisi college
      // se linked nahi hai abhi — demo ke liye pehle available college
      // se automatically link kar rahe hain
      const { data: fallbackCollege } = await supabase
        .from('colleges')
        .select('id')
        .limit(1)
        .maybeSingle();

      const { data: created, error: insertError } = await supabase
        .from('students')
        .insert([{
          name: userData.user.user_metadata?.name || email.split('@')[0],
          email,
          college_id: fallbackCollege ? fallbackCollege.id : null,
          is_verified: false
        }])
        .select('*')
        .single();

      if (insertError) {
        return res.status(500).json({
          status: 'error',
          message: 'Could not auto-create student record: ' + insertError.message
        });
      }
      student = created;
    }

    req.student = { id: student.id, email: student.email, college_id: student.college_id, role: 'student' };
    req.studentRecord = student;
    next();
  } catch (error) {
    console.log('DEBUG CATCH ERROR:', error);
    next(error);
  }
};

module.exports = verifySupabaseStudent;
