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

async function fixForTodaysWebinarOnly() {
  console.log('🔧 Setting up lists for TODAY\'S WEBINAR ONLY...\n');

  // Today's date
  const today = '2026-02-08';
  console.log(`📅 Webinar Date: ${today}\n`);

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;
  const webinarDateFieldId = fields.find((f) => f.name === 'webinar_date')?.id;

  console.log('✅ Found custom fields\n');

  // Get existing views
  const viewsResponse = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  // Delete ALL old HOT/WARM/COLD views
  console.log('🗑️  Deleting old smart views...');
  for (const view of viewsResponse.data.data) {
    if (view.name.includes('HOT') || view.name.includes('WARM') || view.name.includes('COLD')) {
      try {
        await closeApi.delete(`/saved_search/${view.id}`);
        console.log(`  ✅ Deleted: ${view.name}`);
        await delay(300);
      } catch (err) {
        console.log(`  ⚠️  Could not delete: ${view.name}`);
      }
    }
  }

  console.log('\n✨ Creating NEW smart views for today\'s webinar only...\n');

  // Define the 3 smart views - ONLY for today's webinar
  const views = [
    {
      name: '🔥 HOT - Call Today',
      // HOT: Full webinar watchers from TODAY
      query: `custom.${leadSourceFieldId}:"webinar-watched-full" custom.${webinarDateFieldId}:"${today}" NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🟡 WARM - Call If Time',
      // WARM: Partial watchers (30+ min) from TODAY
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${today}" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🧊 COLD - Low Priority',
      // COLD: Short watchers (under 30 min) from TODAY
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${today}" custom.${watchTimeFieldId} < 30 custom.${watchTimeFieldId} > 0 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" sort:-custom.${watchTimeFieldId}`,
    },
  ];

  for (const view of views) {
    try {
      await closeApi.post('/saved_search/', {
        name: view.name,
        query: view.query,
        _type: 'lead',
        shared: true,
      });
      console.log(`✅ Created: ${view.name}`);
      await delay(300);
    } catch (err) {
      console.log(`❌ Failed to create ${view.name}:`, err.message);
    }
  }

  console.log('\n🎯 Done! All lists now show ONLY today\'s webinar (2026-02-08)\n');

  // Test the queries
  console.log('📊 Testing queries...\n');

  const hotCount = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: views[0].query
    }
  });

  const warmCount = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: views[1].query
    }
  });

  const coldCount = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: views[2].query
    }
  });

  console.log(`🔥 HOT leads found: ${hotCount.data.has_more ? '1+' : hotCount.data.data.length}`);
  console.log(`🟡 WARM leads found: ${warmCount.data.has_more ? '1+' : warmCount.data.data.length}`);
  console.log(`🧊 COLD leads found: ${coldCount.data.has_more ? '1+' : coldCount.data.data.length}`);
}

fixForTodaysWebinarOnly().catch(console.error);
