module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('ride_requests', 'origin_latitude', { type: Sequelize.FLOAT, allowNull: true });
    await queryInterface.addColumn('ride_requests', 'origin_longitude', { type: Sequelize.FLOAT, allowNull: true });
    await queryInterface.addColumn('ride_requests', 'destination_latitude', { type: Sequelize.FLOAT, allowNull: true });
    await queryInterface.addColumn('ride_requests', 'destination_longitude', { type: Sequelize.FLOAT, allowNull: true });
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeColumn('ride_requests', 'destination_longitude');
    await queryInterface.removeColumn('ride_requests', 'destination_latitude');
    await queryInterface.removeColumn('ride_requests', 'origin_longitude');
    await queryInterface.removeColumn('ride_requests', 'origin_latitude');
  }
};