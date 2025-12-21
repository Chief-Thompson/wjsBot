const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banhistory')
        .setDescription('Check the Roblox ban history of a specific user by userId.')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The Roblox userId to check')
                .setRequired(true)
        ),
    async execute(interaction) {
        const userId = interaction.options.getString('userid');
        const universeId = process.env.UNIVERSE_ID;
        const apiKey = process.env.ROBLOX_API_KEY;

        // Track if we've successfully replied
        let hasReplied = false;
        
        try {
            // Check if interaction is too old (over 14 minutes)
            const MAX_INTERACTION_AGE = 14 * 60 * 1000; // 14 minutes (safety margin)
            if (Date.now() - interaction.createdTimestamp > MAX_INTERACTION_AGE) {
                try {
                    await interaction.reply({
                        content: '❌ This command took too long to process. Please try again.',
                        ephemeral: true
                    });
                } catch (replyError) {
                    console.log(`Could not send timeout message for banhistory:`, replyError.message);
                }
                return;
            }

            // Defer the reply first
            try {
                await interaction.deferReply();
                hasReplied = true;
            } catch (error) {
                console.log('Failed to defer reply:', error.message);
                return;
            }

            // Send initial message about fetching with safe edit
            await this.safeEditReply(interaction, {
                content: `⏳ Fetching ban history for user ID \`${userId}\`. This may take up to a minute for users with extensive history...`
            });

            try {
                let currentStatusEmbed = null;
                let historyEmbed = null;
                
                // Run current status check first (fast)
                try {
                    const currentResponse = await axios.get(
                        `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
                        { 
                            headers: { 
                                'x-api-key': apiKey, 
                                'Content-Type': 'application/json' 
                            },
                            timeout: 10000
                        }
                    );

                    const restriction = currentResponse.data?.gameJoinRestriction;
                    if (restriction?.active) {
                        const reason = restriction.displayReason || 'No reason provided';
                        const modDid = restriction.privateReason || "Not found";
                        
                        currentStatusEmbed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle(`🔴 CURRENTLY BANNED - User ID: ${userId}`)
                            .addFields(
                                { name: 'Status', value: 'Active Ban', inline: true },
                                { name: 'Start Time', value: restriction.startTime || 'Unknown', inline: true },
                                { name: 'Duration', value: restriction.duration || 'Unknown', inline: true },
                                { name: 'Reason', value: reason, inline: false },
                                { name: 'Moderator', value: modDid, inline: false },
                            )
                            .setTimestamp();
                    } else {
                        currentStatusEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`🟢 CURRENT STATUS - User ID: ${userId}`)
                            .setDescription('No active ban on this user')
                            .setTimestamp();
                    }
                } catch (err) {
                    console.log('❌ Current ban check failed:', err.response?.status, err.message);
                    currentStatusEmbed = new EmbedBuilder()
                        .setColor(0xFFFF00)
                        .setTitle(`🟡 CURRENT STATUS - User ID: ${userId}`)
                        .setDescription('Could not fetch current ban status')
                        .setTimestamp();
                }
                
                // Update with current status while we fetch history
                await this.safeEditReply(interaction, {
                    content: `⏳ Currently fetching historical logs for user ID \`${userId}\`. This may take up to a minute...`,
                    embeds: currentStatusEmbed ? [currentStatusEmbed] : []
                });

                // --- NEW APPROACH: Fetch logs with progress updates ---
                try {
                    let allLogs = [];
                    let nextPageToken = null;
                    let pageCount = 0;
                    const maxPages = 50; // Increased for more thorough search
                    const startTime = Date.now();
                    const timeoutMs = 90000; // 90 second timeout total
                    
                    console.log(`Starting historical logs fetch for user ${userId}`);
                    
                    do {
                        // Check if we're taking too long
                        if (Date.now() - startTime > timeoutMs) {
                            console.log('Timeout reached during logs fetch');
                            throw new Error('Fetch timeout after 90 seconds');
                        }
                        
                        // Update progress every 3 pages
                        if (pageCount > 0 && pageCount % 3 === 0) {
                            await this.safeEditReply(interaction, {
                                content: `⏳ Still fetching... Processed ${pageCount} pages, found ${allLogs.length} total logs so far for user ID \`${userId}\`.`,
                                embeds: currentStatusEmbed ? [currentStatusEmbed] : []
                            });
                        }
                        
                        const params = { 
                            maxPageSize: 100, // Maximum allowed
                        };
                        
                        if (nextPageToken) {
                            params.pageToken = nextPageToken;
                        }
                        
                        console.log(`Fetching page ${pageCount + 1} for user ${userId}`);

                        const logsResponse = await axios.get(
                            `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions:listLogs`,
                            {
                                headers: { 
                                    'x-api-key': apiKey, 
                                    'Content-Type': 'application/json' 
                                },
                                params: params,
                                timeout: 30000 // 30 seconds per request
                            }
                        );

                        // Filter logs for this specific user from this page
                        if (logsResponse.data.logs && logsResponse.data.logs.length > 0) {
                            const userLogsFromPage = logsResponse.data.logs.filter(log => {
                                if (!log.user) return false;
                                // Extract user ID from the user field (format: "users/{userId}")
                                const logUserId = log.user.split('/').pop();
                                return logUserId === userId;
                            });
                            
                            if (userLogsFromPage.length > 0) {
                                console.log(`Found ${userLogsFromPage.length} logs for user ${userId} on page ${pageCount + 1}`);
                                allLogs = allLogs.concat(userLogsFromPage);
                            }
                        }

                        // Check for next page
                        nextPageToken = logsResponse.data.nextPageToken || null;
                        pageCount++;
                        
                        // Optional: Add a small delay between requests to avoid rate limiting
                        if (nextPageToken && pageCount < maxPages) {
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }

                    } while (nextPageToken && pageCount < maxPages);
                    
                    console.log(`Finished fetching logs for user ${userId}. Total pages: ${pageCount}, User logs found: ${allLogs.length}`);

                    if (allLogs.length > 0) {
                        // Sort logs by timestamp (newest first)
                        allLogs.sort((a, b) => {
                            const timeA = new Date(a.restrictionType?.gameJoinRestriction?.startTime || a.createTime);
                            const timeB = new Date(b.restrictionType?.gameJoinRestriction?.startTime || b.createTime);
                            return timeB - timeA;
                        });

                        historyEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setTitle(`📜 Ban History - User ID: ${userId}`)
                            .setDescription(`Found **${allLogs.length}** historical moderation action(s) after searching ${pageCount} pages`)
                            .setTimestamp();

                        // Display up to 15 entries
                        const displayLogs = allLogs.slice(0, 15);
                        
                        displayLogs.forEach((log, index) => {
                            const erestriction = log.restrictionType?.gameJoinRestriction || {};
                            const actionType = log.active ? '🔨 BANNED' : '🔓 UNBANNED';
                            const duration = log.duration && log.duration !== '0s'
                                ? `${Math.round(parseInt(erestriction.duration) / 60)} minutes`
                                : 'Permanent';
                            
                            const reason = log.displayReason ||'No reason provided';
                            const staffM = log.privateReason || 'Unable to detect';
                            const timestamp = new Date(erestriction.startTime || log.createTime).toLocaleString();

                            historyEmbed.addFields({
                                name: `Entry ${index + 1} - ${actionType}`,
                                value: `**Time:** ${timestamp}\n**Duration:** ${duration}\n**Reason:** ${reason}\n**Moderator:** ${staffM}`,
                                inline: false
                            });
                        });

                        if (allLogs.length > 15) {
                            historyEmbed.addFields({
                                name: 'Note',
                                value: `Showing 15 most recent of ${allLogs.length} total entries${pageCount >= maxPages ? ' (page limit reached)' : ''}`,
                                inline: false
                            });
                        }
                    } else {
                        // Check if we actually fetched any logs at all
                        if (pageCount > 0) {
                            historyEmbed = new EmbedBuilder()
                                .setColor(0x666666)
                                .setTitle(`📜 Ban History - User ID: ${userId}`)
                                .setDescription(`No historical ban records found after searching ${pageCount} pages`)
                                .setTimestamp();
                        } else {
                            throw new Error('No pages were fetched');
                        }
                    }
                    
                } catch (logsErr) {
                    console.log('❌ Historical logs fetch failed:', logsErr.message);
                    historyEmbed = new EmbedBuilder()
                        .setColor(0xFFA500)
                        .setTitle(`📜 Ban History - User ID: ${userId}`)
                        .setDescription('Failed to fetch historical ban logs. This could be due to:\n• Timeout (90 seconds)\n• Rate limiting\n• No permissions\n• User has no ban history')
                        .addFields(
                            { name: 'Error', value: logsErr.message || 'Unknown error', inline: false }
                        )
                        .setTimestamp();
                }

                // --- Final reply ---
                const embeds = [];
                if (currentStatusEmbed) embeds.push(currentStatusEmbed);
                if (historyEmbed) embeds.push(historyEmbed);

                if (embeds.length > 0) {
                    await this.safeEditReply(interaction, { 
                        content: `✅ Completed ban history lookup for user ID \`${userId}\``,
                        embeds: embeds 
                    });
                } else {
                    await this.safeEditReply(interaction, {
                        content: `❌ No ban information could be retrieved for user ID \`${userId}\`.`
                    });
                }

            } catch (error) {
                console.error('Unexpected error in banhistory command:', error);
                await this.safeEditReply(interaction, `❌ Unexpected error: ${error.message}`);
            }

        } catch (outerError) {
            console.error('Critical error in banhistory command:', outerError);
            // Last resort - try to send a message if we have the channel
            if (!hasReplied && interaction.channel) {
                try {
                    await interaction.channel.send({
                        content: `❌ Failed to fetch ban history for user ID \`${userId}\`. The command encountered an error.`
                    });
                } catch (channelError) {
                    console.error('Could not send error to channel:', channelError);
                }
            }
        }
    },

    // Helper method to safely edit replies
    async safeEditReply(interaction, options) {
        try {
            if (typeof options === 'string') {
                options = { content: options };
            }
            
            if (interaction.replied || interaction.deferred) {
                return await interaction.editReply(options);
            } else {
                return await interaction.reply(options);
            }
        } catch (error) {
            // Handle Discord API errors
            if (error.code === 10008) { // Unknown Message - original message was deleted
                console.log('Original interaction message was deleted or expired for banhistory command');
                
                // Try to send a new follow-up message
                try {
                    const followUpOptions = typeof options === 'string' ? { content: options } : options;
                    return await interaction.followUp({
                        ...followUpOptions,
                        ephemeral: true
                    });
                } catch (followUpError) {
                    console.error('Could not send follow-up for banhistory:', followUpError.message);
                    
                    // Last resort - try to send to channel
                    if (interaction.channel) {
                        try {
                            const embed = followUpOptions.embeds ? { embeds: followUpOptions.embeds } : {};
                            if (followUpOptions.content) {
                                return await interaction.channel.send({
                                    content: followUpOptions.content,
                                    ...embed
                                });
                            }
                        } catch (channelError) {
                            console.error('Could not send to channel:', channelError.message);
                        }
                    }
                }
            } else if (error.code === 10003) { // Unknown Channel - channel was deleted
                console.log('Channel was deleted for banhistory command');
            } else if (error.code === 50001) { // Missing Access
                console.log('Bot lacks access to the channel for banhistory command');
            } else {
                // Re-throw other errors
                throw error;
            }
        }
        return null;
    }
};

/*

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banhistory')
        .setDescription('Check the Roblox ban history of a specific user by userId.')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('The Roblox userId to check')
                .setRequired(true)
        ),
    async execute(interaction) {
        const userId = interaction.options.getString('userid');
        const universeId = process.env.UNIVERSE_ID;
        const apiKey = process.env.ROBLOX_API_KEY;

        await interaction.deferReply();

        try {
            // --- 1. Check current ban status ---
            let currentStatusEmbed = null;
            try {
                const currentResponse = await axios.get(
                    `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
                    { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
                );

                const restriction = currentResponse.data?.gameJoinRestriction;
                if (restriction?.active) {
                    // Use privateReason first, fallback to displayReason
                    const reason = restriction.displayReason || 'No reason provided';
                    const modDid = restriction.privateReason || "Not found"
                    
                    currentStatusEmbed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle(`🔴 CURRENTLY BANNED - User ID: ${userId}`)
                        .addFields(
                            { name: 'Status', value: 'Active Ban', inline: true },
                            { name: 'Start Time', value: restriction.startTime || 'Unknown', inline: true },
                            { name: 'Duration', value: restriction.duration || 'Unknown', inline: true },
                            { name: 'Reason', value: reason, inline: false },
                            { name: 'Moderator', value: modDid, inline: false },
                        )
                        .setTimestamp();
                } else {
                    currentStatusEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle(`🟢 CURRENT STATUS - User ID: ${userId}`)
                        .setDescription('No active ban on this user')
                        .setTimestamp();
                }
            } catch (err) {
                console.log('❌ Current ban check failed:', err.response?.status, err.response?.data);
                currentStatusEmbed = new EmbedBuilder()
                    .setColor(0xFFFF00)
                    .setTitle(`🟡 CURRENT STATUS - User ID: ${userId}`)
                    .setDescription('Could not fetch current ban status')
                    .setTimestamp();
            }

            // --- 2. Fetch historical ban logs WITH PAGINATION ---
            let historyEmbed = null;
            try {
                let allLogs = [];
                let nextPageToken = null;

                do {
                    const params = { maxPageSize: 25 };
                    if (nextPageToken) {
                        params.pageToken = nextPageToken;
                    }

                    const logsResponse = await axios.get(
                        `https://apis.roblox.com/cloud/v2/universes/${universeId}/user-restrictions:listLogs`,
                        {
                            headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
                            params: params
                        }
                    );

                    // Add logs from current page to collection
                    if (logsResponse.data.logs) {
                        allLogs = allLogs.concat(logsResponse.data.logs);
                    }

                    // Check for next page
                    nextPageToken = logsResponse.data.nextPageToken || null;

                } while (nextPageToken);

                // Filter logs for the specific user
                const userLogs = allLogs.filter(log => {
                    if (!log.user) return false;
                    const logUserId = log.user.split('/').pop();
                    return logUserId === userId;
                }) || [];

                if (userLogs.length > 0) {
                    historyEmbed = new EmbedBuilder()
                        .setColor(0x0099FF)
                        .setTitle(`📜 Ban History - User ID: ${userId}`)
                        .setDescription(`Found **${userLogs.length}** historical moderation action(s) across all pages`)
                        .setTimestamp();

                    // Sort logs by timestamp (newest first)
                    userLogs.sort((a, b) => new Date(b.createTime || b.restrictionType?.gameJoinRestriction?.startTime) - new Date(a.createTime || a.restrictionType?.gameJoinRestriction?.startTime));

                    // Limit to 15 most recent entries to avoid Discord embed limits
                    const displayLogs = userLogs.slice(0, 15);
                    
                    displayLogs.forEach((log, index) => {
                        const erestriction = log.restrictionType?.gameJoinRestriction || {};
                        const actionType = log.active ? '🔨 BANNED' : '🔓 UNBANNED';
                        const duration = log.duration && log.duration !== '0s'
                            ? `${Math.round(parseInt(log.duration) / 60)} minutes`
                            : 'Permanent';
                        
                        // FIXED: Use privateReason first, then displayReason as fallback
                        const reason = log.displayReason ||'No reason provided';
                        const staffM = log.privateReason || 'Unable to detect';
                        const timestamp = new Date(erestriction.startTime || log.createTime).toLocaleString();

                        historyEmbed.addFields({
                            name: `Entry ${index + 1} - ${actionType}`,
                            value: `**Time:** ${timestamp}\n**Duration:** ${duration}\n**Reason:** ${reason}\n** Moderator:** ${staffM}`,
                            inline: false
                        });
                    });

                    // Add note if some entries were truncated
                    if (userLogs.length > 15) {
                        historyEmbed.addFields({
                            name: 'Note',
                            value: `Showing 15 most recent of ${userLogs.length} total entries`,
                            inline: false
                        });
                    }
                } else {
                    historyEmbed = new EmbedBuilder()
                        .setColor(0x666666)
                        .setTitle(`📜 Ban History - User ID: ${userId}`)
                        .setDescription('No historical ban records found')
                        .setTimestamp();
                }
            } catch (logsErr) {
                console.log('❌ Historical logs fetch failed:', logsErr.response?.status, logsErr.response?.data);
                historyEmbed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle(`📜 Ban History - User ID: ${userId}`)
                    .setDescription('Failed to fetch historical ban logs')
                    .setTimestamp();
            }

            // --- 3. Reply with embeds ---
            const embeds = [];
            if (currentStatusEmbed) embeds.push(currentStatusEmbed);
            if (historyEmbed) embeds.push(historyEmbed);

            if (embeds.length > 0) {
                await interaction.editReply({ embeds: embeds });
            } else {
                await interaction.editReply({
                    content: `❌ No ban information could be retrieved for user ID \`${userId}\`.`
                });
            }

        } catch (error) {
            console.error('Unexpected error:', error);
            await interaction.editReply(`❌ Unexpected error: ${error.message}`);
        }
    }
};
*/ 