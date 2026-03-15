const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Post the ticket creation panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only staff can post

  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('report_player')
        .setLabel('📣 Report Player')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('report_staff')
        .setLabel('🧑‍💼 Report Staff Member')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('appeal_misconduct')
        .setLabel('Appeal')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '🎟️ **Create a Ticket**\nPlease choose one of the options below:',
      components: [row]
    });
  }
};
