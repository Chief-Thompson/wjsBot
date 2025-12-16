require('dotenv').config();
const { 
  Client, 
  Collection, 
  GatewayIntentBits, 
  Events, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  SlashCommandBuilder, 
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent] });

// --- Load commands ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
  }
}

// --- Ticket system ---
const CATEGORY_ID = '1080201545909543034';
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const ADMIN_ROLE_ID = '1450423594050912400'; // Only this role sees staff reports
const CONCLUSION_CHANNEL_ID = '1450420195217641705'; // Ticket logging channel
const USER_NOTIFICATION_CHANNEL_ID = '998410531406872606'; // Replace with your user notification channel ID
const tickets = new Map();
const MAX_TICKETS = 15;

// Store pending conclusions (userId -> { channelId, interaction })
const pendingConclusions = new Map();

// --- Format guide messages ---
const FORMAT_GUIDES = {
  player: new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle('📝 Player Report Format')
    .setDescription('Please provide the following information to help us investigate:')
    .addFields(
      { name: '👤 Player Name', value: 'Username of the player you are reporting' },
      { name: '🔗 Evidence', value: 'Video links (Medal, YouTube, etc.)' },
      { name: '❓ Reason', value: 'What rule did they break?' },
      { name: '🎮 Experience', value: 'Which experience (game) did this occur in?' }
    )
    .setFooter({ text: 'Please wait for a staff member to assist you. Do not ping staff.' }),

  staff: new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle('⚖️ Staff Misconduct Report Format')
    .setDescription('Please provide detailed information about the staff member\'s behavior:')
    .addFields(
      { name: '👤 Staff Name', value: 'Discord username or username of the staff member' },
      { name: '🔗 Evidence', value: 'Video links (Medal, YouTube, etc.) - REQUIRED' },
      { name: '📋 Incident Description', value: 'Detailed explanation of what happened' }
    )
    .setFooter({ text: 'This report will only be visible to administrators. Please be patient.' })
};

// --- Interaction handler ---
client.on(Events.InteractionCreate, async interaction => {

  // --- Slash Command Handling ---
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: '❌ There was an error executing this command.', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ There was an error executing this command.', ephemeral: true });
      }
    }
    return; // Don't fall through to button handling
  }

  // --- Button Handling ---
  if (interaction.isButton()) {
    const { customId } = interaction;

    if (customId === 'report_player') {
      await createTicket(interaction, 'player', STAFF_ROLE_ID);
    }

    if (customId === 'report_staff') {
      await createTicket(interaction, 'staff', ADMIN_ROLE_ID);
    }

    if (customId === 'close_ticket') {
      await showConclusionModal(interaction);
    }

    if (customId === 'delete_ticket_confirm') {
      await deleteTicket(interaction);
    }
  }

  // --- Modal Handling ---
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'conclusion_modal') {
      await handleConclusionModal(interaction);
    }
  }
});

// --- Show conclusion modal function ---
async function showConclusionModal(interaction) {
  const userId = [...tickets.entries()].find(([_, chId]) => chId === interaction.channel.id)?.[0];
  
  if (!userId)
    return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });

  if (!interaction.member.roles.cache.has(STAFF_ROLE_ID) && !interaction.member.roles.cache.has(ADMIN_ROLE_ID))
    return interaction.reply({ content: '❌ You don\'t have permission to close this.', ephemeral: true });

  // Create the modal
  const modal = new ModalBuilder()
    .setCustomId('conclusion_modal')
    .setTitle('Close Ticket - Add Conclusion');

  // Add conclusion text input
  const conclusionInput = new TextInputBuilder()
    .setCustomId('conclusion_notes')
    .setLabel('Conclusion Notes for the User')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Enter the conclusion, resolution, or final statement for the reporting user...')
    .setMaxLength(2000)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(conclusionInput);
  modal.addComponents(actionRow);

  // Store the pending conclusion info
  pendingConclusions.set(userId, {
    channelId: interaction.channel.id,
    originalInteraction: interaction,
    staffId: interaction.user.id, // Store staff member's ID
    staffTag: interaction.user.tag // Store staff member's tag
  });

  await interaction.showModal(modal);
}

// --- Handle conclusion modal submission ---
async function handleConclusionModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const conclusionNotes = interaction.fields.getTextInputValue('conclusion_notes');
  const userId = [...pendingConclusions.entries()].find(([_, data]) => 
    data.originalInteraction?.channel?.id === interaction.channel.id
  )?.[0];

  if (!userId) {
    return interaction.followUp({ content: '❌ Error: Could not find ticket information.', ephemeral: true });
  }

  const pendingData = pendingConclusions.get(userId);
  if (!pendingData) {
    return interaction.followUp({ content: '❌ Error: Ticket data not found.', ephemeral: true });
  }

  // Clear pending conclusion
  pendingConclusions.delete(userId);

  // Close the ticket with the conclusion notes
  await closeTicketWithConclusion(
    interaction, 
    userId, 
    conclusionNotes, 
    pendingData.originalInteraction,
    pendingData.staffId,
    pendingData.staffTag
  );
}

// --- Close ticket with conclusion function ---
async function closeTicketWithConclusion(
  interaction, 
  userId, 
  conclusionNotes, 
  originalButtonInteraction,
  staffId,
  staffTag
) {
  // Try to get the user (they might have left the server)
  const user = await interaction.guild.members.fetch(userId).catch(() => null);
  
  // Restrict user's access to the channel (CLOSE THE TICKET)
  const ticketChannel = interaction.guild.channels.cache.get(originalButtonInteraction.channel.id);
  if (ticketChannel) {
    // Remove user's send messages permission
    await ticketChannel.permissionOverwrites.edit(userId, { SendMessages: false });
    
    // Send closed notification to ticket channel
    const closedEmbed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setTitle('🔒 Ticket Closed')
      .setDescription(`This ticket has been closed by ${staffTag} (<@${staffId}>)`)
      .addFields(
        { name: 'Conclusion', value: conclusionNotes || 'No conclusion provided.' }
      )
      .setTimestamp();
    
    await ticketChannel.send({ embeds: [closedEmbed] });
    
    // Add delete button for admins
    const deleteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('delete_ticket_confirm')
        .setLabel('🗑 Delete Ticket (Admin Only)')
        .setStyle(ButtonStyle.Danger)
    );
    
    await ticketChannel.send({
      content: 'This ticket is closed. Only admins can delete it.',
      components: [deleteRow]
    });
    
    // Remove the close button from the original message
    try {
      const originalMessage = await originalButtonInteraction.message.fetch();
      await originalMessage.edit({
        components: [] // Remove all buttons from the original message
      });
    } catch (error) {
      console.log('Could not update original message:', error.message);
    }
  }

  // Send conclusion to conclusion channel (ALWAYS)
  if (CONCLUSION_CHANNEL_ID) {
    try {
      const conclusionChannel = await interaction.guild.channels.fetch(CONCLUSION_CHANNEL_ID);
      if (conclusionChannel) {
        const conclusionLog = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('📋 Ticket Closed')
          .setDescription(`Ticket **${originalButtonInteraction.channel.name}** has been closed.`)
          .addFields(
            { name: 'Reporter User ID', value: userId, inline: true },
            { name: 'Reporter Tag', value: user ? user.user.tag : 'Left Server', inline: true },
            { name: 'Staff User ID', value: staffId, inline: true },
            { name: 'Staff Tag', value: staffTag, inline: true },
            { name: 'Conclusion Statement', value: conclusionNotes || 'No conclusion provided.' }
          )
          .setTimestamp();
        
        await conclusionChannel.send({ 
          embeds: [conclusionLog] 
        });
      }
    } catch (channelError) {
      console.log('Error sending to conclusion channel:', channelError.message);
    }
  }

  // Try to DM the user
  let userNotifiedViaDM = false;
  if (user) {
    try {
      const conclusionEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Ticket Closed - Conclusion')
        .setDescription(`Your ticket in ${interaction.guild.name} has been reviewed and closed.`)
        .addFields(
          { name: 'Closed By', value: `${staffTag} (<@${staffId})` },
          { name: 'Conclusion Statement', value: conclusionNotes || 'No conclusion provided.' }
        )
        .setTimestamp()
        .setFooter({ text: 'Thank you for your report!' });
      
      await user.send({ embeds: [conclusionEmbed] });
      userNotifiedViaDM = true;
    } catch (dmError) {
      console.log(`Could not DM user ${userId}:`, dmError.message);
      userNotifiedViaDM = false;
    }
  }

  // If DM failed and user is in server, send to user notification channel
  let userNotifiedViaChannel = false;
  if (user && !userNotifiedViaDM && USER_NOTIFICATION_CHANNEL_ID) {
    try {
      const notificationChannel = await interaction.guild.channels.fetch(USER_NOTIFICATION_CHANNEL_ID);
      if (notificationChannel) {
        const notificationEmbed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('📨 Ticket Conclusion')
          .setDescription(`<@${userId}>, your ticket has been closed.`)
          .addFields(
            { name: 'Ticket', value: originalButtonInteraction.channel.name },
            { name: 'Closed By', value: `${staffTag} (<@${staffId})` },
            { name: 'Conclusion Statement', value: conclusionNotes || 'No conclusion provided.' }
          )
          .setTimestamp()
          .setFooter({ text: `${interaction.guild.name} Staff Team` });
        
        await notificationChannel.send({ 
          content: `<@${userId}>`,
          embeds: [notificationEmbed] 
        });
        userNotifiedViaChannel = true;
      }
    } catch (notificationError) {
      console.log('Error sending to user notification channel:', notificationError.message);
    }
  }

  // Send confirmation to the staff member
  let confirmationMessage = '';
  
  if (user) {
    if (userNotifiedViaDM) {
      confirmationMessage = `🔒 Ticket closed and locked. Conclusion has been sent to the user via DM. A delete button has been added for admins.`;
    } else if (userNotifiedViaChannel) {
      confirmationMessage = `🔒 Ticket closed and locked. Conclusion has been sent to <#${USER_NOTIFICATION_CHANNEL_ID}>. A delete button has been added for admins.`;
    } else {
      confirmationMessage = `🔒 Ticket closed and locked. Could not notify user (DM failed and notification channel unavailable). A delete button has been added for admins.`;
    }
  } else {
    confirmationMessage = `🔒 Ticket closed and locked. User has left the server. Conclusion logged in <#${CONCLUSION_CHANNEL_ID}>. A delete button has been added for admins.`;
  }
  
  await interaction.followUp({ 
    content: confirmationMessage,
    ephemeral: true 
  });
}

// --- Create ticket function ---
async function createTicket(interaction, type, visibleRoleId) {
  await interaction.deferReply({ ephemeral: true });

  if (tickets.has(interaction.user.id))
    return interaction.editReply({ content: '❌ You already have an open ticket.' });

  if (tickets.size >= MAX_TICKETS)
    return interaction.editReply({ content: '❌ Ticket queue is full right now.' });

  const ticketChannel = await interaction.guild.channels.create({
    name: `${type}-report-${interaction.user.username}`,
    type: 0,
    parent: CATEGORY_ID,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      { id: visibleRoleId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
    ]
  });

  tickets.set(interaction.user.id, ticketChannel.id);

  // Single button for closing ticket
  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Secondary)
  );

  const welcomeMessage = await ticketChannel.send({
    content: `Hello ${interaction.user}, thank you for your ${type === 'staff' ? 'staff misconduct' : 'player'} report.`,
    embeds: [FORMAT_GUIDES[type]],
    components: [closeRow]
  });

  // Pin the format guide
  await welcomeMessage.pin();

  await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
}

// --- Delete ticket function (now separate button after closing) ---
async function deleteTicket(interaction) {
  // Find the user ID from the channel
  const channelId = interaction.channel.id;
  const entry = [...tickets.entries()].find(([_, chId]) => chId === channelId);
  
  if (!entry) {
    return interaction.reply({ content: '❌ Cannot find this ticket.', ephemeral: true });
  }
  
  const [userId] = entry;

  if (!interaction.member.roles.cache.has(ADMIN_ROLE_ID))
    return interaction.reply({ content: '❌ Only Admins can delete tickets.', ephemeral: true });

  // Delete from map and delete channel
  tickets.delete(userId);
  
  // Send confirmation before deleting
  await interaction.reply({ content: '🗑 Deleting this ticket...', ephemeral: false });
  
  // Small delay to show the message
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  await interaction.channel.delete();
}

// --- Ready event and ticket recovery ---
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  const category = guild.channels.cache.get(CATEGORY_ID);

  if (category) {
    const childChannels = guild.channels.cache.filter(c => c.parentId === category.id);
    for (const [, channel] of childChannels) {
      if (channel.name.startsWith('player-report') || channel.name.startsWith('staff-report')) {
        const userOverwrite = channel.permissionOverwrites.cache.find(po => po.type === 1 && po.allow.has('ViewChannel'));
        if (userOverwrite) tickets.set(userOverwrite.id, channel.id);
      }
    }
  }

  console.log(`Recovered ${tickets.size} tickets after restart ✅`);
});

// --- Login ---
client.login(process.env.TOKEN);