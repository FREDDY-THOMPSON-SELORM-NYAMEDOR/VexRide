const sequelize = require('../config/database');
const User = require('./User');
const RideRequest = require('./RideRequest');
const Match = require('./Match');
const ChatMessage = require('./ChatMessage');
const Payment = require('./Payment');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const ConnectionRequest = require('./ConnectionRequest');

User.hasMany(RideRequest, { foreignKey: 'user_id' });
RideRequest.belongsTo(User, { foreignKey: 'user_id' });

RideRequest.hasMany(ConnectionRequest, { foreignKey: 'ride_request_id' });
ConnectionRequest.belongsTo(RideRequest, { foreignKey: 'ride_request_id' });
User.hasMany(ConnectionRequest, { foreignKey: 'requester_id', as: 'sentConnections' });
User.hasMany(ConnectionRequest, { foreignKey: 'recipient_id', as: 'receivedConnections' });
ConnectionRequest.belongsTo(User, { foreignKey: 'requester_id', as: 'requester' });
ConnectionRequest.belongsTo(User, { foreignKey: 'recipient_id', as: 'recipient' });

RideRequest.hasMany(Match, { foreignKey: 'ride1_id' });
RideRequest.hasMany(Match, { foreignKey: 'ride2_id' });
Match.belongsTo(RideRequest, { foreignKey: 'ride1_id', as: 'rideOne' });
Match.belongsTo(RideRequest, { foreignKey: 'ride2_id', as: 'rideTwo' });

Match.hasMany(ChatMessage, { foreignKey: 'match_id' });
ChatMessage.belongsTo(Match, { foreignKey: 'match_id' });
RideRequest.hasMany(ChatMessage, { foreignKey: 'ride_request_id' });
ChatMessage.belongsTo(RideRequest, { foreignKey: 'ride_request_id' });
User.hasMany(ChatMessage, { foreignKey: 'user_id' });
ChatMessage.belongsTo(User, { foreignKey: 'user_id' });

Match.hasMany(Payment, { foreignKey: 'match_id' });
Payment.belongsTo(Match, { foreignKey: 'match_id' });
Payment.belongsTo(User, { foreignKey: 'user_id' });
User.hasMany(Payment, { foreignKey: 'user_id' });

Group.hasMany(GroupMember, { foreignKey: 'group_id' });
GroupMember.belongsTo(Group, { foreignKey: 'group_id' });
User.hasMany(GroupMember, { foreignKey: 'user_id' });
GroupMember.belongsTo(User, { foreignKey: 'user_id' });

module.exports = {
  sequelize,
  User,
  RideRequest,
  Match,
  ChatMessage,
  Payment,
  Group,
  GroupMember,
  ConnectionRequest
};
