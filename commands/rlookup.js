const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');

// Track rate limits
const rateLimitTracker = {
    lastRequest: 0,
    requests: 0,
    resetTime: 0,
    isRateLimited: false
};

// Helper function to check rate limits
function checkRateLimit() {
    const now = Date.now();
    
    // Reset counter if 60 seconds have passed
    if (now - rateLimitTracker.lastRequest > 60000) {
        rateLimitTracker.requests = 0;
        rateLimitTracker.isRateLimited = false;
    }
    
    // Check if we're rate limited
    if (rateLimitTracker.isRateLimited && now < rateLimitTracker.resetTime) {
        const timeLeft = Math.ceil((rateLimitTracker.resetTime - now) / 1000);
        return { limited: true, timeLeft };
    }
    
    // Roblox API has limits - let's be conservative
    if (rateLimitTracker.requests >= 30) { // 30 requests per minute
        rateLimitTracker.isRateLimited = true;
        rateLimitTracker.resetTime = now + 60000; // 1 minute
        return { limited: true, timeLeft: 60 };
    }
    
    rateLimitTracker.requests++;
    rateLimitTracker.lastRequest = now;
    return { limited: false, timeLeft: 0 };
}

// Helper function to handle API errors
function handleApiError(error) {
    console.error('API Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
    });
    
    // Check for rate limiting headers
    if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.['retry-after'] || 
                          error.response.headers?.['x-rate-limit-reset'] || 
                          60;
        return { type: 'rate_limit', retryAfter: parseInt(retryAfter) };
    }
    
    if (error.response?.status === 400 || error.response?.status === 404) {
        return { type: 'not_found' };
    }
    
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
        return { type: 'server_error' };
    }
    
    return { type: 'unknown', message: error.message };
}

async function smartUserSearch(query, limit = 10) {
    const isNumeric = /^\d+$/.test(query);
    let exactMatch = null;
    let otherMatches = [];
    let rateLimitInfo = null;
    
    try {
        // Check rate limit before making any requests
        const rateLimitCheck = checkRateLimit();
        if (rateLimitCheck.limited) {
            return { 
                exactMatch: null, 
                displayNameMatches: [], 
                rateLimitInfo: { 
                    limited: true, 
                    timeLeft: rateLimitCheck.timeLeft 
                } 
            };
        }
        
        // STRATEGY 1: If numeric, try direct user ID lookup first
        if (isNumeric) {
            try {
                const userResponse = await axios.get(`https://users.roblox.com/v1/users/${query}`, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'DiscordBot/1.0'
                    }
                });
                exactMatch = {
                    id: userResponse.data.id,
                    name: userResponse.data.name,
                    displayName: userResponse.data.displayName,
                    hasVerifiedBadge: userResponse.data.hasVerifiedBadge || false,
                    profileUrl: `https://www.roblox.com/users/${userResponse.data.id}/profile`,
                    matchType: 'userid'
                };
                return { 
                    exactMatch, 
                    displayNameMatches: [], 
                    rateLimitInfo: null 
                };
            } catch (err) {
                const apiError = handleApiError(err);
                if (apiError.type === 'rate_limit') {
                    rateLimitInfo = apiError;
                }
                // Not a valid user ID, continue with username search
            }
        }
        
        // STRATEGY 2: Try exact username lookup via username endpoint
        try {
            const usernameResponse = await axios.post(
                `https://users.roblox.com/v1/usernames/users`,
                { usernames: [query], excludeBannedUsers: false },
                {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'DiscordBot/1.0'
                    }
                }
            );
            
            if (usernameResponse.data.data && usernameResponse.data.data.length > 0) {
                const user = usernameResponse.data.data[0];
                exactMatch = {
                    id: user.id,
                    name: user.name,
                    displayName: user.displayName,
                    hasVerifiedBadge: user.hasVerifiedBadge || false,
                    profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
                    matchType: 'username'
                };
            }
        } catch (err) {
            const apiError = handleApiError(err);
            if (apiError.type === 'rate_limit' && !rateLimitInfo) {
                rateLimitInfo = apiError;
            }
        }
        
        // If we already have a match, just return it to avoid more API calls
        if (exactMatch && !rateLimitInfo) {
            return { 
                exactMatch, 
                displayNameMatches: [], 
                rateLimitInfo: null 
            };
        }
        
        // STRATEGY 3: Search for similar usernames (only if not rate limited)
        if (!rateLimitInfo) {
            try {
                const searchResponse = await axios.get(
                    `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=${Math.min(limit + 5, 20)}`,
                    {
                        timeout: 5000,
                        headers: { 'User-Agent': 'DiscordBot/1.0' }
                    }
                );
                
                const allUsers = searchResponse.data.data || [];
                
                // Format users
                const formattedUsers = allUsers.map(user => ({
                    id: user.id,
                    name: user.name,
                    displayName: user.displayName,
                    hasVerifiedBadge: user.hasVerifiedBadge || false,
                    profileUrl: `https://www.roblox.com/users/${user.id}/profile`
                }));
                
                // If we already have an exact match from username endpoint, filter it out
                if (exactMatch) {
                    otherMatches = formattedUsers
                        .filter(user => user.id !== exactMatch.id)
                        .slice(0, limit);
                } else {
                    // Check if search returned an exact match
                    const exactSearchMatch = formattedUsers.find(user => 
                        user.name.toLowerCase() === query.toLowerCase() || 
                        user.displayName.toLowerCase() === query.toLowerCase()
                    );
                    
                    if (exactSearchMatch) {
                        exactMatch = {
                            ...exactSearchMatch,
                            matchType: exactSearchMatch.name.toLowerCase() === query.toLowerCase() ? 'username' : 'displayname'
                        };
                        
                        otherMatches = formattedUsers
                            .filter(user => user.id !== exactMatch.id)
                            .slice(0, limit);
                    } else {
                        // No exact match, use all search results
                        otherMatches = formattedUsers.slice(0, limit);
                    }
                }
                
            } catch (searchErr) {
                const apiError = handleApiError(searchErr);
                if (apiError.type === 'rate_limit' && !rateLimitInfo) {
                    rateLimitInfo = apiError;
                }
            }
        }
        
        // STRATEGY 4: For display names, check if any matches have exact display name
        if (!exactMatch && otherMatches.length > 0 && !rateLimitInfo) {
            const exactDisplayMatch = otherMatches.find(user => 
                user.displayName.toLowerCase() === query.toLowerCase()
            );
            
            if (exactDisplayMatch) {
                exactMatch = {
                    ...exactDisplayMatch,
                    matchType: 'displayname'
                };
                
                // Remove from other matches
                otherMatches = otherMatches.filter(user => user.id !== exactMatch.id);
            }
        }
        
        return {
            exactMatch,
            displayNameMatches: otherMatches.slice(0, limit),
            rateLimitInfo
        };
        
    } catch (error) {
        console.error('Roblox search error:', error);
        return { 
            exactMatch: null, 
            displayNameMatches: [], 
            rateLimitInfo: { type: 'unknown', message: 'Unexpected error' } 
        };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rlookup')
        .setDescription('Look up Roblox user by username, display name, or ID')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Username, display name, or user ID')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Number of similar results to show (default: 5, max: 15)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(15)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim();
        const limit = interaction.options.getInteger('limit') || 5;

        try {
            const { exactMatch, displayNameMatches, rateLimitInfo } = await smartUserSearch(query, limit);

            // Handle rate limiting
            if (rateLimitInfo) {
                if (rateLimitInfo.type === 'rate_limit') {
                    const retryAfter = rateLimitInfo.retryAfter || 60;
                    const minutes = Math.ceil(retryAfter / 60);
                    
                    return interaction.editReply({
                        content: `⚠️ **Rate Limit Reached!**\n\nThe Roblox API is rate limiting our requests. Please wait **${minutes} minute${minutes > 1 ? 's' : ''}** before trying again.\n\n*This is a limitation from Roblox's side, not the bot.*`,
                        ephemeral: false
                    });
                } else if (rateLimitInfo.type === 'server_error') {
                    return interaction.editReply({
                        content: `❌ **Roblox API Error**\n\nRoblox's servers are currently experiencing issues. Please try again in a few minutes.\n\n*Error: ${rateLimitInfo.message || 'Server unavailable'}*`,
                        ephemeral: false
                    });
                }
            }

            // Handle no results (but only if not rate limited)
            if (!exactMatch && displayNameMatches.length === 0) {
                return interaction.editReply({
                    content: `❌ No Roblox users found matching: **${query}**\n\n*Note: If you're sure this user exists, it might be due to:*\n• Private/deleted account\n• Search limitations (display names are harder to search)\n• Try using their exact username instead of display name`,
                    ephemeral: false
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x00AE86) // Roblox green
                .setTitle('🔍 Roblox User Lookup')
                .setTimestamp();

            // Add exact match section if found
            if (exactMatch) {
                let matchType = 'Exact Match';
                let matchEmoji = '🎯';
                
                switch (exactMatch.matchType) {
                    case 'username':
                        matchType = 'Exact Username Match';
                        matchEmoji = '👤';
                        break;
                    case 'displayname':
                        matchType = 'Exact Display Name Match';
                        matchEmoji = '🏷️';
                        break;
                    case 'userid':
                        matchType = 'Exact User ID Match';
                        matchEmoji = '🆔';
                        break;
                }
                
                embed.setDescription(`**Search:** ${query}\n**Match Type:** ${matchType}`);
                
                embed.addFields({
                    name: `${matchEmoji} ${exactMatch.displayName}`,
                    value: `**Username:** @${exactMatch.name}\n**ID:** \`${exactMatch.id}\`\n**Verified:** ${exactMatch.hasVerifiedBadge ? '✅' : '❌'}\n[View Profile](${exactMatch.profileUrl})`,
                    inline: false
                });
                
                // Get avatar thumbnail
                try {
                    const avatarResponse = await axios.get(
                        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${exactMatch.id}&size=150x150&format=Png&isCircular=false`,
                        { timeout: 3000 }
                    );
                    if (avatarResponse.data.data && avatarResponse.data.data[0]) {
                        embed.setThumbnail(avatarResponse.data.data[0].imageUrl);
                    }
                } catch (err) {
                    console.log('Avatar fetch failed:', err.message);
                }
            } else {
                embed.setDescription(`**Search:** ${query}\n*No exact match found*`);
            }

            // Add other matches section
            if (displayNameMatches.length > 0) {
                let matchResults = '';
                const maxEmbedResults = Math.min(displayNameMatches.length, 5);
                const showMatches = displayNameMatches.slice(0, maxEmbedResults);
                
                showMatches.forEach((user, index) => {
                    const verifiedBadge = user.hasVerifiedBadge ? ' ✅' : '';
                    matchResults += `${index + 1}. **${user.displayName}**${verifiedBadge} (@${user.name})\n   **ID:** \`${user.id}\`\n`;
                });

                const fieldName = exactMatch ? 'Similar Users' : 'Search Results';
                embed.addFields({
                    name: `🔍 ${fieldName} (${displayNameMatches.length})`,
                    value: matchResults || 'No additional matches found.',
                    inline: false
                });
            }

            // Add result count and rate limit warning if needed
            const totalResults = (exactMatch ? 1 : 0) + displayNameMatches.length;
            let footerText = `Found ${totalResults} result(s)`;
            
            if (rateLimitTracker.requests > 20) {
                const remaining = Math.max(0, 30 - rateLimitTracker.requests);
                footerText += ` • Rate limit: ${remaining}/30 reqs left`;
            }
            
            embed.setFooter({ text: footerText });

            // Add select menu if we have multiple results
            const components = [];
            const allUsers = exactMatch ? [exactMatch, ...displayNameMatches] : displayNameMatches;
            
            if (allUsers.length > 1) {
                const options = allUsers.slice(0, 10).map((user, index) => ({
                    label: `${user.displayName.length > 20 ? user.displayName.substring(0, 20) + '...' : user.displayName}`,
                    value: user.id.toString(),
                    description: `@${user.name} | ID: ${user.id}`,
                    emoji: index === 0 && exactMatch ? '⭐' : (['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][index] || '👤')
                }));

                if (options.length > 0) {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('user_select')
                        .setPlaceholder('Select user for details...')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    components.push(row);
                }
            }

            return interaction.editReply({ 
                embeds: [embed], 
                components: components.length > 0 ? components : undefined 
            });

        } catch (error) {
            console.error('Roblox lookup error:', error);
            return interaction.editReply({
                content: '❌ **Unexpected Error**\n\nThere was an unexpected error while looking up Roblox users. The error has been logged.\n\n*Please try again in a few moments.*',
                ephemeral: false
            });
        }
    }
};