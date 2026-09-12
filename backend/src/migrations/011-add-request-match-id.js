module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('ride_requests', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'matches', key: 'id' }
    });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('ride_requests', 'match_id');
  }
};