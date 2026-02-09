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

async function diagnose() {
  console.log('🔍 DIAGNOSING CLOSE CRM...\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;

  console.log('📊 Custom Fields:');
  console.log(`  lead_source: ${leadSourceFieldId}`);
  console.log(`  webinar_watch_time: ${watchTimeFieldId}`);
  console.log(`  priority: ${priorityFieldId}\n`);

  // Get all saved searches
  const viewsResponse = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  console.log('📋 ALL SMART VIEWS:');
  for (const view of viewsResponse.data.data) {
    if (view.name.includes('HOT') || view.name.includes('WARM') || view.name.includes('COLD')) {
      console.log(`\n  ${view.name}`);
      console.log(`  ID: ${view.id}`);
      console.log(`  Query: ${view.query}`);
      console.log(`  Shared: ${view.shared}`);
    }
  }

  // Get sample leads to see what lead_source values exist
  console.log('\n\n📌 SAMPLE LEADS (first 10):');
  const leadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 10,
      query: `custom.${leadSourceFieldId}:*`
    }
  });

  for (const lead of leadsResponse.data.data) {
    const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
    const source = lead[`custom.${leadSourceFieldId}`];
    const watchTime = lead[`custom.${watchTimeFieldId}`] || 0;
    const priority = lead[`custom.${priorityFieldId}`] || 0;

    console.log(`\n  ${email}`);
    console.log(`    lead_source: ${source}`);
    console.log(`    watch_time: ${watchTime} min`);
    console.log(`    priority: ${priority}`);
  }

  // Check what the HOT list query should return
  console.log('\n\n🔥 TESTING HOT LIST QUERY:');
  const hotQuery = `(custom.${leadSourceFieldId}:"applied-no-booking" OR custom.${leadSourceFieldId}:"webinar-watched-full" OR custom.${leadSourceFieldId}:"credit-report-gpt" OR custom.${leadSourceFieldId}:"credit-report-typeform") NOT custom.${leadSourceFieldId}:"webinar-watched-partial" NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified"`;

  console.log(`Query: ${hotQuery}\n`);

  const hotLeadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 5,
      query: hotQuery
    }
  });

  console.log(`Found ${hotLeadsResponse.data.data.length} HOT leads:`);
  for (const lead of hotLeadsResponse.data.data) {
    const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
    const source = lead[`custom.${leadSourceFieldId}`];
    console.log(`  - ${email} (${source})`);
  }

  // Check WARM list
  console.log('\n\n🟡 TESTING WARM LIST QUERY:');
  const warmQuery = `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified"`;

  console.log(`Query: ${warmQuery}\n`);

  const warmLeadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 5,
      query: warmQuery
    }
  });

  console.log(`Found ${warmLeadsResponse.data.data.length} WARM leads:`);
  for (const lead of warmLeadsResponse.data.data) {
    const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
    const source = lead[`custom.${leadSourceFieldId}`];
    const watchTime = lead[`custom.${watchTimeFieldId}`] || 0;
    console.log(`  - ${email} (${source}, ${watchTime} min)`);
  }
}

diagnose().catch(console.error);
