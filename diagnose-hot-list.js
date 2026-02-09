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

async function diagnoseHotList() {
  console.log('🔍 DIAGNOSING HOT LIST\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const webinarDateFieldId = fields.find((f) => f.name === 'webinar_date')?.id;

  // Get the HOT list
  const viewsResponse = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  const hotView = viewsResponse.data.data.find(v => v.name.includes('🔥 HOT'));

  if (!hotView) {
    console.log('❌ No HOT list found!');
    return;
  }

  console.log(`📋 HOT List Query:`);
  console.log(`   ${hotView.query}\n`);

  // Get leads from the HOT list
  const hotLeadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 10,
      query: hotView.query
    }
  });

  console.log(`📊 First 10 leads in HOT list:\n`);

  for (const lead of hotLeadsResponse.data.data) {
    const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
    const source = lead[`custom.${leadSourceFieldId}`];
    const watchTime = lead[`custom.${watchTimeFieldId}`] || 0;
    const webinarDate = lead[`custom.${webinarDateFieldId}`];

    console.log(`${email}`);
    console.log(`  lead_source: ${source}`);
    console.log(`  watch_time: ${watchTime} min`);
    console.log(`  webinar_date: ${webinarDate}`);
    console.log('');
  }

  // Check how many leads have each lead_source
  console.log('📊 Lead source breakdown:\n');

  const fullWatchersResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: `custom.${leadSourceFieldId}:"webinar-watched-full" custom.${webinarDateFieldId}:"2026-02-09"`
    }
  });

  const partialWatchersResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 1,
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${webinarDateFieldId}:"2026-02-09"`
    }
  });

  console.log(`  webinar-watched-full: ${fullWatchersResponse.data.has_more ? '1+' : fullWatchersResponse.data.data.length} leads`);
  console.log(`  webinar-watched-partial: ${partialWatchersResponse.data.has_more ? '1+' : partialWatchersResponse.data.data.length} leads`);
}

diagnoseHotList().catch(console.error);
