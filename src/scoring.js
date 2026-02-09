const PITCH_MINUTE = parseInt(process.env.PITCH_MINUTE || '75', 10);
const SETTER_MIN_MINUTES = parseInt(process.env.SETTER_MIN_MINUTES || '30', 10);

function scoreWebinarAttendee(participant) {
  // Zoom gives duration in seconds
  const minutesWatched = Math.floor((participant.duration || 0) / 60);

  let source = '';
  let priority = 0;

  if (minutesWatched >= PITCH_MINUTE) {
    source = 'webinar-watched-full';
    priority = 10; // HOT - watched through full pitch
  } else if (minutesWatched >= SETTER_MIN_MINUTES) {
    source = 'webinar-watched-partial';
    priority = 3; // WARM - setter eligible (30+ mins)
  } else if (minutesWatched > 0) {
    source = 'webinar-watched-partial';
    priority = 1; // COLD - left too early for setter
  }

  return {
    email: participant.user_email,
    name: participant.name,
    minutesWatched,
    source,
    priority,
    setterEligible: minutesWatched >= SETTER_MIN_MINUTES,
  };
}

function scoreTypeformApplication() {
  return {
    source: 'applied-no-booking',
    priority: 7, // Hot - showed interest, setter eligible
    setterEligible: true,
  };
}

function scoreCreditReportGPT() {
  return {
    source: 'credit-report-gpt',
    priority: 8, // Hottest - shared credit info, setter eligible
    setterEligible: true,
  };
}

function scoreCreditReportTypeform() {
  return {
    source: 'credit-report-typeform',
    priority: 8, // Hottest - shared credit info, setter eligible
    setterEligible: true,
  };
}

function scoreNoShow(registrant) {
  return {
    email: registrant.email,
    name: `${registrant.first_name || ''} ${registrant.last_name || ''}`.trim(),
    source: 'webinar-no-show',
    priority: 0, // Lowest - not setter eligible
    setterEligible: false,
  };
}

function scoreBooked() {
  return {
    source: 'booked',
    priority: 10, // Already converted - remove from setter list
    setterEligible: false,
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
  SETTER_MIN_MINUTES,
};
