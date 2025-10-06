const fetch = globalThis.fetch || require('node-fetch');

/**
 * Get user by username (exact match)
 */
async function getUserByUsername(username) {
    const response = await fetch('https://users.roblox.com/v1/usernames/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            usernames: [username],
            excludeBannedUsers: false
        })
    });

    if (!response.ok) throw new Error('Failed to fetch user by username');
    
    const data = await response.json();
    if (data.data.length === 0) return null;
    
    const user = data.data[0];
    return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        profileUrl: `https://www.roblox.com/users/${user.id}/profile`
    };
}

/**
 * Get user by ID (exact match)
 */
async function getUserById(userId) {
    const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    
    if (!response.ok) throw new Error('Failed to fetch user by ID');
    
    const user = await response.json();
    return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        profileUrl: `https://www.roblox.com/users/${user.id}/profile`
    };
}

/**
 * Search users by display name (returns multiple matches)
 */
async function searchUsersByDisplayName(displayName, limit = 10) {
    const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(displayName)}&limit=${limit}`);
    
    if (!response.ok) throw new Error('Failed to search users by display name');
    
    const data = await response.json();
    return data.data.map(user => ({
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
        hasVerifiedBadge: user.hasVerifiedBadge || false
    }));
}

/**
 * Smart search that handles all types of queries
 */
async function smartUserSearch(query, resultLimit = 5) {
    let exactMatch = null;
    let displayNameMatches = [];

    try {
        // Try exact username or ID match first
        if (/^\d+$/.test(query)) {
            exactMatch = await getUserById(query);
        } else {
            exactMatch = await getUserByUsername(query);
        }
    } catch (error) {
        console.log('No exact match found, continuing with display name search...');
    }

    // Always search by display name to find multiple matches
    try {
        displayNameMatches = await searchUsersByDisplayName(query, resultLimit);
    } catch (error) {
        console.error('Display name search error:', error);
    }

    return {
        exactMatch,
        displayNameMatches
    };
}

module.exports = {
    getUserByUsername,
    getUserById,
    searchUsersByDisplayName,
    smartUserSearch
};