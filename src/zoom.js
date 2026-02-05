const axios = require('axios');

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const credentials = Buffer.from(
    `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://zoom.us/oauth/token',
    new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: process.env.ZOOM_ACCOUNT_ID,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  accessToken = response.data.access_token;
  // Token expires in 1 hour, refresh 5 min early
  tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

  return accessToken;
}

async function getRecentWebinars() {
  const token = await getAccessToken();

  const response = await axios.get(
    'https://api.zoom.us/v2/users/me/webinars',
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { page_size: 10 },
    }
  );

  return response.data.webinars || [];
}

async function getWebinarParticipants(webinarId) {
  const token = await getAccessToken();

  const participants = [];
  let nextPageToken = '';

  do {
    const response = await axios.get(
      `https://api.zoom.us/v2/past_webinars/${webinarId}/participants`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page_size: 300,
          next_page_token: nextPageToken || undefined,
        },
      }
    );

    participants.push(...(response.data.participants || []));
    nextPageToken = response.data.next_page_token;
  } while (nextPageToken);

  return participants;
}

async function getPastWebinars() {
  const token = await getAccessToken();

  // Get webinars from the last 30 days
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];

  const response = await axios.get(
    'https://api.zoom.us/v2/users/me/webinars',
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { page_size: 30, type: 'past' },
    }
  );

  return response.data.webinars || [];
}

async function getWebinarAbsentees(webinarId) {
  const token = await getAccessToken();

  // Double URL-encode UUIDs with special characters
  const encodedId = webinarId.includes('/') || webinarId.includes('+') || webinarId.includes('=')
    ? encodeURIComponent(encodeURIComponent(webinarId))
    : webinarId;

  try {
    const response = await axios.get(
      `https://api.zoom.us/v2/past_webinars/${encodedId}/absentees`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { page_size: 300 },
      }
    );
    return response.data.registrants || [];
  } catch (error) {
    // Absentees endpoint may not be available for all webinar types
    console.log('Could not fetch absentees:', error.message);
    return [];
  }
}

module.exports = {
  getAccessToken,
  getRecentWebinars,
  getWebinarParticipants,
  getPastWebinars,
  getWebinarAbsentees,
};
