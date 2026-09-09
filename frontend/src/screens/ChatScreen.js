import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { getJson, patchJson } from '../services/api';
import ScreenLayout from '../components/ScreenLayout';
import { getStoredUser } from '../services/user';
import { joinChatRoom, markMessageSeen, onSocket, onSocketConnect, sendChatMessage, sendTypingStart, sendTypingStop, socket } from '../services/socket';
import { isActiveChatMatch, resetUnread, setActiveChatMatchId } from '../services/chatBadge';
import { logError } from '../services/errorHandling';

const heroImage = require('../../assets/images/vex_map_bg_1784946439656.jpg');

export default function ChatScreen({ navigation, route }) {
  const { matchId, request, counterParty } = route.params || {};
  const [currentUser, setCurrentUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [matchDetails, setMatchDetails] = useState({ matchId, request, counterParty });
  const typingTimer = useRef(null);
  const markVisibleMessagesSeenRef = useRef(null);
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    markVisibleMessagesSeenRef.current?.(viewableItems);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  function getSenderId(message) {
    return message.userId ?? message.user_id;
  }

  function getMessageKey(message) {
    return message.id || message.uuid || `${message.matchId || matchId}|${getSenderId(message) || ''}|${message.timestamp || ''}|${message.message || ''}`;
  }

  function normalizeMessage(message) {
    return {
      ...message,
      id: message.id || message.uuid,
      userId: getSenderId(message),
      seen: Boolean(message.seen)
    };
  }

  function mergeMessages(existingMessages, incomingMessages) {
    const merged = existingMessages.map(normalizeMessage);
    const seenKeys = new Set(merged.map(getMessageKey));

    incomingMessages.forEach((message) => {
      const normalizedMessage = normalizeMessage(message);
      const key = getMessageKey(normalizedMessage);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      merged.push(normalizedMessage);
    });

    return merged;
  }

  useEffect(() => {
    getStoredUser().then(setCurrentUser);
  }, []);

  useEffect(() => {
    if (!matchId) return undefined;

    setActiveChatMatchId(matchId);

    const joinRoom = () => joinChatRoom(matchId);
    const cleanConnection = onSocketConnect(joinRoom);
    if (socket.connected) joinRoom();
 
    let active = true;
    (async () => {
      try {
        const result = await getJson(`/match/${matchId}/chat`);
        if (!active) return;
        setMessages((existingMessages) => mergeMessages(existingMessages, result.messages || []));
        resetUnread();
        (result.messages || []).filter((message) => currentUser?.id && String(getSenderId(message)) !== String(currentUser.id) && !message.seen)
          .forEach((message) => {
            if (!message.id) return;
            markMessageSeen({ matchId, messageId: message.id, userId: currentUser.id });
            patchJson(`/messages/${message.id}/seen`, { userId: currentUser.id }).catch(() => {});
          });
      } catch (error) {
        logError('Load chat messages', error);
      }
    })();

    const cleanMessage = onSocket('chatMessage', (incomingMessage) => {
      if (String(incomingMessage.matchId) !== String(matchId)) return;
      const isOwnMessage = String(getSenderId(incomingMessage)) === String(currentUser?.id);
      const message = { ...incomingMessage, seen: Boolean(incomingMessage.seen) };
      setMessages((previousMessages) => mergeMessages(previousMessages, [message]));
      if (!isOwnMessage && incomingMessage.id) {
        markMessageSeen({ matchId, messageId: incomingMessage.id, userId: currentUser?.id });
        patchJson(`/messages/${incomingMessage.id}/seen`, { userId: currentUser?.id }).catch(() => {});
      }
      if (!isOwnMessage) resetUnread();
    });

    const cleanSeen = onSocket('onMessageSeen', ({ matchId: incomingMatchId, messageId }) => {
      if (String(incomingMatchId) !== String(matchId)) return;
      setMessages((previousMessages) => previousMessages.map((message) => (
        String(message.id || message.uuid) === String(messageId) ? { ...message, seen: true } : message
      )));
    });

    const cleanTypingStart = onSocket('onTypingStart', ({ matchId: incomingMatchId, userId }) => {
      if (String(incomingMatchId) === String(matchId) && String(userId) !== String(currentUser?.id)) setPartnerTyping(true);
    });

    const cleanTypingStop = onSocket('onTypingStop', ({ matchId: incomingMatchId, userId }) => {
      if (String(incomingMatchId) === String(matchId) && String(userId) !== String(currentUser?.id)) setPartnerTyping(false);
    });

    const cleanMatch = onSocket('matchFound', ({ matchId: incomingMatchId, request: incomingRequest, counterParty: incomingCounterParty }) => {
      if (String(incomingMatchId) !== String(matchId)) return;
      setMatchDetails({ matchId: incomingMatchId, request: incomingRequest, counterParty: incomingCounterParty });
    });

    return () => {
      active = false;
      if (isActiveChatMatch(matchId)) setActiveChatMatchId(null);
      cleanConnection();
      cleanMessage();
      cleanSeen();
      cleanTypingStart();
      cleanTypingStop();
      cleanMatch();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      sendTypingStop(matchId);
    };
  }, [matchId, currentUser?.id]);

  useEffect(() => {
    resetUnread();
  }, []);

  function handleDraftChange(value) {
    setDraft(value);
    if (!matchId) return;
    sendTypingStart(matchId);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendTypingStop(matchId), 1200);
  }

  function markVisibleMessagesSeen(viewableItems) {
    const unseenPartnerMessages = viewableItems
      .map(({ item }) => item)
      .filter((message) => !message.seen && String(getSenderId(message)) !== String(currentUser?.id));

    if (!unseenPartnerMessages.length) return;
    setMessages((previousMessages) => previousMessages.map((message) => (
      unseenPartnerMessages.some((visibleMessage) => getMessageKey(visibleMessage) === getMessageKey(message))
        ? { ...message, seen: true }
        : message
    )));
    unseenPartnerMessages.forEach((message) => {
      if (message.id) {
        markMessageSeen({ matchId, messageId: message.id, userId: currentUser?.id });
        patchJson(`/messages/${message.id}/seen`, { userId: currentUser?.id }).catch(() => {});
      }
    });
    resetUnread();
  }

  markVisibleMessagesSeenRef.current = markVisibleMessagesSeen;

  function handleSend() {
    const trimmedMessage = draft.trim();
    if (!trimmedMessage || !matchId) return;

    sendChatMessage({ matchId, message: trimmedMessage, userId: currentUser?.id });
    setDraft('');
  }

  const partnerName = matchDetails?.counterParty?.name || matchDetails?.counterParty?.user_name || counterParty?.name || counterParty?.user_name || request?.name || request?.user_name || counterParty || 'Matched rider';

  return (
    <ScreenLayout navigation={navigation} route={route} bgImage={heroImage} hideBottomNav>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-1 w-full max-w-md self-center py-2">
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-xl font-black text-white">Chat</Text>
              <Text className="text-[#8eb4c6] text-xs">Conversation with {partnerName}</Text>
            </View>
            <View className="bg-[#00f2fe]/10 border border-[#00f2fe]/30 px-3 py-1 rounded-full">
              <Text className="text-[#00f2fe] font-bold text-[10px] uppercase">Match #{matchId || 'N/A'}</Text>
            </View>
          </View>

          <View className="max-h-[520px] flex-1 rounded-3xl border border-[#00f2fe]/20 bg-[#0b172a]/95 overflow-auto shadow-2xl">
            <View className="px-4 py-3 border-b border-white/[0.08] bg-white/[0.03]">
              <Text className="text-white font-extrabold text-sm">{partnerName}</Text>
              <Text className="text-[#8eb4c6] text-xs mt-0.5">Private room chat for this ride</Text>
            </View>

            <FlatList
              className="flex-1 px-4 py-4"
              data={[...messages].reverse()}
              inverted
              keyExtractor={(item, index) => String(item.id || item.uuid || `${item.timestamp || 'message'}-${index}`)}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              renderItem={({ item }) => {
                //{console.log(item, messages)}
                const senderId = item.userId ?? item.user_id;
                const isOwnMessage = String(senderId) === String(currentUser?.id);

                return (
                  <View className={`mb-3 flex-row ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    <View className={`max-w-[82%] rounded-3xl px-4 py-3 border ${isOwnMessage ? 'bg-[#ff5e36] border-[#ff5e36]/60' : 'bg-white/[0.06] border-white/[0.10]'}`}>
                      <Text className={`text-xs font-bold mb-1 ${isOwnMessage ? 'text-white/80' : 'text-[#8eb4c6]'}`}>
                        {isOwnMessage ? 'You' : partnerName}
                      </Text>
                      <Text className="text-white text-sm leading-5">{item.message}</Text>
                      <View className="flex-row items-center gap-2 mt-2">
                        <Text className={`text-[10px] font-semibold ${isOwnMessage ? 'text-white/70' : 'text-[#8eb4c6]'}`}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
                        </Text>
                        {isOwnMessage && item.seen ? <Text className="text-[10px] font-bold text-white/80">✓ Seen</Text> : null}
                      </View>
                    </View>
                  </View>
                );
              }}
              contentContainerStyle={{ flexGrow: 1 }}
              ListEmptyComponent={
                <View className="items-center justify-center py-8">
                  <Text className="text-[#8eb4c6] text-sm text-center">No messages yet. Say hello to your matched rider.</Text>
                </View>
              }
            />

            {partnerTyping ? <Text className="px-4 py-2 text-[#8eb4c6] text-xs italic bg-[#08111f]">Partner is typing...</Text> : null}

            <View className="p-3 border-t border-white/[0.08] bg-[#08111f] flex-row items-end gap-2">
              <TextInput
                className="flex-1 min-h-[48px] max-h-[120px] rounded-2xl px-4 py-3 text-white border border-white/10 bg-white/[0.05]"
                placeholder="Type a message..."
                placeholderTextColor="#688ca0"
                value={draft}
                onChangeText={handleDraftChange}
                multiline
              />
              <TouchableOpacity
                className={`h-12 px-4 rounded-2xl items-center justify-center flex-row gap-2 ${draft.trim() ? 'bg-[#ff5e36] border border-[#ff5e36]/60' : 'bg-white/[0.08] border border-white/[0.10]'}`}
                onPress={handleSend}
                disabled={!draft.trim()}
              >
                <Text className={`font-black text-xs ${draft.trim() ? 'text-white' : 'text-[#688ca0]'}`}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}