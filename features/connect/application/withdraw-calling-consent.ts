/** Reuses existing account preferences and terminal transition. No second authority. */
export async function withdrawCallingConsent(input: {
  hangup(): Promise<void>; setPreferences(voice: boolean, video: boolean): Promise<void>;
}) {
  // Dispatch both independently, including synchronous failures and hung leave.
  try { void input.hangup().catch(() => undefined); } catch { /* Authority still submits. */ }
  // Explicitly withdrawing both avoids a read/modify/write race re-enabling video.
  await input.setPreferences(false, false);
}
