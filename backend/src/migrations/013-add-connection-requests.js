module.exports = {
  up: async ({ context: queryInterface, Sequelize }) => {
    await queryInterface.createTable('connection_requests', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      ride_request_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ride_requests', key: 'id' }, onDelete: 'CASCADE' },
      requester_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      recipient_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'sent' },
      message: { type: Sequelize.STRING, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false }
    });

    await queryInterface.addIndex('connection_requests', ['ride_request_id', 'requester_id'], { unique: true });
    await queryInterface.addIndex('connection_requests', ['recipient_id', 'status']);
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.dropTable('connection_requests');
  }
};
