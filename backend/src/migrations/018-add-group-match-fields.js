module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('matches', 'match_type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'pair'
    });
    await queryInterface.addColumn('matches', 'group_request_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ride_requests', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addIndex('matches', ['group_request_id']);
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('matches', ['group_request_id']);
    await queryInterface.removeColumn('matches', 'group_request_id');
    await queryInterface.removeColumn('matches', 'match_type');
  }
};