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