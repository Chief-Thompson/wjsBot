const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { smartUserSearch } = require('../roblox');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rlookup')
        .setDescription('Look up Roblox user by username, display name, or ID')
        .addStringOption(opt =>
            opt.setName('query')
                .setDescription('Username, display name, or user ID')
                .setRequired(true)
        )
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('Number of display name results to show (default: 5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10)
        ),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query').trim();
        const limit = interaction.options.getInteger('limit') || 5;

        try {
            const { exactMatch, displayNameMatches } = await smartUserSearch(query, limit);

            // Handle no results
            if (!exactMatch && displayNameMatches.length === 0) {
                return interaction.editReply('❌ No Roblox users found matching your search.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('🔍 Roblox User Lookup')
                .setDescription(`Search results for: **${query}**`);

            // Add exact match section if found
            if (exactMatch) {
                const isExactDisplayNameMatch = exactMatch.displayName.toLowerCase() === query.toLowerCase();
                const matchType = isExactDisplayNameMatch ? 'Exact Display Name Match' : 'Exact Username/ID Match';
                
                embed.addFields({
                    name: `✅ ${matchType}`,
                    value: `**${exactMatch.displayName}** (@${exactMatch.name})\n**User ID:** \`${exactMatch.id}\`\n[View Profile](${exactMatch.profileUrl})`,
                    inline: false
                });
            }

            // Add display name matches section
            if (displayNameMatches.length > 0) {
                // Filter out the exact match from display name results to avoid duplicates
                const filteredDisplayMatches = displayNameMatches.filter(match => 
                    !exactMatch || match.id !== exactMatch.id
                );

                if (filteredDisplayMatches.length > 0) {
                    let displayNameResults = '';
                    
                    filteredDisplayMatches.forEach((user) => {
                        const verifiedBadge = user.hasVerifiedBadge ? ' ✅' : '';
                        displayNameResults += `**${user.displayName}**${verifiedBadge} (@${user.name})\n**ID:** \`${user.id}\` • [Profile](${user.profileUrl})\n\n`;
                    });

                    embed.addFields({
                        name: `👥 Other Display Name Matches (${filteredDisplayMatches.length})`,
                        value: displayNameResults,
                        inline: false
                    });
                }
            }

            // Add result count to footer
            const totalResults = (exactMatch ? 1 : 0) + 
                               (displayNameMatches.filter(match => !exactMatch || match.id !== exactMatch.id).length);
            embed.setFooter({ text: `Found ${totalResults} result(s)` });

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Roblox lookup error:', error);
            return interaction.editReply('❌ There was an error looking up Roblox users.');
        }
    }
};