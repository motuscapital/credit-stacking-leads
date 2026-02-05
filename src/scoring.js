const PITCH_MINUTE = parseInt(process.env.PITCH_MINUTE || '75', 10);

function scoreWebinarAttendee(participant) {
  // Zoom gives duration in seconds
  const minutesWatched = Math.floor((participant.duration || 0) / 60);

  let source = '';
  let priority = 0;

  if (minutesWatched >= PITCH_MINUTE) {
    source = 'webinar-watched-full';
    priority = 3; // Warm - watched through pitch
  } else if (minutesWatched > 0) {
    source = 'webinar-watched-partial';
    priority = 1; // Cold - left early
  }

  return {
    email: participant.user_email,
    name: participant.name,
    minutesWatched,
    source,
    priority,
  };
}

function scoreTypeformApplication() {
  return {
    source: 'applied-no-booking',
    priority: 4, // Hot - showed interest
  };
}

function scoreCreditReportGPT() {
  return {
    source: 'credit-report-gpt',
    priority: 5, // Hottest
  };
}

function scoreCreditReportTypeform() {
  return {
    source: 'credit-report-typeform',
    priority: 5, // Hottest
  };
}

function scoreNoShow(registrant) {
  return {
    email: registrant.email,
    name: `${registrant.first_name || ''} ${registrant.last_name || ''}`.trim(),
    source: 'webinar-no-show',
    priority: 0, // Lowest
  };
}

function scoreBooked() {
  return {
    source: 'booked',
    priority: 10, // Already converted
  };
}

module.exports = {
  scoreWebinarAttendee,
  scoreTypeformApplication,
  scoreCreditReportGPT,
  scoreCreditReportTypeform,
  scoreNoShow,
  scoreBooked,
  PITCH_MINUTE,
};
