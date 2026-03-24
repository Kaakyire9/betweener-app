type MatchScoreInputs = {
  messageCount?: number | null;
  firstReplyHours?: number | null;
  bothVerified?: boolean | null;
  interestOverlapRatio?: number | null;
};

type ConversationSignalRow = {
  sender_id: string;
  created_at: string;
};

type ConversationSignalInputs = MatchScoreInputs & {
  rows?: ConversationSignalRow[] | null;
  userId: string;
  peerId: string;
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const messageCountScore = (count: number) => {
  const normalized = Math.min(Math.max(count, 0), 20) / 20;
  return normalized * 100;
};

const replyTimeScore = (hours: number) => {
  if (hours <= 2) return 100;
  if (hours <= 12) return 70;
  if (hours <= 24) return 50;
  if (hours <= 72) return 30;
  return 10;
};

const sortRows = (rows: ConversationSignalRow[]) =>
  [...rows].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

const computeTurnSwitchCount = (rows: ConversationSignalRow[]) => {
  if (rows.length <= 1) return 0;
  let switches = 0;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]?.sender_id && rows[index - 1]?.sender_id && rows[index].sender_id !== rows[index - 1].sender_id) {
      switches += 1;
    }
  }
  return switches;
};

const computeRecentMessageCount = (rows: ConversationSignalRow[], days: number) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const timestamp = new Date(row.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  }).length;
};

const computeActiveDayCount = (rows: ConversationSignalRow[]) => {
  const days = new Set<string>();
  rows.forEach((row) => {
    const date = new Date(row.created_at);
    if (Number.isFinite(date.getTime())) {
      days.add(date.toISOString().slice(0, 10));
    }
  });
  return days.size;
};

const computeReciprocityRatio = (rows: ConversationSignalRow[], userId: string, peerId: string) => {
  const sentByUser = rows.filter((row) => row.sender_id === userId).length;
  const sentByPeer = rows.filter((row) => row.sender_id === peerId).length;
  const maxCount = Math.max(sentByUser, sentByPeer);
  if (!maxCount) return 0;
  return Math.min(sentByUser, sentByPeer) / maxCount;
};

export const computeInterestOverlapRatio = (a: string[], b: string[]) => {
  if (!a.length || !b.length) return null;
  const shared = a.filter((item) => b.includes(item)).length;
  const denom = Math.max(a.length, b.length);
  if (!denom) return null;
  return shared / denom;
};

export const computeFirstReplyHours = (
  rows: { sender_id: string; created_at: string }[],
  userId: string,
  peerId: string,
) => {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const first = sorted[0];
  if (!first) return null;
  const otherSender = first.sender_id === userId ? peerId : userId;
  const reply = sorted.find((row) => row.sender_id === otherSender);
  if (!reply) return null;
  const diffMs = new Date(reply.created_at).getTime() - new Date(first.created_at).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return diffMs / 3600000;
};

export const computeMatchScorePercent = (inputs: MatchScoreInputs) => {
  const weights = {
    messageCount: 0.35,
    replyTime: 0.25,
    bothVerified: 0.2,
    interestOverlap: 0.2,
  };

  let score = 0;
  let totalWeight = 0;

  if (typeof inputs.messageCount === 'number') {
    score += weights.messageCount * (messageCountScore(inputs.messageCount) / 100);
    totalWeight += weights.messageCount;
  }

  if (typeof inputs.firstReplyHours === 'number') {
    score += weights.replyTime * (replyTimeScore(inputs.firstReplyHours) / 100);
    totalWeight += weights.replyTime;
  }

  if (typeof inputs.bothVerified === 'boolean') {
    score += weights.bothVerified * (inputs.bothVerified ? 1 : 0);
    totalWeight += weights.bothVerified;
  }

  if (typeof inputs.interestOverlapRatio === 'number') {
    score += weights.interestOverlap * inputs.interestOverlapRatio;
    totalWeight += weights.interestOverlap;
  }

  if (!totalWeight) return null;
  return clampPercent((score / totalWeight) * 100);
};

export const computeConversationSignalLabel = (inputs: ConversationSignalInputs) => {
  const rows = sortRows(inputs.rows ?? []);
  const totalMessages =
    typeof inputs.messageCount === 'number' ? Math.max(inputs.messageCount, rows.length) : rows.length;

  if (totalMessages < 4 || rows.length < 4) return null;

  const turnSwitches = computeTurnSwitchCount(rows);
  const recentMessages = computeRecentMessageCount(rows, 7);
  const activeDays = computeActiveDayCount(rows);
  const reciprocityRatio = computeReciprocityRatio(rows, inputs.userId, inputs.peerId);
  const score =
    computeMatchScorePercent({
      messageCount: inputs.messageCount,
      firstReplyHours: inputs.firstReplyHours,
      bothVerified: inputs.bothVerified,
      interestOverlapRatio: inputs.interestOverlapRatio,
    }) ?? 0;

  if (activeDays >= 3 && turnSwitches >= 6 && reciprocityRatio >= 0.58 && score >= 60) {
    return 'Consistent chemistry';
  }

  if (recentMessages >= 8 && turnSwitches >= 5 && reciprocityRatio >= 0.5) {
    return 'Strong momentum';
  }

  if (reciprocityRatio >= 0.68 && totalMessages >= 8) {
    return 'High reciprocity';
  }

  if (turnSwitches >= 4 && (typeof inputs.firstReplyHours !== 'number' || inputs.firstReplyHours <= 24)) {
    return 'Great flow';
  }

  return null;
};

export type { ConversationSignalInputs, MatchScoreInputs };
