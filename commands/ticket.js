const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Open a support ticket'),

  async execute(interaction) {

    // Show the ticket button
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const ticketRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('📩 Open Ticket')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      content: 'Click the button below to create a ticket.',
      components: [ticketRow],
      ephemeral: true
    });
  }
};
