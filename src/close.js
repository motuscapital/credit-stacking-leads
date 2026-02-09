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

async function createLead({ email, name, source, watchTime, priority, webinarDate }) {
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

async function createOrUpdateLead({ email, name, source, watchTime, priority, webinarDate }) {
  // Rate limit: wait 200ms between API calls
  await delay(200);

  const existing = await findLeadByEmail(email);

  if (existing) {
    // Skip updating existing leads - don't overwrite higher-priority sources
    console.log(`Skipped (exists): ${email}`);
    return { ...existing, skipped: true };
  }

  const newLead = await createLead({ email, name, source, watchTime, priority, webinarDate });
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
      name: 'SMART LIST FOR SETTERS - ☎️ Hot Leads (Call Today)',
      query: `(custom.${leadSourceFieldId}:"applied-no-booking" OR custom.${leadSourceFieldId}:"webinar-watched-full" OR custom.${leadSourceFieldId}:"credit-report-gpt" OR custom.${leadSourceFieldId}:"credit-report-typeform") NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(3)}" sort:-custom.${priorityFieldId}`,
    },
    {
      name: 'SMART LIST FOR SETTERS - 🔥 Warm Leads (Call If Time)',
      query: `custom.${leadSourceFieldId}:"webinar-watched-partial" custom.${watchTimeFieldId} >= 30 NOT custom.${leadSourceFieldId}:"booked" NOT custom.${leadSourceFieldId}:"typeform-disqualified" NOT custom.${leadSourceFieldId}:"disqualified" date_created >= "${getDateDaysAgo(7)}" sort:-custom.${watchTimeFieldId}`,
    },
    {
      name: 'SMART LIST FOR SETTERS - 🔵 Long Shots (Low Priority)',
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
};
