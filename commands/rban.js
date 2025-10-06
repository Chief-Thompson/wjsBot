const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { banUser } = require('../ban.js');
const { filterBanReason } = require('../filters.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rban')
        .setDescription('Ban a Roblox user by User ID')
        .addStringOption(option =>
            option.setName('userid')
                .setDescription('Roblox User ID to ban')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in minutes (0 for permanent)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for ban')
                .setRequired(true)),

    async execute(interaction) {
        const staffRoleId = process.env.BAN_ROLE_ID;
        if (!interaction.member.roles.cache.has(staffRoleId)) {
            return interaction.reply({ content: '❌ You do not have permission to use this command.', ephemeral: true });
        }

        const userId = interaction.options.getString('userid');
        const durationMinutes = interaction.options.getInteger('duration');
        let reason = interaction.options.getString('reason');
        const LOG_CHANNEL_ID = '1420940072278032424';

        // 🛡️ FILTER THE REASON FIRST
        const filtered = filterBanReason(reason);
        
        // If issues found, show warning and get confirmation
        if (!filtered.isSafe) {
            const warningEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⚠️ Content Filter Alert')
                .setDescription('Your ban reason contained content that was automatically filtered:')
                .addFields(
                    { name: 'Issues Found', value: filtered.issues.join('\n') || 'Content requires filtering', inline: false },
                    { name: 'Original Reason', value: reason.length > 100 ? reason.substring(0, 100) + '...' : reason, inline: false },
                    { name: 'Filtered Reason', value: filtered.filteredReason, inline: false }
                )
                .setFooter({ text: 'Inappropriate words are replaced with ####' });

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_filtered')
                .setLabel('✅ Use Filtered Reason')
                .setStyle(ButtonStyle.Primary);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_ban')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            // Send initial reply
            await interaction.reply({
                embeds: [warningEmbed],
                components: [row],
                ephemeral: true
            });

            try {
                const confirmation = await interaction.fetchReply().then(() => 
                    interaction.channel.awaitMessageComponent({
                        filter: (i) => i.user.id === interaction.user.id && i.message.interaction?.id === interaction.id,
                        time: 30000
                    })
                );

                if (confirmation.customId === 'confirm_filtered') {
                    reason = filtered.filteredReason;
                    await confirmation.update({ 
                        content: '✅ Using filtered reason. Loading user information...',
                        embeds: [],
                        components: [] 
                    });
                    // Continue to main ban confirmation
                    await this.showBanConfirmation(interaction, userId, durationMinutes, reason, LOG_CHANNEL_ID);
                } else {
                    await confirmation.update({ 
                        content: '❌ Ban cancelled.',
                        embeds: [],
                        components: [] 
                    });
                }
            } catch (error) {
                await interaction.editReply({ 
                    content: '❌ Ban cancelled - no response received.',
                    embeds: [],
                    components: [] 
                });
            }
        } else {
            // If reason is safe, go directly to ban confirmation
            await this.showBanConfirmation(interaction, userId, durationMinutes, reason, LOG_CHANNEL_ID);
        }
    },

    async showBanConfirmation(interaction, userId, durationMinutes, reason, LOG_CHANNEL_ID) {
        try {
            // Fetch Roblox user data
            const userResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
            if (!userResponse.ok) {
                if (interaction.replied) {
                    await interaction.followUp({ content: '❌ Invalid Roblox User ID.', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ Invalid Roblox User ID.', ephemeral: true });
                }
                return;
            }

            const userData = await userResponse.json();
            
            // Create confirmation embed
            const confirmEmbed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('🚨 Confirm Roblox Ban')
                .setDescription(`Please confirm you want to ban this user:`)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`)
                .addFields(
                    { name: '👤 Username', value: userData.name || 'Unknown', inline: true },
                    { name: '🆔 User ID', value: userId, inline: true },
                    { name: '⏰ Duration', value: durationMinutes === 0 ? 'Permanent' : `${durationMinutes} minutes`, inline: true },
                    { name: '📝 Reason', value: reason || 'No reason provided' }
                )
                .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            const confirmButton = new ButtonBuilder()
                .setCustomId('confirm_ban')
                .setLabel('✅ Confirm Ban')
                .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_ban')
                .setLabel('❌ Cancel')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder()
                .addComponents(confirmButton, cancelButton);

            // Send confirmation message
            let confirmationMessage;
            if (interaction.replied) {
                confirmationMessage = await interaction.followUp({
                    embeds: [confirmEmbed],
                    components: [row],
                    ephemeral: false
                });
            } else {
                confirmationMessage = await interaction.reply({
                    embeds: [confirmEmbed],
                    components: [row],
                    ephemeral: false,
                    fetchReply: true
                });
            }

            // Handle confirmation
            try {
                const confirmation = await confirmationMessage.awaitMessageComponent({
                    filter: (i) => i.user.id === interaction.user.id,
                    time: 30000
                });

                if (confirmation.customId === 'confirm_ban') {
                    await this.executeBan(confirmation, userId, userData, durationMinutes, reason, LOG_CHANNEL_ID);
                } else {
                    await confirmation.update({
                        content: '❌ Ban cancelled.',
                        embeds: [],
                        components: []
                    });
                }

            } catch (error) {
                if (interaction.replied) {
                    await interaction.editReply({
                        content: '⏰ Ban confirmation timed out.',
                        embeds: [],
                        components: []
                    });
                } else {
                    await interaction.reply({
                        content: '⏰ Ban confirmation timed out.',
                        ephemeral: true
                    });
                }
            }

        } catch (error) {
            console.error('Error in ban confirmation:', error);
            if (interaction.replied) {
                await interaction.followUp({ 
                    content: `❌ Error: ${error.message}`, 
                    ephemeral: true 
                });
            } else {
                await interaction.reply({ 
                    content: `❌ Error: ${error.message}`, 
                    ephemeral: true 
                });
            }
        }
    },

    async executeBan(interaction, userId, userData, durationMinutes, reason, LOG_CHANNEL_ID) {
        try {
            await interaction.deferUpdate();
            
            // Execute the ban
            await banUser(userId, reason, durationMinutes, interaction.user.tag);
            
            // Success embed
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Ban Successful')
                .setDescription(`Roblox user has been banned.`)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`)
                .addFields(
                    { name: '👤 Username', value: userData.name || 'Unknown', inline: true },
                    { name: '🆔 User ID', value: userId, inline: true },
                    { name: '⏰ Duration', value: durationMinutes === 0 ? 'Permanent' : `${durationMinutes} minutes`, inline: true },
                    { name: '📝 Reason', value: reason || 'No reason provided' }
                )
                .setFooter({ text: `Banned by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({
                embeds: [successEmbed],
                components: []
            });

            // Send ban log
            const logEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🔨 User Banned')
                .setDescription(`A user has been banned from the Roblox game.`)
                .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`)
                .addFields(
                    { name: '👤 Username', value: `[${userData.name}](https://www.roblox.com/users/${userId}/profile)`, inline: true },
                    { name: '🆔 User ID', value: userId, inline: true },
                    { name: '⏰ Duration', value: durationMinutes === 0 ? 'Permanent' : `${durationMinutes} minutes`, inline: true },
                    { name: '📝 Reason', value: reason || 'No reason provided' },
                    { name: '🛠️ Moderator', value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: true },
                    { name: '📅 Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Ban Log System', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
            if (logChannel) {
                await logChannel.send({ embeds: [logEmbed] });
            }

        } catch (error) {
            console.error('Error executing ban:', error);
            await interaction.editReply({
                content: `❌ Failed to ban user: ${error.message}`,
                embeds: [],
                components: []
            });
        }
    }
};