const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rhistory')
        .setDescription('Check Roblox ban history for a user')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('Roblox User ID to check ban history for')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();
        
        const userId = interaction.options.getString('userid');
        const API_KEY = process.env.ROBLOX_API_KEY;
        const UNIVERSE_ID = process.env.UNIVERSE_ID;

        try {
            // Fetch ban history from Roblox API
            const response = await fetch(`https://apis.roblox.com/cloud/v2/universes/${UNIVERSE_ID}/user-restrictions/${userId}/logs`, {
                method: 'GET',
                headers: {
                    'x-api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return interaction.editReply('❌ No ban history found for this user, or the user does not exist.');
                }
                throw new Error(`API returned ${response.status}: ${response.statusText}`);
            }

            const historyData = await response.json();
            
            if (!historyData.logs || historyData.logs.length === 0) {
                return interaction.editReply('✅ No ban history found for this user.');
            }

            // Create embed with ban history
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🔍 Ban History for User ID: ${userId}`)
                .setDescription(`Found ${historyData.logs.length} moderation action(s)`)
                .setTimestamp();

            // Add each ban entry to the embed
            historyData.logs.forEach((log, index) => {
                const actionType = log.gameJoinRestriction?.active ? '🔨 BAN' : '🔓 UNBAN';
                const duration = log.gameJoinRestriction?.duration ? 
                    `${parseInt(log.gameJoinRestriction.duration) / 60} minutes` : 'Permanent';
                
                const reason = log.gameJoinRestriction?.privateReason || 'No reason provided';
                const timestamp = new Date(log.gameJoinRestriction?.startTime || log.updateTime).toLocaleDateString();

                embed.addFields({
                    name: `${actionType} - ${timestamp}`,
                    value: `**Duration:** ${duration}\n**Reason:** ${reason}\n**Type:** ${log.gameJoinRestriction?.inherited ? 'Inherited (Alt Account)' : 'Direct'}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Ban history check error:', error);
            await interaction.editReply('❌ Failed to retrieve ban history. Please check the User ID and try again.');
        }
    }
};