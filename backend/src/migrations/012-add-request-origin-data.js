module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('ride_requests', 'origin_data', {
      type: Sequelize.JSONB,
      allowNull: true
    });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('ride_requests', 'origin_data');
  }
};