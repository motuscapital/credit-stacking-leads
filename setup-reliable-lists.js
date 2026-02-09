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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setupReliableLists() {
  console.log('🔧 SETTING UP RELIABLE CALL LISTS\n');
  console.log('='.repeat(50) + '\n');

  // Step 1: Get custom field IDs
  console.log('1️⃣  Getting custom fields...');
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;

  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const webinarDateFieldId = fields.find((f) => f.name === 'webinar_date')?.id;

  if (!leadSourceFieldId || !watchTimeFieldId || !webinarDateFieldId) {
    console.error('❌ ERROR: Missing custom fields in Close CRM!');
    process.exit(1);
  }

  console.log('   ✅ lead_source');
  console.log('   ✅ webinar_watch_time');
  console.log('   ✅ webinar_date\n');

  // Step 2: Get today's date from most recent leads
  console.log('2️⃣  Finding most recent webinar date...');
  const recentLeadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: `custom.${leadSourceFieldId}:* sort:-date_created`
    }
  });

  const mostRecentLead = recentLeadsResponse.data.data[0];
  const webinarDate = mostRecentLead?.[`custom.${webinarDateFieldId}`];

  if (!webinarDate) {
    console.error('❌ ERROR: No webinar date found on recent leads!');
    console.error('   Run the webinar processing first.');
    process.exit(1);
  }

  console.log(`   ✅ Most recent webinar: ${webinarDate}\n`);

  // Step 3: Delete ALL existing smart views with HOT/WARM/COLD
  console.log('3️⃣  Cleaning up old smart views...');
  const existingViewsResponse = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  let deletedCount = 0;
  for (const view of existingViewsResponse.data.data) {
    if (view.name.includes('HOT') || view.name.includes('WARM') || view.name.includes('COLD') ||
        view.name.includes('Hot') || view.name.includes('Warm') || view.name.includes('Cold')) {
      try {
        await closeApi.delete(`/saved_search/${view.id}`);
        console.log(`   🗑️  Deleted: ${view.name}`);
        deletedCount++;
        await delay(300);
      } catch (err) {
        console.log(`   ⚠️  Could not delete: ${view.name} (you may need to delete manually)`);
      }
    }
  }
  console.log(`   ✅ Cleaned up ${deletedCount} old views\n`);

  // Step 4: Create NEW reliable smart views
  console.log('4️⃣  Creating new smart views...\n');

  const views = [
    {
      name: '🔥 HOT - Call Today',
      description: 'Full webinar watchers (75+ min) from most recent webinar',
      query: `custom.${leadSourceFieldId}:"webinar-watched-full" custom.${webinarDateFieldId}:"${webinarDate}" NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🟡 WARM - Call If Time',
      description: 'Partial watchers (30-74 min) from most recent webinar',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${webinarDate}" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🧊 COLD - Low Priority',
      description: 'Short watchers (under 30 min) from most recent webinar',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${webinarDate}" custom.${watchTimeFieldId} < 30 custom.${watchTimeFieldId} > 0 NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
    },
  ];

  const createdViews = [];

  for (const view of views) {
    try {
      const response = await closeApi.post('/saved_search/', {
        name: view.name,
        query: view.query,
        _type: 'lead',
        shared: true,
      });
      console.log(`   ✅ ${view.name}`);
      console.log(`      ${view.description}`);
      createdViews.push({ ...view, id: response.data.id });
      await delay(300);
    } catch (err) {
      console.log(`   ❌ Failed to create ${view.name}: ${err.message}`);
    }
  }

  console.log('');

  // Step 5: Test and show results
  console.log('5️⃣  Testing lists...\n');

  for (const view of createdViews) {
    const response = await closeApi.get('/lead/', {
      params: {
        _limit: 5,
        query: view.query
      }
    });

    const count = response.data.has_more ? '5+' : response.data.data.length;
    console.log(`   ${view.name}: ${count} leads`);

    if (response.data.data.length > 0) {
      const topLead = response.data.data[0];
      const email = topLead.contacts?.[0]?.emails?.[0]?.email || 'No email';
      const watchTime = topLead[`custom.${watchTimeFieldId}`] || 0;
      console.log(`      Top: ${email} (${watchTime} min)`);
    } else {
      console.log(`      (No leads in this category)`);
    }
    console.log('');
  }

  console.log('='.repeat(50));
  console.log('✅ SETUP COMPLETE!\n');
  console.log('📋 What to do now:');
  console.log('   1. Open Close CRM → Saved Searches');
  console.log('   2. You should see 3 lists: 🔥 HOT, 🟡 WARM, 🧊 COLD');
  console.log('   3. Start calling from HOT list (sorted by watch time)');
  console.log('');
  console.log('🔄 After next webinar:');
  console.log('   Run: node setup-reliable-lists.js');
  console.log('   This will auto-detect the new webinar date and update lists.');
  console.log('');
}

setupReliableLists().catch((err) => {
  console.error('\n❌ ERROR:', err.message);
  process.exit(1);
});
