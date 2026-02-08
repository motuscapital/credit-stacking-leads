require('dotenv').config();
const express = require('express');
const {
  getWebinarParticipants,
  getPastWebinars,
  getWebinarAbsentees,
} = require('./zoom');
const { createOrUpdateLead, ensureCustomFieldsExist, createSetterSmartView } = require('./close');
const {
  scoreWebinarAttendee,
  scoreTypeformApplication,
  scoreCreditReportGPT,
  scoreCreditReportTypeform,
  scoreNoShow,
  scoreBooked,
} = require('./scoring');

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'Credit Stacking Lead Automation',
    endpoints: {
      'POST /webhook/typeform-application': 'Typeform application submissions',
      'POST /webhook/typeform-credit-report': 'Typeform credit report submissions',
      'POST /webhook/gpt-credit-report': 'GPT credit report submissions',
      'POST /webhook/booking': 'Calendar booking notifications',
      'POST /process-webinar/:webinarId': 'Process a specific webinar',
      'POST /process-recent-webinars': 'Process all recent webinars',
      'POST /setup-smart-views': 'Create/update the 3 setter call list smart views',
    },
  });
});

// ============================================
// WEBHOOK: Typeform Application (Main qualification form)
// ============================================
app.post('/webhook/typeform-application', async (req, res) => {
  try {
    const { form_response } = req.body;
    const answers = form_response?.answers || [];

    // Extract fields by field ID (from Typeform structure)
    const getAnswer = (fieldId) => {
      const answer = answers.find(a => a.field?.id === fieldId);
      return answer?.text || answer?.email || answer?.phone_number || answer?.choice?.label || '';
    };

    const firstName = getAnswer('3aDeSiYqOA8G');
    const lastName = getAnswer('OWRZpWQY1Byw');
    const phone = getAnswer('nt58OEKYPr1m');
    const email = getAnswer('SMBBbqRTngKp');
    const creditScore = getAnswer('8ggNhSkGlNZ4');
    const income = getAnswer('X8AtyKppT4Un');
    const bizRevenue = getAnswer('X388ZvxUH5Hw');
    const assets = getAnswer('QfFEKPW4lcuF');

    if (!email) {
      return res.status(400).json({ error: 'No email found in submission' });
    }

    // Qualification logic (matches Typeform branching)
    const isBelow600 = creditScore.toLowerCase().includes('below');
    const isLowIncome = income.includes('$0-5k');
    const isLowAssets = assets.includes('$0-10k');
    const is750Plus = creditScore.includes('750+');

    let qualified = true;
    if (isBelow600) {
      qualified = false; // Below 600 always DQ
    } else if (isLowIncome && isLowAssets && !is750Plus) {
      qualified = false; // Low income + low assets DQ (unless 750+)
    }

    // Map to Close CRM choices
    const source = qualified ? 'applied-no-booking' : 'typeform-disqualified';
    const priority = qualified ? 9 : 0; // Qualified = hot for setters, DQ = never call

    await createOrUpdateLead({
      email,
      name: `${firstName} ${lastName}`.trim(),
      source,
      priority,
    });

    console.log(`Typeform: ${email} → ${source} (credit: ${creditScore}, income: ${income}, assets: ${assets})`);

    res.json({
      success: true,
      email,
      qualified,
      source,
      priority,
      data: { creditScore, income, bizRevenue, assets }
    });
  } catch (error) {
    console.error('Typeform application webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK: Typeform Credit Report
// ============================================
app.post('/webhook/typeform-credit-report', async (req, res) => {
  try {
    const { form_response } = req.body;

    let email = '';
    let name = '';

    for (const answer of form_response?.answers || []) {
      if (answer.type === 'email') {
        email = answer.email;
      }
      if (answer.type === 'text' && answer.field?.ref?.toLowerCase().includes('name')) {
        name = answer.text;
      }
    }

    if (!email) {
      const emailField = form_response?.answers?.find((a) => a.field?.type === 'email');
      email = emailField?.email || '';
    }

    if (!email) {
      return res.status(400).json({ error: 'No email found in submission' });
    }

    const scoring = scoreCreditReportTypeform();
    await createOrUpdateLead({
      email,
      name,
      source: scoring.source,
      priority: scoring.priority,
    });

    res.json({ success: true, email, source: scoring.source, setterEligible: scoring.setterEligible });
  } catch (error) {
    console.error('Typeform credit report webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK: GPT Credit Report Submission
// ============================================
app.post('/webhook/gpt-credit-report', async (req, res) => {
  try {
    const { email, name, phone } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const scoring = scoreCreditReportGPT();
    await createOrUpdateLead({
      email,
      name: name || '',
      source: scoring.source,
      priority: scoring.priority,
    });

    res.json({
      success: true,
      message: `Lead ${email} added with source: ${scoring.source}`,
      setterEligible: scoring.setterEligible,
    });
  } catch (error) {
    console.error('GPT credit report webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// WEBHOOK: Calendar Booking (Calendly, Cal.com, etc.)
// ============================================
app.post('/webhook/booking', async (req, res) => {
  try {
    let email = '';
    let name = '';

    // Calendly format
    if (req.body.payload?.email) {
      email = req.body.payload.email;
      name = req.body.payload.name;
    }
    // Cal.com format
    else if (req.body.payload?.attendees?.[0]?.email) {
      email = req.body.payload.attendees[0].email;
      name = req.body.payload.attendees[0].name;
    }
    // Generic format
    else if (req.body.email) {
      email = req.body.email;
      name = req.body.name;
    }

    if (!email) {
      return res.status(400).json({ error: 'No email found in booking' });
    }

    const scoring = scoreBooked();
    await createOrUpdateLead({
      email,
      name,
      source: scoring.source,
      priority: scoring.priority,
    });

    res.json({ success: true, email, message: 'Lead marked as booked (removed from setter list)' });
  } catch (error) {
    console.error('Booking webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PROCESS: Single Webinar
// ============================================
app.post('/process-webinar/:webinarId', async (req, res) => {
  try {
    const { webinarId } = req.params;
    console.log(`Processing webinar: ${webinarId}`);

    const participants = await getWebinarParticipants(webinarId);
    console.log(`Found ${participants.length} participants`);

    const webinarDate = new Date().toISOString().split('T')[0]; // Today's date

    const results = {
      processed: 0,
      watchedFull: 0,
      watchedPartial: 0,
      setterEligible: 0,
      errors: [],
    };

    for (const participant of participants) {
      try {
        if (!participant.user_email) continue;

        const scored = scoreWebinarAttendee(participant);
        await createOrUpdateLead({
          email: scored.email,
          name: scored.name,
          source: scored.source,
          watchTime: scored.minutesWatched,
          priority: scored.priority,
          webinarDate,
        });

        results.processed++;
        if (scored.source === 'webinar-watched-full') results.watchedFull++;
        if (scored.source === 'webinar-watched-partial') results.watchedPartial++;
        if (scored.setterEligible) results.setterEligible++;
      } catch (err) {
        results.errors.push({ email: participant.user_email, error: err.message });
      }
    }

    // Try to get no-shows
    try {
      const absentees = await getWebinarAbsentees(webinarId);
      for (const absentee of absentees) {
        if (!absentee.email) continue;
        const scored = scoreNoShow(absentee);
        await createOrUpdateLead({
          email: scored.email,
          name: scored.name,
          source: scored.source,
          priority: scored.priority,
          webinarDate,
        });
      }
      results.noShows = absentees.length;
    } catch (err) {
      console.log('Could not process no-shows:', err.message);
    }

    // Create/update the 3 Setter Call List smart views
    try {
      const viewIds = await createSetterSmartView(webinarDate);
      results.smartViewsUpdated = viewIds.length;
      console.log('✅ 3 Setter Call List smart views updated');
    } catch (err) {
      console.error('Could not update smart views:', err.message);
      results.smartViewError = err.message;
    }

    res.json({ success: true, webinarId, ...results });
  } catch (error) {
    console.error('Process webinar error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PROCESS: Recent Webinars (Last 30 days)
// ============================================
app.post('/process-recent-webinars', async (req, res) => {
  try {
    console.log('Fetching recent webinars...');
    const webinars = await getPastWebinars();
    console.log(`Found ${webinars.length} recent webinars`);

    const results = [];
    const webinarDate = new Date().toISOString().split('T')[0];

    for (const webinar of webinars) {
      try {
        console.log(`Processing: ${webinar.topic} (${webinar.id})`);
        const participants = await getWebinarParticipants(webinar.id);

        let processed = 0;
        let watchedFull = 0;
        let setterEligible = 0;

        for (const participant of participants) {
          if (!participant.user_email) continue;

          const scored = scoreWebinarAttendee(participant);
          await createOrUpdateLead({
            email: scored.email,
            name: scored.name,
            source: scored.source,
            watchTime: scored.minutesWatched,
            priority: scored.priority,
            webinarDate,
          });
          processed++;
          if (scored.source === 'webinar-watched-full') watchedFull++;
          if (scored.setterEligible) setterEligible++;
        }

        results.push({
          webinarId: webinar.id,
          topic: webinar.topic,
          participantsProcessed: processed,
          watchedFull,
          setterEligible,
        });
      } catch (err) {
        results.push({
          webinarId: webinar.id,
          topic: webinar.topic,
          error: err.message,
        });
      }
    }

    // Create/update the 3 Setter Call List smart views
    try {
      await createSetterSmartView(webinarDate);
      console.log('✅ 3 Setter Call List smart views updated');
    } catch (err) {
      console.error('Could not update smart views:', err.message);
    }

    res.json({ success: true, webinarsProcessed: results.length, results });
  } catch (error) {
    console.error('Process recent webinars error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SETUP: Create/Update Smart Views Manually
// ============================================
app.post('/setup-smart-views', async (req, res) => {
  try {
    console.log('Creating/updating smart views...');

    await ensureCustomFieldsExist();
    const viewIds = await createSetterSmartView();

    res.json({
      success: true,
      message: '3 setter call list smart views created/updated',
      viewCount: viewIds.length,
      views: [
        'SMART LIST FOR SETTERS - 🔥 Hot Leads (Call Today)',
        'SMART LIST FOR SETTERS - 🟡 Warm Leads (Call If Time)',
        'SMART LIST FOR SETTERS - 🔵 Long Shots (Low Priority)',
      ],
    });
  } catch (error) {
    console.error('Setup smart views error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`\n🚀 Lead automation server running on port ${PORT}`);
  console.log('\nEndpoints:');
  console.log(`  POST /webhook/typeform-application   - Typeform app`);
  console.log(`  POST /webhook/typeform-credit-report - Typeform credit report`);
  console.log(`  POST /webhook/gpt-credit-report      - GPT credit report`);
  console.log(`  POST /webhook/booking                - Calendar booking`);
  console.log(`  POST /process-webinar/:id            - Process single webinar`);
  console.log(`  POST /process-recent-webinars        - Process all recent\n`);

  // Ensure custom fields exist in Close
  try {
    await ensureCustomFieldsExist();
    console.log('✅ Close CRM custom fields ready\n');
  } catch (error) {
    console.error('❌ Error setting up Close fields:', error.message);
  }
});
