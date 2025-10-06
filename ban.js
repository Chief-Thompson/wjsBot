const fetch = globalThis.fetch || require('node-fetch');
const { filterBanReason } = require('./filters.js');

const API_KEY = process.env.ROBLOX_API_KEY;
const UNIVERSE_ID = process.env.UNIVERSE_ID;

if (!API_KEY || !UNIVERSE_ID) {
  throw new Error('ROBLOX_API_KEY or UNIVERSE_ID missing in .env');
}

const HEADERS = {
  'x-api-key': API_KEY,
  'Content-Type': 'application/json'
};

/**
 * Ban a user from the universe.
 * @param {number|string} userId - Roblox user ID
 * @param {string} reason - Reason for the ban
 * @param {number} durationMinutes - Duration of the ban in minutes (0 = permanent)
 * @param {string} moderatorTag - Discord tag of the moderator who issued the ban
 */
async function banUser(userId, reason = 'No reason provided', durationMinutes = 0, moderatorTag = 'Unknown') {
  const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/user-restrictions/${userId}`;
  
  // ✅ FIXED: Use 5 years for "permanent" bans (satisfies API requirement for duration > 0)
  let durationSeconds;
  if (durationMinutes === 0) {
    // 5 years in seconds = 5 * 365 * 24 * 60 * 60
    durationSeconds = 157680000; // 5 years in seconds
  } else if (durationMinutes > 0) {
    durationSeconds = durationMinutes * 60; // Temporary ban
  } else {
    throw new Error('Invalid duration: duration must be 0 (permanent) or positive number (temporary)');
  }
  
  const durationString = `${durationSeconds}s`;

  // Filter the reason
  const filtered = filterBanReason(reason);
  const safeReason = filtered.filteredReason;

  // Include moderator tag in private reason
  const privateReason = `Moderator: ${moderatorTag} | Reason: ${safeReason}`;
  const displayReason = safeReason;

  const body = {
    gameJoinRestriction: {
      active: true,
      startTime: new Date().toISOString(),
      duration: durationString, // This will always be > 0
      privateReason: privateReason,
      displayReason: displayReason,
      excludeAltAccounts: false
    }
  };

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify(body)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Roblox API Error: ${text}`);

    return JSON.parse(text || '{}');
  } catch (err) {
    throw new Error(`Failed to ban user: ${err.message}`);
  }
}

/**
 * Unban a user from the universe
 * @param {number|string} userId
 */
async function unbanUser(userId) {
  const url = `https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/user-restrictions/${userId}`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({
        gameJoinRestriction: {
          active: false
        }
      })
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Roblox API Error: ${text}`);
    return JSON.parse(text || '{}');
  } catch (err) {
    throw new Error(`Failed to unban user: ${err.message}`);
  }
}

module.exports = { banUser, unbanUser };