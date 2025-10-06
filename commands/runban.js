const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { unbanUser } = require('../ban.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('runban')
        .setDescription('Unban a Roblox user by ID')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('Roblox user ID')
                .setRequired(true)),

    async execute(interaction) {
        const staffRoleId = process.env.BAN_ROLE_ID;
        if (!interaction.member.roles.cache.has(staffRoleId)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const userId = interaction.options.getString('userid');
        const LOG_CHANNEL_ID = '1420940072278032424';
        
        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch user data for logging
            let username = 'Unknown';
            try {
                const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
                if (userResponse.ok) {
                    const userData = await userResponse.json();
                    username = userData.name;
                }
            } catch (error) {
                console.log('Could not fetch user data for logging, continuing with unban...');
            }

            // Implement retry logic for unban
            const maxRetries = 3;
            let lastError;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await unbanUser(userId);
                    
                    // Success response to user
                    await interaction.editReply(`✅ Successfully unbanned user ID **${userId}**.`);
                    
                    // Send unban log to log channel
                    const logEmbed = new EmbedBuilder()
                        .setColor(0x00FF00)
                        .setTitle('🔓 User Unbanned')
                        .setDescription(`A user has been unbanned from the Roblox game.`)
                        .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`)
                        .addFields(
                            { name: '👤 Username', value: `[${username}](https://www.roblox.com/users/${userId}/profile)`, inline: true },
                            { name: '🆔 User ID', value: userId, inline: true },
                            { name: '🛠️ Moderator', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                            { name: '📅 Unbanned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setFooter({ text: 'Ban Log System', iconURL: interaction.client.user.displayAvatarURL() })
                        .setTimestamp();

                    // Send to log channel
                    const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        await logChannel.send({ embeds: [logEmbed] });
                    } else {
                        console.error('Log channel not found!');
                    }
                    
                    return; // Exit function on success
                    
                } catch (err) {
                    lastError = err;
                    if (err.message.includes('RESOURCE_EXHAUSTED') && attempt < maxRetries) {
                        const waitTime = Math.pow(2, attempt) * 1000;
                        console.log(`Unban rate limited for user ${userId}. Retrying in ${waitTime}ms...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue;
                    } else {
                        break;
                    }
                }
            }
            throw lastError;

        } catch (err) {
            console.error(err);
            await interaction.editReply(`❌ Failed to unban user: ${err.message}`);
        }
    }
};