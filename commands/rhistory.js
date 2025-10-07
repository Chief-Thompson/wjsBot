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
            const historyData = await getBanHistory(userId);
            
            if (!historyData.logs || historyData.logs.length === 0) {
                return interaction.editReply(`✅ No ban history found for user ID **${userId}**.`);
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`🔍 Ban History`)
                .setDescription(`User ID: **${userId}**\nFound **${historyData.logs.length}** moderation action(s)`)
                .setTimestamp();

            historyData.logs.forEach((log, index) => {
                const restriction = log.gameJoinRestriction;
                if (!restriction) return;

                const actionType = restriction.active ? '🔨 BANNED' : '🔓 UNBANNED';
                const duration = restriction.duration && restriction.duration !== '0s' ? 
                    `${Math.round(parseInt(restriction.duration) / 60)} minutes` : 'Permanent';
                
                const reason = restriction.privateReason || 'No reason provided';
                const timestamp = new Date(restriction.startTime || log.updateTime).toLocaleString();

                let fieldValue = `**Action:** ${actionType}\n`;
                fieldValue += `**Time:** ${timestamp}\n`;
                fieldValue += `**Duration:** ${duration}\n`;
                fieldValue += `**Reason:** ${reason}`;

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
