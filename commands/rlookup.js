const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const axios = require('axios');

// Helper function for fuzzy matching
function getFuzzyMatches(query, items, property = 'displayName', threshold = 0.7) {
    const normalizedQuery = query.toLowerCase();
    const results = [];
    
    for (const item of items) {
        const itemValue = item[property].toLowerCase();
        
        // Exact match check
        if (itemValue === normalizedQuery) {
            results.push({ ...item, score: 1.0 });
            continue;
        }
        
        // Contains check
        if (itemValue.includes(normalizedQuery) || normalizedQuery.includes(itemValue)) {
            results.push({ ...item, score: 0.9 });
            continue;
        }
        
        // Starts with check
        if (itemValue.startsWith(normalizedQuery) || normalizedQuery.startsWith(itemValue)) {
            results.push({ ...item, score: 0.8 });
            continue;
        }
        
        // Simple Levenshtein distance for fuzzy matching
        const distance = levenshteinDistance(itemValue, normalizedQuery);
        const maxLength = Math.max(itemValue.length, normalizedQuery.length);
        const similarity = 1 - (distance / maxLength);
        
        if (similarity >= threshold) {
            results.push({ ...item, score: similarity });
        }
    }
    
    // Sort by score (highest first)
    return results.sort((a, b) => b.score - a.score).map(item => {
        const { score, ...rest } = item;
        return rest;
    });
}

// Simple Levenshtein distance implementation
function levenshteinDistance(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    
    return matrix[b.length][a.length];
}

async function smartUserSearch(query, limit = 15) {
    const isNumeric = /^\d+$/.test(query);
    let exactMatch = null;
    let displayNameMatches = [];
    let usernameMatches = [];
    
    try {
        // Always search by username first (most reliable)
        try {
            const searchResponse = await axios.get(
                `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(query)}&limit=50`
            );
            
            const allUsers = searchResponse.data.data || [];
            
            // Try to find exact matches first
            const exactUsernameMatch = allUsers.find(u => 
                u.name.toLowerCase() === query.toLowerCase()
            );
            
            const exactDisplayNameMatch = allUsers.find(u => 
                u.displayName.toLowerCase() === query.toLowerCase()
            );
            
            // Prioritize exact username match over display name match
            if (exactUsernameMatch) {
                exactMatch = {
                    ...exactUsernameMatch,
                    profileUrl: `https://www.roblox.com/users/${exactUsernameMatch.id}/profile`,
                    matchType: 'username'
                };
            } else if (exactDisplayNameMatch) {
                exactMatch = {
                    ...exactDisplayNameMatch,
                    profileUrl: `https://www.roblox.com/users/${exactDisplayNameMatch.id}/profile`,
                    matchType: 'displayname'
                };
            }
            
            // Get all users for fuzzy matching
            const allFormattedUsers = allUsers.map(user => ({
                id: user.id,
                name: user.name,
                displayName: user.displayName,
                hasVerifiedBadge: user.hasVerifiedBadge || false,
                profileUrl: `https://www.roblox.com/users/${user.id}/profile`
            }));
            
            // Apply fuzzy matching for display names
            const fuzzyDisplayMatches = getFuzzyMatches(query, allFormattedUsers, 'displayName', 0.5);
            
            // Also get username matches (fuzzy)
            const fuzzyUsernameMatches = getFuzzyMatches(query, allFormattedUsers, 'name', 0.5);
            
            // Combine and deduplicate matches
            const allMatches = [...fuzzyDisplayMatches, ...fuzzyUsernameMatches];
            const uniqueMatches = [];
            const seenIds = new Set();
            
            for (const match of allMatches) {
                if (!seenIds.has(match.id) && (!exactMatch || match.id !== exactMatch.id)) {
                    seenIds.add(match.id);
                    uniqueMatches.push(match);
                }
            }
            
            // Limit results
            displayNameMatches = uniqueMatches.slice(0, limit);
            
        } catch (searchErr) {
            console.error('Search API error:', searchErr.message);
        }
        
        // If query is numeric and we haven't found a match, try direct user ID lookup
        if (isNumeric && !exactMatch) {
            try {
                const userResponse = await axios.get(`https://users.roblox.com/v1/users/${query}`);
                exactMatch = {
                    id: userResponse.data.id,
                    name: userResponse.data.name,
                    displayName: userResponse.data.displayName,
                    hasVerifiedBadge: userResponse.data.hasVerifiedBadge || false,
                    profileUrl: `https://www.roblox.com/users/${userResponse.data.id}/profile`,
                    matchType: 'userid'
                };
            } catch (err) {
                // User ID not found, that's okay
            }
        }
        
        return {
            exactMatch,
            displayNameMatches: displayNameMatches.slice(0, limit)
        };
        
    } catch (error) {
        console.error('Roblox search error:', error);
        return { exactMatch: null, displayNameMatches: [] };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rlookup')
        .setDescription('Look up Roblox user by username, display name, or ID (fuzzy search)')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Username, display name, or user ID (case-insensitive)')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Number of results to show (default: 10, max: 25)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(25)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim();
        const limit = interaction.options.getInteger('limit') || 10;

        try {
            const { exactMatch, displayNameMatches } = await smartUserSearch(query, limit);

            // Handle no results
            if (!exactMatch && displayNameMatches.length === 0) {
                return interaction.editReply(`❌ No Roblox users found matching: **${query}**\n*Try a different spelling or search term.*`);
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('🔍 Roblox User Lookup')
                .setDescription(`**Search:** ${query}`)
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
                
                embed.addFields({
                    name: `${matchEmoji} ${matchType}`,
                    value: `**${exactMatch.displayName}** (@${exactMatch.name})\n**ID:** \`${exactMatch.id}\` • **Verified:** ${exactMatch.hasVerifiedBadge ? '✅' : '❌'}\n[View Profile](${exactMatch.profileUrl})`,
                    inline: false
                });
                
                // Get avatar thumbnail
                try {
                    const avatarResponse = await axios.get(
                        `https://thumbnails.roblox.com/v1/users/avatar?userIds=${exactMatch.id}&size=420x420&format=Png&isCircular=false`
                    );
                    if (avatarResponse.data.data && avatarResponse.data.data[0]) {
                        embed.setThumbnail(avatarResponse.data.data[0].imageUrl);
                    }
                } catch (err) {
                    // If avatar fails, try the bust image
                    try {
                        const bustResponse = await axios.get(
                            `https://thumbnails.roblox.com/v1/users/avatar-bust?userIds=${exactMatch.id}&size=150x150&format=Png&isCircular=false`
                        );
                        if (bustResponse.data.data && bustResponse.data.data[0]) {
                            embed.setThumbnail(bustResponse.data.data[0].imageUrl);
                        }
                    } catch (bustErr) {
                        // Both failed, continue without thumbnail
                    }
                }
            }

            // Add other matches section
            if (displayNameMatches.length > 0) {
                let matchResults = '';
                const maxEmbedResults = 8; // Keep embed readable
                const showMatches = displayNameMatches.slice(0, maxEmbedResults);
                
                showMatches.forEach((user, index) => {
                    const verifiedBadge = user.hasVerifiedBadge ? ' ✅' : '';
                    matchResults += `${index + 1}. **${user.displayName}**${verifiedBadge} (@${user.name})\n   **ID:** \`${user.id}\` • [Profile](${user.profileUrl})\n`;
                });

                // Add note if there are more results
                if (displayNameMatches.length > maxEmbedResults) {
                    matchResults += `\n*... and ${displayNameMatches.length - maxEmbedResults} more fuzzy matches*`;
                }

                const matchType = exactMatch ? 'Similar Matches' : 'Fuzzy Matches';
                embed.addFields({
                    name: `🔍 ${matchType} (${displayNameMatches.length})`,
                    value: matchResults || 'No additional matches found.',
                    inline: false
                });
            }

            // Add result count to footer
            const totalResults = (exactMatch ? 1 : 0) + displayNameMatches.length;
            embed.setFooter({ 
                text: `Found ${totalResults} result(s) • Searched: "${query}" (case-insensitive)` 
            });

            // Add select menu if we have multiple results
            const components = [];
            if (displayNameMatches.length > 0) {
                const options = displayNameMatches.slice(0, 25).map((user, index) => ({
                    label: `${user.displayName.length > 20 ? user.displayName.substring(0, 20) + '...' : user.displayName}`,
                    value: user.id.toString(),
                    description: `@${user.name}`,
                    emoji: ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'][index] || '👤'
                }));

                if (options.length > 0) {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('user_select')
                        .setPlaceholder('Quick lookup another user...')
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
            return interaction.editReply('❌ There was an error looking up Roblox users. Please try again later.');
        }
    }
};