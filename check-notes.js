require('dotenv').config();
const axios = require('axios');

const closeApi = axios.create({
  baseURL: 'https://api.close.com/api/v1',
  auth: {
    username: process.env.CLOSE_API_KEY,
    password: '',
  },
  headers: {
    'Content-Type': 'application/json',
    'Referer': 'https://app.close.com',
  },
});

async function checkNotes() {
  console.log('🔍 Checking notes on HOT leads...\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;

  // Get a HOT lead
  const hotLeadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: `custom.${leadSourceFieldId}:"webinar-watched-full"`
    }
  });

  if (hotLeadsResponse.data.data.length === 0) {
    console.log('No HOT leads found!');
    return;
  }

  const lead = hotLeadsResponse.data.data[0];
  const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
  const source = lead[`custom.${leadSourceFieldId}`];
  const watchTime = lead[`custom.${watchTimeFieldId}`] || 0;
  const priority = lead[`custom.${priorityFieldId}`] || 0;

  console.log(`📋 Sample HOT Lead: ${email}`);
  console.log(`   lead_source: ${source}`);
  console.log(`   watch_time: ${watchTime} min`);
  console.log(`   priority: ${priority}\n`);

  // Get notes for this lead
  const notesResponse = await closeApi.get('/activity/note/', {
    params: {
      lead_id: lead.id,
      _limit: 5
    }
  });

  if (notesResponse.data.data.length > 0) {
    console.log('📝 Most recent note:\n');
    console.log(notesResponse.data.data[0].note);
    console.log('\n');

    // Check what category the note says
    const noteText = notesResponse.data.data[0].note;
    if (noteText.includes('🟡 WARM')) {
      console.log('❌ PROBLEM FOUND: Note says "WARM" but lead is HOT!');
      console.log('   This is why it looks wrong in Close CRM.\n');

      // Explain the issue
      console.log('🔍 ROOT CAUSE:');
      console.log(`   The lead has priority=${priority}`);
      console.log(`   Priority 5 = mapped to WARM in the notes`);
      console.log(`   But priority should be 8+ for HOT leads!\n`);
    } else if (noteText.includes('🔥 HOT')) {
      console.log('✅ Note correctly says HOT');
    }
  } else {
    console.log('No notes found on this lead.');
  }
}

checkNotes().catch(console.error);
