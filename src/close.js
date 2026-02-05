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

  return { leadSourceFieldId, watchTimeFieldId };
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

async function createLead({ email, name, source, watchTime }) {
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

  const response = await closeApi.post('/lead/', leadData);
  return response.data;
}

async function updateLead(leadId, { source, watchTime }) {
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

  if (Object.keys(updateData).length > 0) {
    await closeApi.put(`/lead/${leadId}`, updateData);
  }
}

async function createOrUpdateLead({ email, name, source, watchTime }) {
  // Rate limit: wait 200ms between API calls
  await delay(200);

  const existing = await findLeadByEmail(email);

  if (existing) {
    // Skip updating existing leads - don't overwrite higher-priority sources
    console.log(`Skipped (exists): ${email}`);
    return { ...existing, skipped: true };
  }

  const newLead = await createLead({ email, name, source, watchTime });
  console.log(`Created lead: ${email} → ${source}`);
  return { ...newLead, created: true };
}

// Get lead statuses for reference
async function getLeadStatuses() {
  const response = await closeApi.get('/status/lead/');
  return response.data.data;
}

module.exports = {
  closeApi,
  ensureCustomFieldsExist,
  findLeadByEmail,
  createLead,
  updateLead,
  createOrUpdateLead,
  getLeadStatuses,
};
