module.exports = {
  up: async ({ context: queryInterface }) => {
    await queryInterface.addIndex('connection_requests', ['requester_id', 'status']);
  },

  down: async ({ context: queryInterface }) => {
    await queryInterface.removeIndex('connection_requests', ['requester_id', 'status']);
  }
};