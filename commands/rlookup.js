const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');

const axiosClient = axios.create({
    timeout: 9000,
    headers: { 'User-Agent': 'DiscordBot/1.0' }
});

// Track rate limits
const rateLimitTracker = {
    lastRequest: 0,
    requests: 0,
    resetTime: 0,
    isRateLimited: false
};

// Simple in-memory cache to reduce repeat lookups
const cache = new Map();
const CACHE_TTL_MS = 3 * 60 * 1000;

function getCache(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCache(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

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

// Retry on transient failures and rate limits
async function requestWithRetry(config, maxAttempts = 3) {
    let attempt = 0;
    let lastError = null;

    while (attempt < maxAttempts) {
        try {
            return await axiosClient.request(config);
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const isTransient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
            const isNetwork = !status;

            if (!isTransient && !isNetwork) break;

            const retryAfterHeader = error.response?.headers?.['retry-after'];
            const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
            const backoffMs = retryAfterSeconds ? retryAfterSeconds * 1000 : 400 * Math.pow(2, attempt);

            await new Promise(resolve => setTimeout(resolve, Math.min(backoffMs, 4000)));
            attempt++;
        }
    }

    throw lastError;
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

// Search function with type parameter
async function smartUserSearch(query, searchType = 'auto', limit = 10) {
    const isNumeric = /^\d+$/.test(query);
    let exactMatch = null;
    let otherMatches = [];
    let rateLimitInfo = null;

    const cacheKey = `${searchType}|${query.toLowerCase()}|${limit}`;
    const cached = getCache(cacheKey);
    if (cached) {
        return cached;
    }
    
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
                },
                searchType: searchType
            };
        }
        
        // USER ID SEARCH
        if (searchType === 'userid' || (searchType === 'auto' && isNumeric)) {
            try {
                const userResponse = await requestWithRetry({
                    method: 'GET',
                    url: `https://users.roblox.com/v1/users/${query}`
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
                    rateLimitInfo: null,
                    searchType: 'userid'
                };
            } catch (err) {
                const apiError = handleApiError(err);
                if (apiError.type === 'rate_limit') {
                    rateLimitInfo = apiError;
                }
                // If specifically searching by userid and failed, return empty
                if (searchType === 'userid') {
                    const result = {
                        exactMatch: null,
                        displayNameMatches: [],
                        rateLimitInfo,
                        searchType: 'userid'
                    };
                    setCache(cacheKey, result);
                    return result;
                }
            }
        }
        
        // USERNAME SEARCH (exact)
        if (searchType === 'username' || (searchType === 'auto' && !isNumeric)) {
            try {
                const usernameResponse = await requestWithRetry({
                    method: 'POST',
                    url: `https://users.roblox.com/v1/usernames/users`,
                    data: { usernames: [query], excludeBannedUsers: false },
                    headers: { 'Content-Type': 'application/json' }
                });
                
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
                    
                    // If specifically searching by username, return only exact match
                    if (searchType === 'username') {
                        const result = { 
                            exactMatch, 
                            displayNameMatches: [], 
                            rateLimitInfo: null,
                            searchType: 'username'
                        };
                        setCache(cacheKey, result);
                        return result;
                    }
                } else if (searchType === 'username') {
                    // No exact username match found
                    const result = {
                        exactMatch: null,
                        displayNameMatches: [],
                        rateLimitInfo: null,
                        searchType: 'username'
                    };
                    setCache(cacheKey, result);
                    return result;
                }
            } catch (err) {
                const apiError = handleApiError(err);
                if (apiError.type === 'rate_limit' && !rateLimitInfo) {
                    rateLimitInfo = apiError;
                }
                if (searchType === 'username') {
                    const result = {
                        exactMatch: null,
                        displayNameMatches: [],
                        rateLimitInfo,
                        searchType: 'username'
                    };
                    setCache(cacheKey, result);
                    return result;
                }
            }
        }
        
        // DISPLAY NAME SEARCH (or fallback search)
        if (searchType === 'displayname' || (searchType === 'auto' && !exactMatch) || (searchType === 'username' && !exactMatch)) {
            if (!rateLimitInfo) {
                try {
                    const searchResponse = await requestWithRetry({
                        method: 'GET',
                        url: `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=${Math.min(limit + 10, 30)}`
                    });
                    
                    const allUsers = searchResponse.data.data || [];
                    
                    // Format users
                    const formattedUsers = allUsers.map(user => ({
                        id: user.id,
                        name: user.name,
                        displayName: user.displayName,
                        hasVerifiedBadge: user.hasVerifiedBadge || false,
                        profileUrl: `https://www.roblox.com/users/${user.id}/profile`
                    }));
                    
                    // For display name search, look for display name matches
                    if (searchType === 'displayname') {
                        // Filter for display name matches
                        const displayNameMatches = formattedUsers.filter(user => 
                            user.displayName.toLowerCase().includes(query.toLowerCase()) ||
                            query.toLowerCase().includes(user.displayName.toLowerCase())
                        );
                        
                        // Check for exact display name match
                        const exactDisplayMatch = displayNameMatches.find(user => 
                            user.displayName.toLowerCase() === query.toLowerCase()
                        );
                        
                        if (exactDisplayMatch) {
                            exactMatch = {
                                ...exactDisplayMatch,
                                matchType: 'displayname'
                            };
                            // Remove exact match from list
                            otherMatches = displayNameMatches
                                .filter(user => user.id !== exactMatch.id)
                                .slice(0, limit);
                        } else {
                            // No exact match, use all display name matches
                            otherMatches = displayNameMatches.slice(0, limit);
                        }
                    } else {
                        // For auto or username search fallback, check for any matches
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
                    }
                    
                } catch (searchErr) {
                    const apiError = handleApiError(searchErr);
                    if (apiError.type === 'rate_limit' && !rateLimitInfo) {
                        rateLimitInfo = apiError;
                    }
                }
            }
        }
        
        const result = {
            exactMatch,
            displayNameMatches: otherMatches.slice(0, limit),
            rateLimitInfo,
            searchType: searchType
        };
        setCache(cacheKey, result);
        return result;
        
    } catch (error) {
        console.error('Roblox search error:', error);
        const result = { 
            exactMatch: null, 
            displayNameMatches: [], 
            rateLimitInfo: { type: 'unknown', message: 'Unexpected error' },
            searchType: searchType
        };
        setCache(cacheKey, result);
        return result;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rlookup')
        .setDescription('Look up Roblox user by username, display name, or user ID')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('The username, display name, or user ID to search for')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('What type of search to perform')
                .setRequired(false)
                .addChoices(
                    { name: 'Auto-detect (default)', value: 'auto' },
                    { name: 'Username (exact match)', value: 'username' },
                    { name: 'Display Name (similar names)', value: 'displayname' },
                    { name: 'User ID (exact match)', value: 'userid' }
                )
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Max results for display name search (default: 5, max: 15)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(15)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim();
        const searchType = interaction.options.getString('type') || 'auto';
        const limit = interaction.options.getInteger('limit') || 5;

        try {
            const { exactMatch, displayNameMatches, rateLimitInfo, searchType: usedSearchType } = await smartUserSearch(query, searchType, limit);

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

            // Handle no results
            if (!exactMatch && displayNameMatches.length === 0) {
                let errorMessage = `❌ No Roblox users found matching: **${query}**`;
                
                switch (usedSearchType) {
                    case 'username':
                        errorMessage += `\n\n*No exact username match found. Try:*\n• Checking for typos\n• Using display name search instead\n• Making sure the account isn't deleted/private*`;
                        break;
                    case 'displayname':
                        errorMessage += `\n\n*No display name matches found. Try:*\n• Using a broader search term\n• Searching by username instead\n• Making sure the display name is correct*`;
                        break;
                    case 'userid':
                        errorMessage += `\n\n*No user found with this ID. Make sure it's a valid Roblox user ID.*`;
                        break;
                    default:
                        errorMessage += `\n\n*Try specifying the search type:\n\`/rlookup query:${query} type:username\` - For exact username\n\`/rlookup query:${query} type:displayname\` - For display name matches*`;
                }
                
                return interaction.editReply({
                    content: errorMessage,
                    ephemeral: false
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x00AE86) // Roblox green
                .setTitle('🔍 Roblox User Lookup')
                .setTimestamp();

            // Determine search type description
            let searchDescription = '';
            switch (usedSearchType) {
                case 'username':
                    searchDescription = 'Username Search (Exact Match)';
                    break;
                case 'displayname':
                    searchDescription = 'Display Name Search';
                    break;
                case 'userid':
                    searchDescription = 'User ID Search';
                    break;
                default:
                    searchDescription = 'Auto-detect Search';
            }
            
            embed.setDescription(`**Search:** ${query}\n**Type:** ${searchDescription}`);

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
                
                embed.addFields({
                    name: `${matchEmoji} ${exactMatch.displayName}`,
                    value: `**Username:** @${exactMatch.name}\n**ID:** \`${exactMatch.id}\`\n**Verified:** ${exactMatch.hasVerifiedBadge ? '✅' : '❌'}\n[View Profile](${exactMatch.profileUrl})`,
                    inline: false
                });
                
                // Get avatar thumbnail
                try {
                    const avatarResponse = await requestWithRetry({
                        method: 'GET',
                        url: `https://thumbnails.roblox.com/v1/users/avatar?userIds=${exactMatch.id}&size=150x150&format=Png&isCircular=false`
                    }, 2);
                    if (avatarResponse.data.data && avatarResponse.data.data[0]) {
                        embed.setThumbnail(avatarResponse.data.data[0].imageUrl);
                    }
                } catch (err) {
                    console.log('Avatar fetch failed:', err.message);
                }
            } else if (usedSearchType === 'displayname') {
                embed.addFields({
                    name: 'ℹ️ Note',
                    value: 'No exact display name match found. Showing similar display names below.',
                    inline: false
                });
            }

            // Add other matches section
            if (displayNameMatches.length > 0) {
                let matchResults = '';
                const maxEmbedResults = Math.min(displayNameMatches.length, 5);
                const showMatches = displayNameMatches.slice(0, maxEmbedResults);
                
                showMatches.forEach((user, index) => {
                    const verifiedBadge = user.hasVerifiedBadge ? ' ✅' : '';
                    const isExactDisplayName = user.displayName.toLowerCase() === query.toLowerCase();
                    const exactBadge = isExactDisplayName ? ' 🎯' : '';
                    matchResults += `${index + 1}. **${user.displayName}**${verifiedBadge}${exactBadge} (@${user.name})\n   **ID:** \`${user.id}\`\n`;
                });

                // Add note if there are more results
                if (displayNameMatches.length > maxEmbedResults) {
                    matchResults += `\n*... and ${displayNameMatches.length - maxEmbedResults} more results*`;
                }

                let fieldName = '';
                if (exactMatch) {
                    fieldName = usedSearchType === 'displayname' ? 'Similar Display Names' : 'Similar Users';
                } else {
                    fieldName = usedSearchType === 'displayname' ? 'Display Name Matches' : 'Search Results';
                }
                
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
            
            footerText += ` • Search type: ${searchDescription}`;
            
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

            // Add search type suggestion buttons if no exact match
            if (!exactMatch) {
                const buttonRow = new ActionRowBuilder();
                
                if (usedSearchType !== 'username') {
                    buttonRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`search_username_${query}`)
                            .setLabel('Try Username Search')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('👤')
                    );
                }
                
                if (usedSearchType !== 'displayname') {
                    buttonRow.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`search_displayname_${query}`)
                            .setLabel('Try Display Name Search')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🏷️')
                    );
                }
                
                if (components.length === 0 && buttonRow.components.length > 0) {
                    components.push(buttonRow);
                } else if (buttonRow.components.length > 0) {
                    components.push(buttonRow);
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
    },
    
    // Handle button interactions for search type switching
    handleButtonInteraction: async (interaction) => {
        if (!interaction.isButton()) return;
        
        await interaction.deferUpdate();
        
        const customId = interaction.customId;
        
        if (customId.startsWith('search_username_') || customId.startsWith('search_displayname_')) {
            const searchType = customId.startsWith('search_username_') ? 'username' : 'displayname';
            const query = customId.substring(customId.lastIndexOf('_') + 1);
            
            // Re-run the search with the selected type
            const { exactMatch, displayNameMatches, rateLimitInfo } = await smartUserSearch(query, searchType, 5);
            
            // Update the message with new results
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            // Update search type in description
            const oldDescription = embed.data.description || '';
            const searchDescription = searchType === 'username' ? 'Username Search (Exact Match)' : 'Display Name Search';
            embed.setDescription(oldDescription.replace(/Type:.*/, `Type: ${searchDescription}`));
            
            // Update footer
            const totalResults = (exactMatch ? 1 : 0) + displayNameMatches.length;
            embed.setFooter({ 
                text: `Found ${totalResults} result(s) • Search type: ${searchDescription}` 
            });
            
            // Update the message
            await interaction.editReply({
                embeds: [embed],
                components: interaction.message.components // Keep existing components
            });
        }
    },

    // Handle select menu interactions for choosing a user
    handleSelectInteraction: async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;

        await interaction.deferUpdate();

        const selectedId = interaction.values?.[0];
        if (!selectedId) return;

        try {
            const userResponse = await requestWithRetry({
                method: 'GET',
                url: `https://users.roblox.com/v1/users/${selectedId}`
            });

            const user = userResponse.data;
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0]);

            const profileUrl = `https://www.roblox.com/users/${user.id}/profile`;
            const verified = user.hasVerifiedBadge ? 'âœ…' : 'âŒ';

            updatedEmbed.setFields([
                {
                    name: `Selected: ${user.displayName}`,
                    value: `**Username:** @${user.name}\n**ID:** \`${user.id}\`\n**Verified:** ${verified}\n[View Profile](${profileUrl})`,
                    inline: false
                }
            ]);

            try {
                const avatarResponse = await requestWithRetry({
                    method: 'GET',
                    url: `https://thumbnails.roblox.com/v1/users/avatar?userIds=${user.id}&size=150x150&format=Png&isCircular=false`
                }, 2);
                if (avatarResponse.data.data && avatarResponse.data.data[0]) {
                    updatedEmbed.setThumbnail(avatarResponse.data.data[0].imageUrl);
                }
            } catch (err) {
                console.log('Avatar fetch failed:', err.message);
            }

            await interaction.editReply({
                embeds: [updatedEmbed],
                components: interaction.message.components
            });
        } catch (error) {
            console.error('Select user lookup error:', error);
            await interaction.editReply({
                content: 'There was an error retrieving that user. Please try again.',
                embeds: interaction.message.embeds,
                components: interaction.message.components
            });
        }
    }
};
