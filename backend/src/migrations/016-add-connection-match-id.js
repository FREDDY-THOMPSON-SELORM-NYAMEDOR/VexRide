module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('connection_requests', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'matches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addIndex('connection_requests', ['match_id']);
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('connection_requests', ['match_id']);
    await queryInterface.removeColumn('connection_requests', 'match_id');
  }
};