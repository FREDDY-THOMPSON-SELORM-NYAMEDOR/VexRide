module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.changeColumn('chat_messages', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'matches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  },

  down: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.changeColumn('chat_messages', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'matches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  }
};