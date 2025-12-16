const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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
    
    if (now - rateLimitTracker.lastRequest > 60000) {
        rateLimitTracker.requests = 0;
        rateLimitTracker.isRateLimited = false;
    }
    
    if (rateLimitTracker.isRateLimited && now < rateLimitTracker.resetTime) {
        const timeLeft = Math.ceil((rateLimitTracker.resetTime - now) / 1000);
        return { limited: true, timeLeft };
    }
    
    if (rateLimitTracker.requests >= 30) {
        rateLimitTracker.isRateLimited = true;
        rateLimitTracker.resetTime = now + 60000;
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
        status: error.response?.status
    });
    
    if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.['retry-after'] || 60;
        return { type: 'rate_limit', retryAfter: parseInt(retryAfter) };
    }
    
    if (error.response?.status === 400 || error.response?.status === 404) {
        return { type: 'not_found' };
    }
    
    if (error.response?.status >= 500) {
        return { type: 'server_error' };
    }
    
    return { type: 'unknown', message: error.message };
}

// Function to search by User ID
async function searchByUserId(userId) {
    try {
        const userResponse = await axios.get(`https://users.roblox.com/v1/users/${userId}`, {
            timeout: 5000
        });
        
        return {
            id: userResponse.data.id,
            name: userResponse.data.name,
            displayName: userResponse.data.displayName,
            hasVerifiedBadge: userResponse.data.hasVerifiedBadge || false,
            profileUrl: `https://www.roblox.com/users/${userResponse.data.id}/profile`,
            matchType: 'userid'
        };
    } catch (err) {
        return null;
    }
}

// Function to search by Username (exact)
async function searchByUsername(username) {
    try {
        const usernameResponse = await axios.post(
            `https://users.roblox.com/v1/usernames/users`,
            { usernames: [username], excludeBannedUsers: false },
            {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            }
        );
        
        if (usernameResponse.data.data && usernameResponse.data.data.length > 0) {
            const user = usernameResponse.data.data[0];
            return {
                id: user.id,
                name: user.name,
                displayName: user.displayName,
                hasVerifiedBadge: user.hasVerifiedBadge || false,
                profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
                matchType: 'username'
            };
        }
    } catch (err) {
        return null;
    }
    return null;
}

// Function to search for Display Name matches
async function searchByDisplayName(displayName, limit = 15) {
    try {
        // Roblox doesn't have a direct display name search, so we search broadly
        const searchResponse = await axios.get(
            `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(displayName)}&limit=50`,
            { timeout: 5000 }
        );
        
        const allUsers = searchResponse.data.data || [];
        
        // Filter users with matching display names (case-insensitive)
        const displayNameMatches = allUsers.filter(user => 
            user.displayName.toLowerCase().includes(displayName.toLowerCase())
        );
        
        // Also look for exact display name matches
        const exactMatches = displayNameMatches.filter(user => 
            user.displayName.toLowerCase() === displayName.toLowerCase()
        );
        
        // Format results
        const formattedUsers = displayNameMatches.map(user => ({
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            hasVerifiedBadge: user.hasVerifiedBadge || false,
            profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
            isExact: user.displayName.toLowerCase() === displayName.toLowerCase()
        }));
        
        // Sort: exact matches first, then others
        const sortedUsers = formattedUsers.sort((a, b) => {
            if (a.isExact && !b.isExact) return -1;
            if (!a.isExact && b.isExact) return 1;
            return 0;
        });
        
        return sortedUsers.slice(0, limit);
        
    } catch (err) {
        console.error('Display name search error:', err.message);
        return [];
    }
}

// Function to get user avatar
async function getUserAvatar(userId) {
    try {
        const avatarResponse = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
            { timeout: 3000 }
        );
        if (avatarResponse.data.data && avatarResponse.data.data[0]) {
            return avatarResponse.data.data[0].imageUrl;
        }
    } catch (err) {
        // Try bust image as fallback
        try {
            const bustResponse = await axios.get(
                `https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
                { timeout: 3000 }
            );
            if (bustResponse.data.data && bustResponse.data.data[0]) {
                return bustResponse.data.data[0].imageUrl;
            }
        } catch (bustErr) {
            return null;
        }
    }
    return null;
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
                    { name: 'Display Name (multiple results)', value: 'displayname' },
                    { name: 'User ID (exact match)', value: 'userid' }
                )
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Max results for display name search (default: 10, max: 25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim();
        const searchType = interaction.options.getString('type') || 'auto';
        const limit = interaction.options.getInteger('limit') || 10;

        try {
            // Check rate limit first
            const rateLimitCheck = checkRateLimit();
            if (rateLimitCheck.limited) {
                const minutes = Math.ceil(rateLimitCheck.timeLeft / 60);
                return interaction.editReply({
                    content: `⚠️ **Rate Limit Reached!**\n\nPlease wait **${minutes} minute${minutes > 1 ? 's' : ''}** before trying again.`,
                    ephemeral: false
                });
            }

            let exactMatch = null;
            let displayNameMatches = [];
            let searchDescription = '';

            // Determine search type
            if (searchType === 'auto') {
                // Auto-detect: if numeric, assume user ID, otherwise ask
                if (/^\d+$/.test(query)) {
                    // Try as User ID
                    exactMatch = await searchByUserId(query);
                    if (exactMatch) {
                        searchDescription = `Auto-detected as **User ID**`;
                    } else {
                        // If not found as user ID, try as username
                        exactMatch = await searchByUsername(query);
                        if (exactMatch) {
                            searchDescription = `Auto-detected as **Username**`;
                        }
                    }
                } else {
                    // Try as Username first
                    exactMatch = await searchByUsername(query);
                    if (exactMatch) {
                        searchDescription = `Auto-detected as **Username**`;
                    }
                }
                
                // If no exact match found in auto mode, show options
                if (!exactMatch) {
                    const optionEmbed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle('🔍 How would you like to search?')
                        .setDescription(`I couldn't auto-detect what type of search to perform for: **${query}**\n\n**Please select a search type:**`)
                        .addFields(
                            { name: '👤 Username Search', value: 'Exact username match (best for finding specific users)', inline: false },
                            { name: '🏷️ Display Name Search', value: `Shows multiple users with similar display names (up to ${limit} results)`, inline: false },
                            { name: '🆔 User ID Search', value: 'Direct lookup by numeric user ID', inline: false }
                        )
                        .setFooter({ text: 'Choose an option below' });

                    const usernameButton = new ButtonBuilder()
                        .setCustomId('search_username')
                        .setLabel('Search as Username')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('👤');

                    const displaynameButton = new ButtonBuilder()
                        .setCustomId('search_displayname')
                        .setLabel('Search as Display Name')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🏷️');

                    const useridButton = new ButtonBuilder()
                        .setCustomId('search_userid')
                        .setLabel('Search as User ID')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🆔');

                    const row = new ActionRowBuilder()
                        .addComponents(usernameButton, displaynameButton, useridButton);

                    return interaction.editReply({ 
                        embeds: [optionEmbed], 
                        components: [row] 
                    });
                }
            } else if (searchType === 'username') {
                // Username search
                exactMatch = await searchByUsername(query);
                searchDescription = `**Username Search**`;
                
                if (!exactMatch) {
                    return interaction.editReply({
                        content: `❌ No Roblox user found with username: **${query}**\n\n*Note: Usernames are case-sensitive. Make sure you're typing the exact username.*`,
                        ephemeral: false
                    });
                }
            } else if (searchType === 'displayname') {
                // Display name search
                displayNameMatches = await searchByDisplayName(query, limit);
                searchDescription = `**Display Name Search**`;
                
                if (displayNameMatches.length === 0) {
                    return interaction.editReply({
                        content: `❌ No Roblox users found with display name containing: **${query}**`,
                        ephemeral: false
                    });
                }
                
                // Check for exact display name match
                const exactDisplayMatch = displayNameMatches.find(user => user.isExact);
                if (exactDisplayMatch) {
                    exactMatch = { ...exactDisplayMatch, matchType: 'displayname' };
                    // Remove exact match from list to avoid duplication
                    displayNameMatches = displayNameMatches.filter(user => user.id !== exactMatch.id);
                }
            } else if (searchType === 'userid') {
                // User ID search
                if (!/^\d+$/.test(query)) {
                    return interaction.editReply({
                        content: '❌ **Invalid User ID**\n\nUser IDs must be numbers only. Please enter a valid numeric user ID.',
                        ephemeral: false
                    });
                }
                
                exactMatch = await searchByUserId(query);
                searchDescription = `**User ID Search**`;
                
                if (!exactMatch) {
                    return interaction.editReply({
                        content: `❌ No Roblox user found with ID: **${query}**`,
                        ephemeral: false
                    });
                }
            }

            // Create results embed
            const embed = new EmbedBuilder()
                .setColor(0x00AE86)
                .setTitle('🔍 Roblox User Lookup')
                .setDescription(`${searchDescription}\n**Search:** ${query}`)
                .setTimestamp();

            // Add exact match if found
            if (exactMatch) {
                let matchEmoji = '👤';
                if (exactMatch.matchType === 'userid') matchEmoji = '🆔';
                if (exactMatch.matchType === 'displayname') matchEmoji = '🏷️';
                
                const avatarUrl = await getUserAvatar(exactMatch.id);
                if (avatarUrl) {
                    embed.setThumbnail(avatarUrl);
                }
                
                embed.addFields({
                    name: `${matchEmoji} ${exactMatch.displayName}`,
                    value: `**Username:** @${exactMatch.name}\n**ID:** \`${exactMatch.id}\`\n**Verified:** ${exactMatch.hasVerifiedBadge ? '✅' : '❌'}\n[View Profile](${exactMatch.profileUrl})`,
                    inline: false
                });
            }

            // Add display name matches if any
            if (displayNameMatches.length > 0) {
                let matchResults = '';
                const maxEmbedResults = Math.min(displayNameMatches.length, 8);
                const showMatches = displayNameMatches.slice(0, maxEmbedResults);
                
                showMatches.forEach((user, index) => {
                    const verifiedBadge = user.hasVerifiedBadge ? ' ✅' : '';
                    const exactBadge = user.isExact ? ' 🎯' : '';
                    matchResults += `${index + 1}. **${user.displayName}**${verifiedBadge}${exactBadge}\n   @${user.name} • ID: \`${user.id}\`\n`;
                });

                // Add note if there are more results
                if (displayNameMatches.length > maxEmbedResults) {
                    matchResults += `\n*... and ${displayNameMatches.length - maxEmbedResults} more results*`;
                }

                embed.addFields({
                    name: `🏷️ Display Name Matches (${displayNameMatches.length})`,
                    value: matchResults || 'No additional matches found.',
                    inline: false
                });
            }

            // Add footer with result count
            const totalResults = (exactMatch ? 1 : 0) + displayNameMatches.length;
            embed.setFooter({ 
                text: `Found ${totalResults} result(s) • Use the type option for better search accuracy` 
            });

            // Add select menu for multiple results
            const components = [];
            const allUsers = exactMatch ? [exactMatch, ...displayNameMatches] : displayNameMatches;
            
            if (allUsers.length > 1) {
                const options = allUsers.slice(0, 10).map((user, index) => ({
                    label: `${user.displayName.length > 20 ? user.displayName.substring(0, 20) + '...' : user.displayName}`,
                    value: user.id.toString(),
                    description: `@${user.name}`,
                    emoji: index === 0 && exactMatch ? '⭐' : (['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'][index] || '👤')
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('user_select')
                    .setPlaceholder('Select another user...')
                    .addOptions(options);

                const row = new ActionRowBuilder().addComponents(selectMenu);
                components.push(row);
            }

            return interaction.editReply({ 
                embeds: [embed], 
                components: components.length > 0 ? components : undefined 
            });

        } catch (error) {
            console.error('Roblox lookup error:', error);
            return interaction.editReply({
                content: '❌ There was an error looking up Roblox users. Please try again later.',
                ephemeral: false
            });
        }
    }
};

// Add this to handle button interactions (in your main bot file or interaction handler)
// You'll need to add an interactionCreate event handler
module.exports.handleButtonInteraction = async (interaction) => {
    if (!interaction.isButton()) return;
    
    if (interaction.customId.startsWith('search_')) {
        await interaction.deferUpdate();
        
        const query = interaction.message.embeds[0]?.description?.match(/\*\*([^*]+)\*\*/)?.[1] || '';
        const searchType = interaction.customId.replace('search_', '');
        
        // Re-run the search with the selected type
        const command = require('./rlookup');
        const fakeInteraction = {
            options: {
                getString: (name) => {
                    if (name === 'query') return query;
                    if (name === 'type') return searchType;
                    return null;
                },
                getInteger: (name) => {
                    if (name === 'limit') return 10;
                    return null;
                }
            },
            deferReply: () => Promise.resolve(),
            editReply: (content) => interaction.editReply(content)
        };
        
        await command.execute(fakeInteraction);
    }
};