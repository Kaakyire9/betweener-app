type RealtimeChannelLike = {
  state?: string;
  socket?: {
    isConnected?: () => boolean;
  };
};

export const canSendWebsocketBroadcast = (channel?: RealtimeChannelLike | null) =>
  channel?.state === 'joined' && channel.socket?.isConnected?.() === true;
