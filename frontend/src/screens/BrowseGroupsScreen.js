import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { getJson, postJson } from '../services/api';
import { onSocket } from '../services/socket';
import ScreenLayout from '../components/ScreenLayout';
import { getStoredUser } from '../services/user';
import { GroupsIcon, UsersIcon, CardIcon, CarIcon, ZapIcon, CheckIcon, LockIcon } from '../components/Icons';
import { friendlyError, logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_groups_bg_1784946398517.jpg');

export default function BrowseGroupsScreen({ navigation, route }) {
  const [groups, setGroups] = useState([]);
  const [activity, setActivity] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  async function loadGroups() {
    try { const result = await getJson(`/browseGroups?userId=${currentUser?.id}`); setGroups(result.groups || []); }
    catch (error) { logError('Load groups', error); setActivity(prev => [`Could not load groups. Please try again.`, ...prev].slice(0, 4)); }
  }

  useEffect(() => { (async () => setCurrentUser(await getStoredUser()))() }, []);
  useEffect(() => {
    if (!currentUser) return;
    loadGroups();
    const c1 = onSocket('groupCreated', ({ group }) => { setGroups(prev => [group, ...prev]); setActivity(prev => [`New group created: ${group.origin} → ${group.location}`, ...prev].slice(0, 4)); });
    const c2 = onSocket('groupJoined', ({ groupId, group }) => { if (group) setGroups(prev => prev.map(e => e.id === groupId ? group : e)); setActivity(prev => [`A rider joined group #${groupId}`, ...prev].slice(0, 4)); });
    const c4 = onSocket('groupMemberVerified', ({ groupId }) => { setActivity(prev => [`Group member verified for group #${groupId}`, ...prev].slice(0, 4)); loadGroups(); });
    const c3 = onSocket('groupRideBooked', ({ ride }) => setActivity(prev => [`Group ride booked: ${ride.car} in ${ride.eta}`, ...prev].slice(0, 4)));
    return () => { c1(); c2(); c3(); };
  }, [currentUser]);

  async function handleJoin(groupId) {
    try { const result = await postJson('/joinGroup', { groupId, userId: currentUser?.id }); setGroups(prev => prev.map(g => g.id === groupId ? result.group : g)); setActivity(prev => [`Joined group #${groupId}. Pay GHS${result.paymentAmount} to move out of probation.`, ...prev].slice(0, 4)); }
    catch (error) { logError('Join group', error); setActivity(prev => [`${friendlyError(error, 'Could not join the group. Please try again.')}`, ...prev].slice(0, 4)); }
  }

  async function handlePay(group) {
    const member = group.members?.find(e => e.userId === currentUser?.id);
    if (!member) { setActivity(prev => [`No probation member record found for group #${group.id}`, ...prev].slice(0, 4)); return; }
    navigation.navigate('Payment', { paymentType: 'group', groupId: group.id, groupMemberId: member.membershipId, amount: group.paymentAmount || 0, groupTitle: `${group.origin} → ${group.location}` });
  }

  async function handleBook(groupId) {
    try { const result = await postJson('/bookGroupRide', { groupId }); setActivity(prev => [`Ride booked for group #${groupId}: ${result.ride.car}`, ...prev].slice(0, 4)); }
    catch (error) { logError('Book group ride', error); setActivity(prev => [`${friendlyError(error, 'Could not book the group ride. Please try again.')}`, ...prev].slice(0, 4)); }
  }

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage}>
      <View className="flex-1">

        {/* Banner Title */}
        <View className="bg-[#0b172a]/95 rounded-3xl p-5 border border-[#00f2fe]/30 shadow-2xl mb-5 backdrop-blur-xl">
          <View className="flex-row items-center gap-2 mb-1.5">
            <View className="bg-[#00f2fe]/20 px-2.5 py-0.5 rounded-full border border-[#00f2fe]/40">
              <Text className="text-[#00f2fe] font-black text-[10px] uppercase">Community Crews</Text>
            </View>
          </View>
          <Text className="text-2xl font-black text-white">Live Groups</Text>
          <Text className="text-[#ccebf5] text-xs leading-5">Join a trip crew to share costs and unlock member ride details.</Text>
        </View>

        {/* Groups List */}
        <Text className="text-white text-base font-black mb-3">Available Crews</Text>
        <View className="mb-6">
          {groups.length === 0 ? (
            <View className="bg-[#0b172a]/90 rounded-3xl p-8 border border-white/[0.08] items-center">
              <View className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.1] items-center justify-center mb-3">
                <GroupsIcon size={24} color="#8eb4c6" />
              </View>
              <Text className="text-[#8eb4c6] text-xs text-center font-semibold leading-5">
                No groups available yet. Create one to get started!
              </Text>
            </View>
          ) : (
            groups.map((group) => {
              const myMemberRecord = group.members?.find(m => m.userId === currentUser?.id);
              const isProbation = myMemberRecord?.status === 'probation';
              const isVerified = myMemberRecord?.status === 'verified';

              return (
                <View
                  key={group.id}
                  className="bg-[#0b172a]/95 rounded-3xl p-5 mb-4 border shadow-xl"
                  style={{
                    borderColor: String(group.id) === String(route?.params?.groupId) ? '#ff5e36' : '#00f2fe40',
                    borderWidth: String(group.id) === String(route?.params?.groupId) ? 2 : 1
                  }}
                >

                  {/* Group Header */}
                  <View className="flex-row justify-between items-center mb-3 pb-3 border-b border-white/[0.08]">
                    <View className="flex-1 mr-2">
                      <Text className="text-white text-lg font-black">{group.origin} → {group.location}</Text>
                      <Text className="text-[#8eb4c6] text-xs font-semibold mt-0.5">
                        Date: {group.schedule_date} • Time: {group.time}
                      </Text>
                    </View>
                    <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 px-3 py-1.5 rounded-full flex-row items-center gap-1.5">
                      <UsersIcon size={14} color="#00f2fe" />
                      <Text className="text-[#00f2fe] font-extrabold text-xs">{group.memberCount} Riders</Text>
                    </View>
                  </View>

                  {/* Group Details Pills */}
                  <View className="bg-white/[0.03] p-3 rounded-2xl border border-white/[0.08] mb-3 flex-row flex-wrap justify-between gap-2">
                    <View>
                      <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Total Budget</Text>
                      <Text className="text-white text-xs font-extrabold">GHS {group.budget}</Text>
                    </View>
                    <View>
                      <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Max Members</Text>
                      <Text className="text-white text-xs font-extrabold">{group.max_members || 'N/A'}</Text>
                    </View>
                    <View>
                      <Text className="text-[#8eb4c6] text-[10px] uppercase font-bold">Your Share</Text>
                      <Text className="text-[#00f2fe] text-xs font-extrabold">GHS {group.paymentAmount || 0}</Text>
                    </View>
                  </View>

                  <Text className="text-[#8eb4c6] text-[11px] mb-3">
                    Join deadline: {group.join_deadline ? new Date(group.join_deadline).toLocaleString() : 'No deadline set'}
                  </Text>

                  {/* Members Section */}
                  {group.isMember ? (
                    <View className="bg-[#050e1d] rounded-2xl p-4 mb-4 border border-white/[0.08]">
                      <Text className="text-[#00f2fe] text-xs font-black mb-2">Group Members</Text>
                      {group.members.length === 0 ? (
                        <Text className="text-[#8eb4c6] text-xs">You're the first rider in this group.</Text>
                      ) : (
                        group.members.map((m) => (
                          <View key={m.membershipId || m.id} className="flex-row items-center justify-between py-1 border-b border-white/[0.04] last:border-0">
                            <Text className="text-[#e6f7ff] text-xs font-bold">• {m.name}</Text>
                            {m.status ? (
                              <View className={`px-2 py-0.5 rounded-full ${m.status === 'verified' ? 'bg-[#00f2fe]/20' : 'bg-[#ff5e36]/20'}`}>
                                <Text className={`text-[10px] font-extrabold uppercase ${m.status === 'verified' ? 'text-[#00f2fe]' : 'text-[#ff5e36]'}`}>
                                  {m.status}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                        ))
                      )}
                    </View>
                  ) : (
                    <View className="bg-white/[0.03] p-3 rounded-2xl border border-white/[0.06] mb-4 flex-row items-center gap-2">
                      <LockIcon size={14} color="#8eb4c6" />
                      <Text className="text-[#8eb4c6] text-xs flex-1 leading-4">
                        Join this group to view rider names, active members, and book shared rides.
                      </Text>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View className="flex-row justify-between gap-2.5">
                    <TouchableOpacity
                      className={`flex-1 py-3 rounded-2xl items-center shadow-md flex-row justify-center gap-1.5 ${
                        (!group.canJoin || group.isMember) ? 'bg-white/[0.05] border border-white/[0.1]' : 'bg-[#00f2fe] active:scale-98'
                      }`}
                      onPress={() => handleJoin(group.id)}
                      disabled={!group.canJoin || group.isMember}
                    >
                      {group.isMember ? <CheckIcon size={14} color="#688ca0" /> : null}
                      <Text className={`font-black text-xs ${(!group.canJoin || group.isMember) ? 'text-[#688ca0]' : 'text-[#050c1a]'}`}>
                        {group.isMember ? 'Joined' : group.canJoin ? 'Join Crew' : 'Closed'}
                      </Text>
                    </TouchableOpacity>

                    {group.isMember && isProbation ? (
                      <TouchableOpacity
                        className="flex-1 bg-[#ff5e36] py-3 rounded-2xl items-center shadow-md border border-[#ff5e36]/60 active:scale-98 flex-row justify-center gap-1.5"
                        onPress={() => handlePay(group)}
                      >
                        <CardIcon size={14} color="#ffffff" />
                        <Text className="text-white font-black text-xs">Pay GHS {group.paymentAmount || 0}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        className={`flex-1 py-3 rounded-2xl items-center shadow-md flex-row justify-center gap-1.5 ${
                          !group.isMember ? 'bg-white/[0.05] border border-white/[0.1]' : 'bg-[#ff5e36] border border-[#ff5e36]/60 active:scale-98'
                        }`}
                        onPress={() => handleBook(group.id)}
                        disabled={!group.isMember}
                      >
                        <CarIcon size={14} color={!group.isMember ? '#688ca0' : '#ffffff'} />
                        <Text className={`font-black text-xs ${!group.isMember ? 'text-[#688ca0]' : 'text-white'}`}>
                          {group.isMember ? 'Book Ride' : 'Members Only'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {isVerified && (
                    <Text className="text-[#00f2fe] font-extrabold text-[11px] mt-2.5 text-center">
                      ✓ Your membership is verified for this group.
                    </Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Activity Logs */}
        <Text className="text-white text-base font-black mb-3">Group Activity</Text>
        <View className="bg-[#0b172a]/80 rounded-3xl p-4 mb-6 border border-white/[0.08]">
          {activity.length === 0 ? (
            <Text className="text-[#8eb4c6] text-xs font-semibold leading-5 text-center py-2">
              No recent events. Stay tuned for crew activity!
            </Text>
          ) : (
            activity.map((item, i) => (
              <View key={i} className="flex-row items-center gap-2 mb-2 last:mb-0">
                <ZapIcon size={12} color="#00f2fe" />
                <Text className="text-[#c9e5f4] text-xs font-semibold flex-1 leading-4">{item}</Text>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          className="bg-white/[0.08] border border-white/[0.15] p-4 rounded-2xl mb-8 items-center flex-row justify-center gap-2"
          onPress={() => navigation.navigate('Home')}
        >
          <Text className="text-[#00f2fe] font-black text-sm">Back to Home</Text>
        </TouchableOpacity>

      </View>
    </ScreenLayout>
  );
}