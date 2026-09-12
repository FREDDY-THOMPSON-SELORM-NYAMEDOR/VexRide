const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RideRequest = sequelize.define('RideRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  origin: { type: DataTypes.STRING, allowNull: false },
  origin_data: { type: DataTypes.JSONB, allowNull: true },
  destination: { type: DataTypes.STRING, allowNull: false },
  origin_latitude: { type: DataTypes.FLOAT, allowNull: true },
  origin_longitude: { type: DataTypes.FLOAT, allowNull: true },
  destination_latitude: { type: DataTypes.FLOAT, allowNull: true },
  destination_longitude: { type: DataTypes.FLOAT, allowNull: true },
  time: { type: DataTypes.DATE, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  user_name: { type: DataTypes.STRING, allowNull: false},
  status: { type: DataTypes.ENUM('pending', 'matched', 'completed', 'cancelled'), defaultValue: 'pending' },
  match_id: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'ride_requests',
  timestamps: true
});

module.exports = RideRequest;
