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

function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

async function fixDateFilters() {
  console.log('🔧 Fixing date filters on smart views...\n');

  // Get custom field IDs
  const fieldsResponse = await closeApi.get('/custom_field/lead/');
  const fields = fieldsResponse.data.data;
  const leadSourceFieldId = fields.find((f) => f.name === 'lead_source')?.id;
  const watchTimeFieldId = fields.find((f) => f.name === 'webinar_watch_time')?.id;
  const priorityFieldId = fields.find((f) => f.name === 'priority')?.id;

  // Get existing views
  const viewsResponse = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  // Find the HOT, WARM, COLD views
  const hotView = viewsResponse.data.data.find(v => v.name === '🔥 HOT - Call Today');
  const warmView = viewsResponse.data.data.find(v => v.name === '🟡 WARM - Call If Time');
  const coldView = viewsResponse.data.data.find(v => v.name === '🧊 COLD - Low Priority');

  // Update HOT - Show last 7 days instead of 3
  if (hotView) {
    const newHotQuery = `(custom.${leadSourceFieldId}:"applied-no-booking" OR custom.${leadSourceFieldId}:"webinar-watched-full" OR custom.${leadSourceFieldId}:"credit-report-gpt" OR custom.${leadSourceFieldId}:"credit-report-typeform") NOT custom.${leadSourceFieldId}:"webinar-watched-partial" NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(7)}" sort:-custom.${priorityFieldId}`;

    try {
      await closeApi.put(`/saved_search/${hotView.id}`, {
        query: newHotQuery,
        shared: true,
      });
      console.log('✅ Updated HOT list - now shows last 7 days');
      console.log(`   Old: date_created >= "${getDateDaysAgo(3)}"`);
      console.log(`   New: date_created >= "${getDateDaysAgo(7)}"\n`);
    } catch (err) {
      console.log('❌ Failed to update HOT list:', err.message);
    }
  }

  // Update WARM - Show last 14 days instead of 7
  if (warmView) {
    const newWarmQuery = `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(14)}" sort:-custom.${watchTimeFieldId}`;

    try {
      await closeApi.put(`/saved_search/${warmView.id}`, {
        query: newWarmQuery,
        shared: true,
      });
      console.log('✅ Updated WARM list - now shows last 14 days');
      console.log(`   Old: date_created >= "${getDateDaysAgo(7)}"`);
      console.log(`   New: date_created >= "${getDateDaysAgo(14)}"\n`);
    } catch (err) {
      console.log('❌ Failed to update WARM list:', err.message);
    }
  }

  // Update COLD - Show 7-30 days old
  if (coldView) {
    const newColdQuery = `(custom.${watchTimeFieldId} >= 30 OR custom.${leadSourceFieldId}:"applied-no-booking") NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(30)}" date_created < "${getDateDaysAgo(7)}" sort:-custom.${priorityFieldId}`;

    try {
      await closeApi.put(`/saved_search/${coldView.id}`, {
        query: newColdQuery,
        shared: true,
      });
      console.log('✅ Updated COLD list - now shows 7-30 days old');
      console.log(`   Old: date_created < "${getDateDaysAgo(7)}"`);
      console.log(`   New: date_created >= "${getDateDaysAgo(30)}" date_created < "${getDateDaysAgo(7)}"\n`);
    } catch (err) {
      console.log('❌ Failed to update COLD list:', err.message);
    }
  }

  console.log('✅ Done! Refresh Close CRM to see updated lists.');
}

fixDateFilters().catch(console.error);
