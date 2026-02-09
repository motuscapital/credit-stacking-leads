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

async function createListsForFeb9() {
  console.log('✨ Creating smart views for Feb 9, 2026 webinar...\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;
  const webinarDateFieldId = fields.find((f) => f.name === 'webinar_date')?.id;

  const webinarDate = '2026-02-09';

  // Define the 3 smart views
  const views = [
    {
      name: '🔥 HOT - Call Today',
      query: `custom.${leadSourceFieldId}:"webinar-watched-full" custom.${webinarDateFieldId}:"${webinarDate}" NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🟡 WARM - Call If Time',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${webinarDate}" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: '🧊 COLD - Low Priority',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"${webinarDate}" custom.${watchTimeFieldId} < 30 custom.${watchTimeFieldId} > 0 NOT custom.${leadSourceFieldId}:"booked" sort:-custom.${watchTimeFieldId}`,
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
      console.log(`❌ Failed: ${view.name} - ${err.message}`);
    }
  }

  console.log('\n🎯 Testing the lists...\n');

  // Test each query
  for (const view of views) {
    const response = await closeApi.get('/lead/', {
      params: {
        _limit: 100,
        query: view.query
      }
    });

    console.log(`${view.name}: ${response.data.data.length} leads`);

    // Show first 3 leads
    response.data.data.slice(0, 3).forEach(lead => {
      const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
      const watchTime = lead[`custom.${watchTimeFieldId}`] || 0;
      console.log(`  - ${email} (${watchTime} min)`);
    });
    console.log('');
  }

  console.log('✅ Done! Check Close CRM now.');
}

createListsForFeb9().catch(console.error);
