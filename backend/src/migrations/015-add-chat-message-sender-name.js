module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('chat_messages', 'sender_name', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('chat_messages', 'sender_name');
  }
};