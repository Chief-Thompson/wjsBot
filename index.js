require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- Load commands ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// --- Ticket system ---
const tickets = new Map();
const MAX_TICKETS = 4;
const CATEGORY_ID = '1080201545909543034';

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {

  // --- Slash commands ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Error executing command.', ephemeral: true });
      }
    }
  }

  // --- Button interactions ---
  if (interaction.isButton()) {
    const channel = interaction.channel;

    // Initial ticket button
    if (interaction.customId === 'create_ticket') {
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('agree_ticket').setLabel('✅ Agree').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_ticket').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        content: '⚠️ Please follow the ticket format. Failure to comply may result in ticket closure.\nDo you agree to these rules?',
        components: [confirmRow],
        ephemeral: true
      });
    }

    // Agree button
    if (interaction.customId === 'agree_ticket') {
      await interaction.deferReply({ ephemeral: true });

      if (tickets.size >= MAX_TICKETS) return interaction.editReply({ content: '❌ The ticket queue is full.', components: [] });
      if (tickets.has(interaction.user.id)) return interaction.editReply({ content: '❌ You already have a ticket open.', components: [] });

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: ['ViewChannel'] },
          { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
          { id: process.env.STAFF_ROLE_ID, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        ],
      });

      // Store user ID for persistent tracking
      tickets.set(interaction.user.id, ticketChannel.id);

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket (Staff)').setStyle(ButtonStyle.Secondary)
      );

      const deleteButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('delete_ticket').setLabel('🗑 Delete Ticket (Support Team)').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({
        content: `Hello ${interaction.user}, a staff member will assist you shortly!`,
        components: [closeButton, deleteButton]
      });

      await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}`, components: [] });
    }

    // Cancel button
    if (interaction.customId === 'cancel_ticket') {
      await interaction.update({ content: '❌ Ticket creation canceled.', components: [] });
    }

    // Close ticket (staff only)
    if (interaction.customId === 'close_ticket') {
      const userId = [...tickets.entries()].find(([_, chId]) => chId === channel.id)?.[0];
      if (!userId) return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });

      if (!interaction.member.roles.cache.has(process.env.STAFF_ROLE_ID)) {
        return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });
      }

      await channel.permissionOverwrites.edit(userId, { SendMessages: false });
      await interaction.reply({ content: '🔒 Ticket has been closed (user cannot send messages).', ephemeral: true });
    }

    // Delete ticket (support team only)
    if (interaction.customId === 'delete_ticket') {
      const userId = [...tickets.entries()].find(([_, chId]) => chId === channel.id)?.[0];
      if (!userId) return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });

      if (!interaction.member.roles.cache.has(process.env.SUPPORT_ROLE_ID)) {
        return interaction.reply({ content: '❌ Only support team can delete tickets.', ephemeral: true });
      }

      tickets.delete(userId);
      await channel.delete();
    }
  }
});

// --- Ready event with ticket recovery ---
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const category = guild.channels.cache.get(CATEGORY_ID);

  if (category) {
    // ✅ Modern replacement for category.children
    const childChannels = guild.channels.cache.filter(c => c.parentId === category.id);

    for (const [, channel] of childChannels) {
      if (channel.name.startsWith('ticket-')) {
        const userOverwrite = channel.permissionOverwrites.cache.find(po => po.type === 1 && po.allow.has('ViewChannel'));
        if (userOverwrite) {
          tickets.set(userOverwrite.id, channel.id);
        }
      }
    }
  }

  console.log(`Recovered ${tickets.size} tickets from category using user IDs.`);
});

// --- Login ---
client.login(process.env.TOKEN);
