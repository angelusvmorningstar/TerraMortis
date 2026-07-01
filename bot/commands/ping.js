import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot is alive'),

  async execute(interaction) {
    await interaction.reply({ content: `Pong! Latency: ${interaction.client.ws.ping}ms`, ephemeral: true });
  },
};
