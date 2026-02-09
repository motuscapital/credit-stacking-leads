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

// Simple delay function for rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Cache for custom field IDs
let leadSourceFieldId = null;
let watchTimeFieldId = null;
let priorityFieldId = null;
let webinarDateFieldId = null;

async function ensureCustomFieldsExist() {
  console.log('Checking custom fields...');

  const response = await closeApi.get('/custom_field/lead/');
  const fields = response.data.data;

  // Check for lead_source field
  const sourceField = fields.find((f) => f.name === 'lead_source');
  if (sourceField) {
    leadSourceFieldId = sourceField.id;
    console.log('  Found lead_source field');
  } else {
    // Create it
    const newField = await closeApi.post('/custom_field/lead/', {
      name: 'lead_source',
      type: 'choices',
      choices: [
        'qualified-no-book',
        'disqualified',
        'credit-report-gpt',
        'credit-report-typeform',
        'applied-no-booking',
        'webinar-watched-full',
        'webinar-watched-partial',
        'webinar-no-show',
        'typeform-disqualified',
        'booked',
      ],
    });
    leadSourceFieldId = newField.data.id;
    console.log('  Created lead_source field');
  }

  // Check for watch_time field
  const watchField = fields.find((f) => f.name === 'webinar_watch_time');
  if (watchField) {
    watchTimeFieldId = watchField.id;
    console.log('  Found webinar_watch_time field');
  } else {
    const newField = await closeApi.post('/custom_field/lead/', {
      name: 'webinar_watch_time',
      type: 'number',
    });
    watchTimeFieldId = newField.data.id;
    console.log('  Created webinar_watch_time field');
  }

  // Check for priority field (for setter call sorting)
  const priorityField = fields.find((f) => f.name === 'priority');
  if (priorityField) {
    priorityFieldId = priorityField.id;
    console.log('  Found priority field');
  } else {
    const newField = await closeApi.post('/custom_field/lead/', {
      name: 'priority',
      type: 'number',
    });
    priorityFieldId = newField.data.id;
    console.log('  Created priority field');
  }

  // Check for webinar_date field
  const webinarDateField = fields.find((f) => f.name === 'webinar_date');
  if (webinarDateField) {
    webinarDateFieldId = webinarDateField.id;
    console.log('  Found webinar_date field');
  } else {
    const newField = await closeApi.post('/custom_field/lead/', {
      name: 'webinar_date',
      type: 'date',
    });
    webinarDateFieldId = newField.data.id;
    console.log('  Created webinar_date field');
  }

  return { leadSourceFieldId, watchTimeFieldId, priorityFieldId, webinarDateFieldId };
}

async function findLeadByEmail(email) {
  const response = await closeApi.get('/lead/', {
    params: {
      query: `email:${email}`,
      _limit: 1,
    },
  });

  return response.data.data[0] || null;
}

// Create a note on a lead with context for setters
async function createLeadNote(leadId, { source, watchTime, priority, webinarDate, typeformData }) {
  const sourceDescriptions = {
    'booked': '✅ BOOKED - Already scheduled a call',
    'applied-no-booking': '🔥 HOT - Filled Typeform application & QUALIFIED but didn\'t book',
    'credit-report-gpt': '💳 Submitted credit report via GPT',
    'credit-report-typeform': '💳 Submitted credit report via Typeform',
    'webinar-watched-full': '🎯 Watched FULL webinar (75+ min)',
    'webinar-watched-partial': '👀 Watched partial webinar (30-74 min)',
    'webinar-no-show': '❌ Registered but no-show',
    'typeform-disqualified': '❌ DISQUALIFIED - Credit <600 or low income/assets'
  };

  const listCategory = priority >= 8 ? '🔥 HOT' : (priority >= 3 ? '🟡 WARM' : '🧊 COLD');

  // Build Typeform info section if data exists
  let typeformInfo = '';
  if (typeformData) {
    typeformInfo = `
📝 TYPEFORM SUBMISSION:
━━━━━━━━━━━━━━━━━━
👤 Name: ${typeformData.name || 'N/A'}
📞 Phone: ${typeformData.phone || 'N/A'}
💳 Credit Score: ${typeformData.creditScore || 'N/A'}
💰 Income: ${typeformData.income || 'N/A'}
🏢 Business Revenue: ${typeformData.bizRevenue || 'N/A'}
💵 Liquid Assets: ${typeformData.assets || 'N/A'}

`;
  }

  // Determine why they're in this list
  let whyInList = '';
  if (listCategory === '🔥 HOT') {
    whyInList = source === 'applied-no-booking'
      ? '✅ Filled out full application & QUALIFIED\n✅ Met all credit/income requirements\n❌ Did NOT book yet - HIGH PRIORITY CALL'
      : source.includes('credit-report')
      ? '✅ Shared their credit report (high intent)\n✅ Watched significant portion of webinar\n🎯 Ready to discuss funding options'
      : '✅ Watched FULL webinar (75+ min)\n✅ Heard complete pitch\n🎯 Engaged and interested - call ASAP';
  } else if (listCategory === '🟡 WARM') {
    whyInList = '⚠️  Watched 30-74 minutes (partial webinar)\n⚠️  Didn\'t hear full pitch or take action\n📞 Worth calling but lower priority than HOT leads';
  } else {
    whyInList = '❄️  Lead is 7+ days old (getting cold)\n⏰ Follow up if no other leads available\n💡 May need email nurture first';
  }

  const noteText = `
📋 SETTER CALL INFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 LIST: ${listCategory}
📅 WEBINAR DATE: ${webinarDate || 'Unknown'}
⏱️  WATCH TIME: ${watchTime || 0} minutes
📝 STATUS: ${sourceDescriptions[source] || source}

${typeformInfo}
🎯 WHY IN ${listCategory} LIST:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${whyInList}

🔔 ACTION REQUIRED:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${listCategory === '🔥 HOT' ? '🚨 CALL TODAY - High priority qualified lead!' : listCategory === '🟡 WARM' ? '📞 Call if time permits after HOT list is done' : '❄️  Low priority - call only if no HOT/WARM leads available'}
  `.trim();

  try {
    await closeApi.post(`/activity/note/`, {
      lead_id: leadId,
      note: noteText
    });
  } catch (error) {
    console.log(`Note creation failed for lead ${leadId}:`, error.message);
  }
}

async function createLead({ email, name, source, watchTime, priority, webinarDate, typeformData }) {
  // Ensure fields exist
  if (!leadSourceFieldId) {
    await ensureCustomFieldsExist();
  }

  const leadData = {
    name: name || email.split('@')[0],
    contacts: [
      {
        name: name || '',
        emails: [{ email, type: 'office' }],
      },
    ],
  };

  // Add custom fields
  if (source && leadSourceFieldId) {
    leadData[`custom.${leadSourceFieldId}`] = source;
  }
  if (watchTime !== undefined && watchTimeFieldId) {
    leadData[`custom.${watchTimeFieldId}`] = watchTime;
  }
  if (priority !== undefined && priorityFieldId) {
    leadData[`custom.${priorityFieldId}`] = priority;
  }
  if (webinarDate && webinarDateFieldId) {
    leadData[`custom.${webinarDateFieldId}`] = webinarDate;
  }

  const response = await closeApi.post('/lead/', leadData);

  // Add setter note to new lead
  await createLeadNote(response.data.id, { source, watchTime, priority, webinarDate, typeformData });

  return response.data;
}

async function updateLead(leadId, { source, watchTime, priority, webinarDate }) {
  if (!leadSourceFieldId) {
    await ensureCustomFieldsExist();
  }

  const updateData = {};

  if (source && leadSourceFieldId) {
    updateData[`custom.${leadSourceFieldId}`] = source;
  }
  if (watchTime !== undefined && watchTimeFieldId) {
    updateData[`custom.${watchTimeFieldId}`] = watchTime;
  }
  if (priority !== undefined && priorityFieldId) {
    updateData[`custom.${priorityFieldId}`] = priority;
  }
  if (webinarDate && webinarDateFieldId) {
    updateData[`custom.${webinarDateFieldId}`] = webinarDate;
  }

  if (Object.keys(updateData).length > 0) {
    await closeApi.put(`/lead/${leadId}`, updateData);
  }
}

async function createOrUpdateLead({ email, name, source, watchTime, priority, webinarDate, typeformData }) {
  // Rate limit: wait 200ms between API calls
  await delay(200);

  const existing = await findLeadByEmail(email);

  if (existing) {
    // Skip updating existing leads - don't overwrite higher-priority sources
    console.log(`Skipped (exists): ${email}`);
    return { ...existing, skipped: true };
  }

  const newLead = await createLead({ email, name, source, watchTime, priority, webinarDate, typeformData });
  console.log(`Created lead: ${email} → ${source} (priority: ${priority})`);
  return { ...newLead, created: true };
}

// Get lead statuses for reference
async function getLeadStatuses() {
  const response = await closeApi.get('/status/lead/');
  return response.data.data;
}

// Create or update the 3 Setter Call List smart views
async function createSetterSmartView(webinarDate) {
  if (!leadSourceFieldId) {
    await ensureCustomFieldsExist();
  }

  // Get existing views to check what already exists
  const existingViews = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

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

  const createdViews = [];

  for (const view of views) {
    const existingView = existingViews.data.data.find(v => v.name === view.name);

    if (existingView) {
      try {
        // Try to update existing view
        await closeApi.put(`/saved_search/${existingView.id}`, {
          query: view.query,
          shared: true,
        });
        console.log(`  ✅ Updated: ${view.name}`);
        createdViews.push(existingView.id);
      } catch (updateError) {
        // If update fails (403 permission error), delete and recreate
        console.log(`  ⚠️  Update failed, recreating: ${view.name}`);
        await closeApi.delete(`/saved_search/${existingView.id}`);
        await delay(300);
        const newView = await closeApi.post('/saved_search/', {
          name: view.name,
          query: view.query,
          _type: 'lead',
          shared: true,
        });
        console.log(`  ✅ Recreated: ${view.name}`);
        createdViews.push(newView.data.id);
      }
    } else {
      // Create new view
      const newView = await closeApi.post('/saved_search/', {
        name: view.name,
        query: view.query,
        _type: 'lead',
        shared: true,
      });
      console.log(`  ✅ Created: ${view.name}`);
      createdViews.push(newView.data.id);
    }

    // Small delay to avoid rate limiting
    await delay(300);
  }

  return createdViews;
}

// Helper: Get date N days ago in YYYY-MM-DD format
function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

// Get custom field IDs (for external use)
function getCustomFieldIds() {
  return { leadSourceFieldId, watchTimeFieldId, priorityFieldId, webinarDateFieldId };
}

// Add notes to all existing leads (retroactive)
async function addNotesToExistingLeads() {
  console.log('Adding notes to all existing leads...');

  if (!leadSourceFieldId) {
    await ensureCustomFieldsExist();
  }

  // Fetch all leads with lead_source field
  let hasMore = true;
  let skip = 0;
  const limit = 100;
  let processedCount = 0;

  while (hasMore) {
    const response = await closeApi.get('/lead/', {
      params: {
        _skip: skip,
        _limit: limit,
        query: `custom.${leadSourceFieldId}:*`, // All leads with a lead_source
      }
    });

    const leads = response.data.data;

    if (leads.length === 0) {
      hasMore = false;
      break;
    }

    for (const lead of leads) {
      try {
        const source = lead[`custom.${leadSourceFieldId}`];
        const watchTime = lead[`custom.${watchTimeFieldId}`];
        const priority = lead[`custom.${priorityFieldId}`];
        const webinarDate = lead[`custom.${webinarDateFieldId}`];

        // Create note for this lead
        await createLeadNote(lead.id, {
          source,
          watchTime,
          priority,
          webinarDate,
          typeformData: null, // We don't have historical Typeform data
        });

        processedCount++;
        console.log(`  ✅ Added note to: ${lead.display_name || lead.contacts?.[0]?.emails?.[0]?.email}`);

        // Rate limit
        await delay(300);
      } catch (error) {
        console.log(`  ❌ Failed for lead ${lead.id}:`, error.message);
      }
    }

    skip += limit;
    hasMore = response.data.has_more;
  }

  console.log(`\n✅ Completed! Added notes to ${processedCount} leads`);
  return { success: true, count: processedCount };
}

module.exports = {
  closeApi,
  ensureCustomFieldsExist,
  findLeadByEmail,
  createLead,
  updateLead,
  createOrUpdateLead,
  getLeadStatuses,
  createSetterSmartView,
  getCustomFieldIds,
  addNotesToExistingLeads,
};
