module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.addColumn('ride_requests', 'group_owner_confirmed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('connection_requests', 'requester_confirmed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn('chat_messages', 'ride_request_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'ride_requests', key: 'id' },
      onDelete: 'CASCADE'
    });
    await queryInterface.changeColumn('chat_messages', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'matches', key: 'id' },
      onDelete: 'CASCADE'
    });
  },

  down: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.changeColumn('chat_messages', 'match_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'matches', key: 'id' },
      onDelete: 'CASCADE'
    });
    await queryInterface.removeColumn('chat_messages', 'ride_request_id');
    await queryInterface.removeColumn('connection_requests', 'requester_confirmed');
    await queryInterface.removeColumn('ride_requests', 'group_owner_confirmed');
  }
};