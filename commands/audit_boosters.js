const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

function extractDiscordId(card) {
  if (typeof card?.name === 'string') {
    const nameParts = card.name.split(':');
    const maybeId = nameParts[nameParts.length - 1]?.trim();
    if (maybeId && /^\d+$/.test(maybeId)) return maybeId;
  }

  if (typeof card?.desc === 'string') {
    const match = card.desc.match(/User ID:\s*(\d+)/i);
    if (match?.[1]) return match[1];
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit_boosters')
    .setDescription('Check Trello boosters against current server boosters'),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: 'This command can only be used in a server.',
        ephemeral: true
      });
    }

    const supportRoleId = process.env.SUPPORT_ROLE_ID;
    if (!supportRoleId) {
      return interaction.reply({
        content: 'SUPPORT_ROLE_ID is not configured.',
        ephemeral: true
      });
    }

    if (!interaction.member?.roles?.cache?.has(supportRoleId)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
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

    await interaction.deferReply({ ephemeral: true });

    try {
      const cardsRes = await axios.get(
        `https://api.trello.com/1/lists/${trelloListId}/cards`,
        {
          params: {
            key: trelloApiKey,
            token: trelloToken,
            fields: 'name,desc'
          }
        }
      );

      const cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
      const entries = [];
      const unparseable = [];

      for (const card of cards) {
        const discordId = extractDiscordId(card);
        if (discordId) {
          entries.push({ discordId, cardName: card.name, cardId: card.id });
        } else {
          unparseable.push(card.name || '(no name)');
        }
      }

      const nonBoosters = [];
      const missingUsers = [];
      const deletedCards = [];

      for (const entry of entries) {
        let member = null;
        try {
          member = await interaction.guild.members.fetch(entry.discordId);
        } catch {
          member = null;
        }

        if (!member) {
          missingUsers.push(entry.discordId);
          continue;
        }

        if (!member.premiumSince) {
          nonBoosters.push(entry.discordId);
          if (entry.cardId) {
            try {
              await axios.delete(
                `https://api.trello.com/1/cards/${entry.cardId}`,
                {
                  params: {
                    key: trelloApiKey,
                    token: trelloToken
                  }
                }
              );
              deletedCards.push(entry.cardId);
            } catch (deleteError) {
              console.error('Failed to delete Trello card:', entry.cardId, deleteError.response?.data || deleteError.message);
            }
          }
        }
      }

      const summaryParts = [
        `Cards checked: ${cards.length}`,
        `Parsed Discord IDs: ${entries.length}`,
        `Non-boosters: ${nonBoosters.length}`,
        `Deleted cards: ${deletedCards.length}`,
        `Missing users: ${missingUsers.length}`,
        `Unparseable cards: ${unparseable.length}`
      ];

      const lines = [];
      if (nonBoosters.length) {
        lines.push(`Non-boosters: ${nonBoosters.map(id => `<@${id}>`).join(', ')}`);
      }
      if (missingUsers.length) {
        lines.push(`Missing users: ${missingUsers.map(id => `<@${id}>`).join(', ')}`);
      }
      if (unparseable.length) {
        lines.push(`Unparseable cards: ${unparseable.join(', ')}`);
      }

      let details = lines.join('\n');
      if (details.length > 1500) {
        details = `${details.slice(0, 1450)}\n(Truncated)`;
      }

      const content = `${summaryParts.join(' | ')}${details ? `\n\n${details}` : ''}`;

      return interaction.editReply({ content });
    } catch (error) {
      const errorInfo = error.response?.data || error.message;
      console.error('audit_boosters failed:', errorInfo);
      return interaction.editReply({
        content: 'Failed to audit boosters. Please try again later.'
      });
    }
  }
};
