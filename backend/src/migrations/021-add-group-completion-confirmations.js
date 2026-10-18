module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('matches', 'completion_confirmations', {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: []
    });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('matches', 'completion_confirmations');
  }
};