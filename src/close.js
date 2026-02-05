const axios = require('axios');

const closeApi = axios.create({
  baseURL: 'https://api.close.com/api/v1',
  auth: {
    username: process.env.CLOSE_API_KEY,
    password: '',
  },
  headers: {
    'Content-Type': 'application/json',
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
        'credit-report-gpt',
        'credit-report-typeform',
        'applied-no-booking',
        'webinar-watched-full',
        'webinar-watched-partial',
        'webinar-no-show',
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

// Create or update the Setter Call List smart view
async function createSetterSmartView(webinarDate) {
  if (!leadSourceFieldId) {
    await ensureCustomFieldsExist();
  }

  const viewName = 'Setter Call List';

  // Close CRM search query:
  // - lead_source is one of the setter-eligible sources
  // - NOT booked
  // - watched 30+ mins OR submitted credit report/application
  // - sorted by priority descending
  const query = `custom.${leadSourceFieldId}:("webinar-watched-full" OR "webinar-watched-partial" OR "credit-report-gpt" OR "credit-report-typeform" OR "applied-no-booking") NOT custom.${leadSourceFieldId}:"booked" (custom.${watchTimeFieldId} >= 30 OR custom.${leadSourceFieldId}:("credit-report-gpt" OR "credit-report-typeform" OR "applied-no-booking")) sort:custom.${priorityFieldId} sort_direction:desc`;

  // Check if smart view already exists
  const existingViews = await closeApi.get('/saved_search/', {
    params: { _type: 'lead' }
  });

  const existingView = existingViews.data.data.find(v => v.name === viewName);

  if (existingView) {
    // Update existing view
    await closeApi.put(`/saved_search/${existingView.id}`, {
      query,
    });
    console.log(`Updated Smart View: ${viewName}`);
    return existingView.id;
  } else {
    // Create new view
    const newView = await closeApi.post('/saved_search/', {
      name: viewName,
      query,
      _type: 'lead',
    });
    console.log(`Created Smart View: ${viewName}`);
    return newView.data.id;
  }
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
