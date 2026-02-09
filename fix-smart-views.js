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

function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

async function fixSmartViews() {
  console.log('🔧 Fixing smart views...\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;

  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;

  if (!leadSourceFieldId || !watchTimeFieldId || !priorityFieldId) {
    console.error('❌ Missing custom fields!');
    process.exit(1);
  }

  console.log('✅ Found custom fields');
  console.log(`  lead_source: ${leadSourceFieldId}`);
  console.log(`  webinar_watch_time: ${watchTimeFieldId}`);
  console.log(`  priority: ${priorityFieldId}\n`);

  // Get existing views
  const existingViews = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  // Define the 3 smart views with FIXED queries
  const views = [
    {
      name: '🔥 HOT - Call Today',
      query: `(custom.${leadSourceFieldId}:"applied-no-booking" OR custom.${leadSourceFieldId}:"webinar-watched-full" OR custom.${leadSourceFieldId}:"credit-report-gpt" OR custom.${leadSourceFieldId}:"credit-report-typeform") NOT custom.${leadSourceFieldId}:"webinar-watched-partial" NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(3)}" sort:-custom.${priorityFieldId}`,
    },
    {
      name: '🟡 WARM - Call If Time',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(7)}" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🧊 COLD - Low Priority',
      query: `(custom.${watchTimeFieldId} >= 30 OR custom.${leadSourceFieldId}:"applied-no-booking") NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created < "${getDateDaysAgo(7)}" sort:-custom.${priorityFieldId}`,
    },
  ];

  for (const view of views) {
    const existingView = existingViews.data.data.find(v => v.name === view.name);

    if (existingView) {
      try {
        // Delete the old one
        console.log(`🗑️  Deleting old: ${view.name}`);
        await closeApi.delete(`/saved_search/${existingView.id}`);
        await delay(500);
      } catch (deleteError) {
        console.log(`  ⚠️  Delete failed (might not have permission): ${deleteError.message}`);
      }
    }

    // Create fresh
    try {
      console.log(`✨ Creating: ${view.name}`);
      await closeApi.post('/saved_search/', {
        name: view.name,
        query: view.query,
        _type: 'lead',
        shared: true,
      });
      console.log(`  ✅ Created: ${view.name}\n`);
    } catch (createError) {
      console.log(`  ❌ Failed: ${createError.message}\n`);
    }

    await delay(500);
  }

  console.log('✅ Done! Smart views updated with fixed queries.\n');
  console.log('📋 KEY FIX: HOT list now EXCLUDES "webinar-watched-partial" leads!\n');
}

fixSmartViews().catch(console.error);
