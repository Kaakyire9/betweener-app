import type { LiveQuorumSnapshot } from '../application/live-models.ts';

export const liveQuorumProgress = (quorum: LiveQuorumSnapshot) =>
  Math.min(1, quorum.attendanceCount / Math.max(1, quorum.minimumAttendance));

export const liveQuorumCopy = (quorum: LiveQuorumSnapshot) => {
  if (quorum.reached) {
    if (!quorum.currentlyViable) {
      return 'This Live is confirmed. Attendance has changed, so the Host may review the room before it begins.';
    }
    return quorum.pairabilityRequired
      ? 'Enough people are coming for the room and its introductions to work well.'
      : 'Enough people are coming for this Live to go ahead.';
  }
  const placesNeeded = Math.max(0, quorum.minimumAttendance - quorum.attendanceCount);
  if (placesNeeded > 0) {
    return `${placesNeeded} more ${placesNeeded === 1 ? 'person' : 'people'} will bring the room closer to confirmation.`;
  }
  return 'Attendance is growing. We are still making sure the room can create thoughtful introductions.';
};
