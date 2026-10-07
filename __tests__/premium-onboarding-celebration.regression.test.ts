import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const arrival = read('../components/onboarding/OnboardingArrivalCelebration.tsx');
const portal = read('../components/onboarding/AnimatedCompletionPortal.tsx');
const completeStep = read('../components/onboarding/steps/PremiumOnboardingCompleteStep.tsx');
const flow = read('../components/onboarding/PremiumOnboardingFlow.tsx');
const vibes = read('../app/(tabs)/_vibes.tsx');
const handoff = read('../lib/onboarding/premium-onboarding.celebration.ts');

test('arrival celebration is personalized, deliberate, and user controlled', () => {
  assert.match(arrival, /Welcome, \$\{firstName\}/);
  assert.match(arrival, /avatarUrl/);
  assert.match(arrival, /Enter Vibes/);
  assert.match(arrival, /accessibilityViewIsModal/);
  assert.doesNotMatch(arrival, /setTimeout\(onDismiss,\s*3[0-9]{3}/);
  assert.match(arrival, /setTimeout\(onDismiss,\s*280\)/);
  assert.match(arrival, /adjustsFontSizeToFit/);
  assert.match(arrival, /minimumFontScale=\{0\.72\}/);
  assert.match(arrival, /Private by design · Yours to refine/);
});

test('celebration respects reduced motion and cleans up continuous animation', () => {
  assert.match(arrival, /useReducedMotion/);
  assert.match(arrival, /cancelAnimation/);
  assert.match(arrival, /AccessibilityInfo\.announceForAccessibility/);
  assert.match(portal, /useReducedMotion/);
  assert.match(portal, /cancelAnimation/);
  assert.match(portal, /avatarReveal\.value = withDelay/);
  assert.match(portal, /styles\.avatarAura/);
  assert.match(arrival, /ImpactFeedbackStyle\.Medium/);
});

test('server-confirmed completion transforms the personalized portal before navigation', () => {
  assert.match(completeStep, /celebrating=\{profileCreated\}/);
  assert.match(completeStep, /avatarUri=\{avatarUri\}/);
  assert.match(flow, /setProfileCreated\(true\)/);
  assert.match(flow, /\}, 1500\);/);
  assert.match(flow, /onboardingCelebration: "1"/);
  assert.match(flow, /markPendingOnboardingCelebration/);
  assert.doesNotMatch(flow, /router\.dismissAll\(\)/);
});

test('Vibes arrival consumes refreshed profile identity and stable dismissal', () => {
  assert.match(vibes, /dismissOnboardingCelebration = useCallback/);
  assert.match(vibes, /avatarUrl=\{\(profile as any\)\?\.avatar_url/);
  assert.match(vibes, /name=\{\(profile as any\)\?\.full_name/);
  assert.match(vibes, /arrival_celebration_viewed/);
  assert.match(vibes, /arrival_celebration_completed/);
  assert.match(vibes, /consumePendingOnboardingCelebration/);
  assert.match(vibes, /consumeRecentOnboardingCompletion/);
  assert.match(handoff, /CELEBRATION_TTL_MS/);
  assert.match(handoff, /RECENT_COMPLETION_WINDOW_MS\s*=\s*30\s*\*\s*60\s*\*\s*1000/);
  assert.match(handoff, /celebrationSeenKey/);
  assert.match(handoff, /AsyncStorage\.removeItem/);
});
