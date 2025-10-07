const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBanHistory } = require('../ban.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rhistory')
        .setDescription('Check Roblox ban history for a user')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('Roblox User ID to check ban history for')
                .setRequired(true)),

    async execute(interaction) {
        const staffRoleId = process.env.BAN_ROLE_ID;
        if (!interaction.member.roles.cache.has(staffRoleId)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const userId = interaction.options.getString('userid');
        
        await interaction.deferReply();

        try {
            // Fetch user info for display
            let username = 'Unknown';
            try {
                const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    username = userData.name;
                }
            } catch (error) {
                console.log('Could not fetch user data, continuing with history check...');
            }

            // Get ban history
            const historyData = await getBanHistory(userId);
            
            if (!historyData.logs || historyData.logs.length === 0) {
                return interaction.editReply(`✅ No ban history found for user **${username}** (${userId}).`);
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🔍 Ban History - ${username}`)
                .setDescription(`User ID: **${userId}**\nFound **${historyData.logs.length}** moderation action(s)`)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`)
                .setTimestamp();

            // Process and display each log entry
            historyData.logs.forEach((log, index) => {
                const restriction = log.gameJoinRestriction;
                if (!restriction) return;

                const actionType = restriction.active ? '🔨 BANNED' : '🔓 UNBANNED';
                const duration = restriction.duration ? 
                    `${Math.round(parseInt(restriction.duration) / 60)} minutes` : 'Permanent';
                
                const reason = restriction.privateReason || 'No reason provided';
                const timestamp = new Date(restriction.startTime || log.updateTime).toLocaleString();

                let fieldValue = `**Action:** ${actionType}\n`;
                fieldValue += `**Time:** ${timestamp}\n`;
                fieldValue += `**Duration:** ${duration}\n`;
                fieldValue += `**Reason:** ${reason}`;
                
                if (restriction.excludeAltAccounts) {
                    fieldValue += `\n**Alt Accounts:** Included in ban`;
                }

                embed.addFields({
                    name: `Entry ${index + 1}`,
                    value: fieldValue,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Ban history check error:', error);
            await interaction.editReply(`❌ Failed to retrieve ban history: ${error.message}`);
        }
    }
};