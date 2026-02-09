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

async function checkWebinarDates() {
  console.log('🔍 Checking webinar_date field...\n');

  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const webinarDateFieldId = fields.find((f) => f.name === 'webinar_date')?.id;

  console.log(`webinar_date field ID: ${webinarDateFieldId}\n`);

  // Get leads with lead_source and check their webinar_date
  const leadsResponse = await closeApi.get('/lead/', {
    params: {
      _limit: 20,
      query: `custom.${leadSourceFieldId}:*`
    }
  });

  console.log('📌 Sample leads with webinar_date:\n');

  let withDate = 0;
  let withoutDate = 0;

  for (const lead of leadsResponse.data.data) {
    const email = lead.contacts?.[0]?.emails?.[0]?.email || 'No email';
    const source = lead[`custom.${leadSourceFieldId}`];
    const webinarDate = lead[`custom.${webinarDateFieldId}`];
    const created = lead.date_created?.split('T')[0];

    if (webinarDate) {
      withDate++;
      console.log(`✅ ${email}`);
      console.log(`   source: ${source}, webinar_date: ${webinarDate}, created: ${created}\n`);
    } else {
      withoutDate++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  Leads WITH webinar_date: ${withDate}`);
  console.log(`  Leads WITHOUT webinar_date: ${withoutDate}`);

  if (withoutDate > 0) {
    console.log(`\n⚠️  Problem: ${withoutDate} leads are missing webinar_date!`);
    console.log(`   This means the webinar processing didn't complete successfully.`);
  }
}

checkWebinarDates().catch(console.error);
