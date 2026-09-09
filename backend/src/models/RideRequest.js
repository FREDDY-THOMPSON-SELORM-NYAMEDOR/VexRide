const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RideRequest = sequelize.define('RideRequest', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  origin: { type: DataTypes.STRING, allowNull: false },
  destination: { type: DataTypes.STRING, allowNull: false },
  origin_latitude: { type: DataTypes.FLOAT, allowNull: true },
  origin_longitude: { type: DataTypes.FLOAT, allowNull: true },
  destination_latitude: { type: DataTypes.FLOAT, allowNull: true },
  destination_longitude: { type: DataTypes.FLOAT, allowNull: true },
  time: { type: DataTypes.DATE, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  user_name: { type: DataTypes.STRING, allowNull: false},
  status: { type: DataTypes.STRING, defaultValue: 'pending' }
}, {
  tableName: 'ride_requests',
  timestamps: true
});

module.exports = RideRequest;
