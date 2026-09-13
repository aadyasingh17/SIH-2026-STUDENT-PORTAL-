    require('dotenv').config();
    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const tables = [
      'colleges', 'students', 'drives', 'drive_applications',
      'student_education', 'student_skills', 'resumes', 'certifications',
      'projects', 'internship_applications', 'job_applications',
      'saved_opportunities', 'notifications', 'placement_stats'
    ];

    async function checkAllTables() {
      console.log('Supabase connection test shuru...\n');
      for (const table of tables) {
        const { error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });

        if (error) {
          console.log(`❌ ${table.padEnd(25)} — ERROR: ${error.message}`);
        } else {
          console.log(`✅ ${table.padEnd(25)} — OK (${count} rows)`);
        }
      }
      console.log('\nDone.');
    }

    checkAllTables();
