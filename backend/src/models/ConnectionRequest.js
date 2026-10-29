const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConnectionRequest = sequelize.define('ConnectionRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  ride_request_id: { type: DataTypes.INTEGER, allowNull: false },
  match_id: { type: DataTypes.INTEGER, allowNull: true },
  requester_id: { type: DataTypes.INTEGER, allowNull: false },
  recipient_id: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'sent',
    validate: {
      isIn: [['sent', 'accepted', 'declined', 'cancelled', 'expired']]
    }
  },
  requester_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  message: { type: DataTypes.STRING, allowNull: true }
}, {
  tableName: 'connection_requests',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['ride_request_id', 'requester_id'] },
    { fields: ['requester_id', 'status'] },
    { fields: ['recipient_id', 'status'] }
  ]
});

module.exports = ConnectionRequest;
