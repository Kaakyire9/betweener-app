type MatchScoreInputs = {
  messageCount?: number | null;
  firstReplyHours?: number | null;
  bothVerified?: boolean | null;
  interestOverlapRatio?: number | null;
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

export type { MatchScoreInputs };
