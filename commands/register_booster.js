const { 
  SlashCommandBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder 
} = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register_booster')
    .setDescription('Register as a server booster on Trello'),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
    }

    const member = interaction.member;
    if (!member || !member.premiumSince) {
      return interaction.reply({
        content: 'You must be a Discord server booster to register.',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('register_booster_modal')
      .setTitle('Register Booster');

    const robloxIdInput = new TextInputBuilder()
      .setCustomId('roblox_user_id')
      .setLabel('Roblox User ID')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Numbers only')
      .setRequired(true)
      .setMaxLength(20);

    modal.addComponents(new ActionRowBuilder().addComponents(robloxIdInput));

    return interaction.showModal(modal);
  }
  ,
  async handleModalSubmit(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
    }

    const trelloApiKey = process.env.TRELLOAPI;
    const trelloToken = process.env.TRELLOTOKEN;
    const trelloListId = process.env.TRELLO_LIST_ID;

    if (!trelloApiKey || !trelloToken || !trelloListId) {
      return interaction.reply({
        content: 'Trello is not configured. Please contact a staff member.',
        ephemeral: true
      });
    }

    const member = interaction.member;
    if (!member || !member.premiumSince) {
      return interaction.reply({
        content: 'You must be a Discord server booster to register.',
        ephemeral: true
      });
    }

    const robloxUserIdRaw = interaction.fields.getTextInputValue('roblox_user_id');
    const robloxUserId = robloxUserIdRaw.trim();
    if (!/^\d+$/.test(robloxUserId)) {
      return interaction.reply({
        content: 'Please enter a valid Roblox user ID (numbers only).',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const cardsRes = await axios.get(
        `https://api.trello.com/1/lists/${trelloListId}/cards`,
        {
          params: {
            key: trelloApiKey,
            token: trelloToken,
            fields: 'name'
          }
        }
      );

      const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
      const cardName = `${robloxUserId}:${member.id}`;
      const alreadyExists = cards.some(card => card.name === cardName);
      if (alreadyExists) {
        return interaction.editReply({
          content: 'You are already registered as a booster.'
        });
      }

      await axios.post(
        'https://api.trello.com/1/cards',
        null,
        {
          params: {
            key: trelloApiKey,
            token: trelloToken,
            idList: trelloListId,
            name: cardName,
            desc: `Discord tag: ${interaction.user.tag}\nUser ID: ${member.id}\nRoblox User ID: ${robloxUserId}`
          }
        }
      );

      return interaction.editReply({
        content: 'You are now registered as a booster on Trello.'
      });
    } catch (error) {
      const errorInfo = error.response?.data || error.message;
      console.error('register_booster failed:', errorInfo);
      return interaction.editReply({
        content: 'Failed to add you to Trello. Please try again later.'
      });
    }
  }
};
