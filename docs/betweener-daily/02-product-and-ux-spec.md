# Product and UX specification

## Product promise and principles

**Promise:** “Two minutes of play, one fresh perspective, no match required.”

1. The solo game is complete entertainment. Insights, Gist, Circle and comparison are optional exits.
2. No streak loss, countdown anxiety, fake popularity, fabricated votes, shame copy, or pay-to-complete.
3. Results describe a choice in a fictional moment, not the person.
4. Private answers stay private. Circle receives a completion credit only.
5. Existing dating, chat and Circle permissions remain authoritative.

## Information architecture

Use one authenticated canonical route: `/daily`. Do not add a bottom tab.

- Vibes: “Today’s 2-minute play” card.
- Circles: “Play today / grow your selected Circle’s garden” card. This must work even with no Circle.
- Optional Gist footer: “Try today’s scenario” only when an approved immutable link exists.
- Deep link: `/daily?challenge=<public-id>`; the server still resolves eligibility/current version.

Proposed component tree:

```text
DailyRoute
├─ DailyHeader
├─ DailyStateBoundary
│  ├─ DailyPregameCard
│  ├─ WhatWouldYouDoGame
│  ├─ ReadTheRoomGame
│  ├─ DateRescueGame
│  ├─ DailyRecoveryCard
│  └─ DailyResult
│     ├─ ChoiceOutcome
│     ├─ CommunityAggregate (optional)
│     ├─ DailyInsightOffer (optional)
│     ├─ CircleGardenContribution (optional)
│     ├─ GistLinkCard (optional)
│     └─ MatchComparisonOffer (future flag)
├─ DailyInsightsRoute
├─ CircleGardenSheet
└─ DailyAccessibilityAnnouncer
```

## Compact wireframes

```text
PREGAME                         CHOICE / FEEDBACK
┌ Today on Betweener ───────┐   ┌ 1 of 3 ──────────────────┐
│ READ THE ROOM · 2 MIN     │   │ What would you do?       │
│ The Plus-One Question     │   │ [ Full option label    ] │
│ Play alone. Answers stay  │   │ [ Full option label    ] │
│ private.                  │   │ [ Full option label    ] │
│ [Play]       [Not today]  │   │ ✓ Choice saved / Pending│
└───────────────────────────┘   └──────────────────────────┘

RESULT                          AGGREGATE / LOW DATA
┌ Your ending ──────────────┐   ┌ Read the room ───────────┐
│ Kind clarity              │   │ You chose: Ask a friend  │
│ Authored outcome copy     │   │ Prediction: Go alone     │
│ [Explore another route]   │   │ Community: gathering…    │
│ [Why this matters]        │   │ Need more real responses │
└───────────────────────────┘   └──────────────────────────┘

DAILY INSIGHTS                  CIRCLE GARDEN
┌ My Daily Insights ────────┐   ┌ Connection Garden ──────┐
│ Recent choices suggest…   │   │ [ seed → sprout → bloom]│
│ Planning: clear plans     │   │ 8 / 15 completions       │
│ Based on 4 source plays   │   │ Your answer stays private│
│ [View sources] [Exclude]  │   │ [Contribute to Circle]   │
│ [Reset or delete]         │   └──────────────────────────┘
└───────────────────────────┘

GIST                            MATCH COMPARISON (FUTURE)
┌ Why this matters ─────────┐   ┌ Compare by consent ──────┐
│ Two-line neutral context  │   │ Share this one choice    │
│ [Read full saved Gist]    │   │ with an existing match?  │
│ Available without playing │   │ [Choose match] [No thanks]│
└───────────────────────────┘   └──────────────────────────┘

OFFLINE / ERROR
┌ Saved on this device ─────┐
│ We’ll confirm online.     │
│ No vote, Insight or garden│
│ credit has been added yet.│
│ [Retry] [Keep for later]  │
└───────────────────────────┘
```

## Lifecycle and screen states

| State | UI and behavior |
|---|---|
| Scheduled | No client countdown claim beyond server release time; show next availability in the user’s timezone. |
| Available | Format, estimated time, content note if needed, “Play” and “Not today.” No Circle/Compass gate. |
| Started | Version is locked; progress saved after each server-accepted answer and mirrored locally. |
| In progress | Resume at the last acknowledged step; clearly mark any locally pending answer. |
| Locally pending | “Saved on this device. We’ll confirm when you’re online.” Never show aggregate, insight evidence, or Quest credit as confirmed. |
| Completed | Memorable outcome first, then optional real aggregate, insight, Circle, Gist and comparison cards. |
| Replayed | Allow a private “revisit story” without new vote, evidence or Quest credit. Show original choice and clearly label exploration. |
| Expired | Resume within a server grace window only; otherwise show the outcome already confirmed or “This play has closed.” |
| Withdrawn | Remove prompts/results supplied by the withdrawn version. Preserve a minimal completion receipt; explain that content was withdrawn. |
| Error | Keep acknowledged progress. Offer retry; never restart or duplicate credit automatically. |
| No network | Cached eligible challenge can be explored. New completion is provisional until server validation. |

## Format interactions

### What Would You Do?

One fictional situation, 3–4 distinct choices, immediate authored outcome, optional neutral “Why this matters.” Choice buttons use full labels, not color alone. No right/wrong state unless the content is factual trivia.

### Read the Room

Step 1 asks what the member would choose. Step 2 separately asks which answer they predict the community selected. The result distinguishes **your choice**, **your prediction**, and **real community responses**. Aggregates appear only above the privacy threshold; otherwise: “The room is still gathering. Your answer is counted, but we need more responses before showing a pattern.”

### Date Rescue

Three decision steps. Each accepted option advances along a declared branch. The final state presents an authored ending and can offer “Explore another route” as a non-credit replay. The graph must be acyclic, bounded, and fully previewable by editors.

## Core journeys

### Solo

Open entry card → pregame → play → result → close. This is the primary success path and needs no social action.

### Daily Insights

Result → “Save this choice to Daily Insights” → plain-language consent → eligible evidence recorded → My Daily Insights. The member can inspect source plays, exclude one, reset all, withdraw consent, export or delete. Copy: “Recent choices suggest you often prefer clear plans. This is a reflection, not a label.” When evidence is insufficient: “Keep playing if it’s fun. We need a few varied choices before reflecting a pattern.”

### Circle Garden

Result → select one eligible Circle (or retain an explicitly selected default) → confirm “Contribute today’s completion” → server confirmation → aggregate garden grows. Copy never reveals answers or names. Switching Circles after credit is not allowed for that release day; selection can change for the next eligible day.

### Gist

Result → concise “Why this matters” → optional “Read the full Gist.” Gist remains readable and saveable without a play. Returning from Gist restores the result screen, not the game.

### Consented match comparison (post-MVP flag)

Result → choose an existing authorized match → create private invitation → counterpart explicitly accepts → both see only the agreed comparison → optionally open the existing chat. Declining is silent. No message is sent and no match is created.

## Daily Insights dimensions

MVP dimensions should be editorially comprehensible and non-clinical:

- communication approach: direct ↔ gentle/contextual;
- planning energy: planned ↔ spontaneous;
- repair approach: pause ↔ talk now;
- social energy: intimate ↔ group-oriented;
- affection expression: words ↔ actions.

Each eligible option may add a bounded weight from −1 to +1 to at most two dimensions. Require at least 4 eligible plays on 3 distinct release days and at least 2 independent supporting choices before displaying a reflection. Clamp totals, decay old evidence for display, and show no inference from cultural/faith trivia, jokes, safety/abuse scenarios, protected attributes, or skipped items. Do not compute compatibility or feed recommendations.

## Circle Garden

Five cosmetic weekly stages:

1. Seed — quest is open.
2. Sprout — 25% of target.
3. Leaves — 50%.
4. Bud — 75%.
5. Bloom — 100%; celebration remains available through weekly rollover.

Target recommendation: `max(3, min(40, ceil(eligible_active_members * 0.45) * 3))` weekly credits, frozen when the quest opens. This is a starting hypothesis, not a final formula. New members may contribute after joining but do not raise the frozen target. Leaving members’ valid historical credits remain aggregate. Archived Circles close new contributions; completed visuals remain read-only. No individual leaderboard or contributor list.

## Accessibility and device behavior

- VoiceOver/TalkBack: announce question number, selected option, server acceptance, pending status, result and garden milestone. Set headings and logical focus; move focus on branch transitions.
- Support at least 200% font scaling without clipped choices; switch grids to vertical stacks.
- Minimum 44×44 iOS / 48×48 Android targets. Do not encode format/result by color or animation alone.
- Reduced motion replaces card transitions, orbit effects and garden growth with fades/no motion. Haptics are optional and never the only confirmation.
- Contrast must be checked against actual `Colors` tokens, especially muted text in light mode (`constants/theme.ts:13`).
- Cache text content first; decorative media is optional, locally bundled where practical, WebP/AVIF with dimensions and a static fallback.
- Midrange Android target: no continuous full-screen particles, no unbounded lists, memoized step content, animations on UI thread only.
- Dark mode should derive from the existing deep teal surfaces; light mode uses the existing warm ivory base, pearl cards, deep-teal text and restrained gold/purple accents. Do not hard-code the aspirational `#071E22`, `#0F3D3E`, `#13A8A8` or `#7C5CFF` independently of `constants/theme.ts`; reconcile them through the shared token review.

## Complete sample content

### Sample A — What Would You Do?

**Title:** The Voice Note Plot Twist
**Setup:** You planned a first coffee for Saturday. Friday night, Sam sends a four-minute voice note saying work is chaotic and asks to decide “sometime tomorrow.” You were looking forward to it.

| Choice | Result |
|---|---|
| “No stress—message me when you know.” | **Open door.** You protect the light mood, but Saturday stays uncertain. You can still make your own plan instead of waiting by the phone. Mapping: planning −1, communication −0.5. |
| “I’m free until noon; confirm by 9 or let’s choose another day.” | **Kind clarity.** Sam has a simple decision and you keep control of your day. Mapping: planning +1, communication +1. |
| “This feels disorganised. Let’s leave it.” | **Clean exit.** You avoid uncertainty, though Sam gets no chance to repair a genuinely difficult week. Mapping: communication +0.5, repair −0.5. |
| Send a funny ‘calendar loading…’ GIF and suggest Sunday. | **Playful reset.** You signal interest and offer a concrete alternative without turning it into a lecture. Mapping: planning +0.5, communication −0.25. |

**Why this matters:** “Clear plans and warmth can coexist. The interesting part is which one you reach for first.” No majority or correctness.

### Sample B — Read the Room

**Title:** The Plus-One Question
**Prompt:** A friend invites you to a small birthday dinner where you know only the host. What would you most likely do?

1. Go alone and meet people.
2. Ask whether you can bring a friend.
3. Suggest catching up with the host another day.
4. Decide on the day based on your energy.

Then: “Which answer do you think the Betweener community chose most?” with the same four options.

Every own-choice × prediction combination leads to the same valid result structure:

- “You chose **{own label}**.”
- “You predicted **{predicted label}** would lead the room.”
- If threshold met: show coarse real percentages and “Your prediction matched/didn’t match today’s current distribution.”
- If threshold unmet: show the gathering copy above, no bars or implied winner.

No Compass mapping: this social/cultural prompt is intentionally excluded from inference.

### Sample C — Date Rescue

**Title:** The Museum Mix-Up
**Opening:** You and Ari arrive at different branches of the same museum with 45 minutes before closing.

**Step 1**

- A: Call and choose one branch together → Step 2A.
- B: Race across town without calling → Step 2B.
- C: Turn it into two solo tours and compare photos later → Step 2C.

**Step 2A:** Ari says their branch has the exhibit you wanted.

- A1: Go there and ask Ari to pick the first room → Ending E1.
- A2: Meet halfway for street food instead → Ending E2.
- A3: Keep your branch and video-call one artwork each → Ending E3.

**Step 2B:** Traffic stops moving.

- B1: Admit the race was optimistic and propose food → E2.
- B2: Keep going and hope → E4.
- B3: Call and create the one-artwork challenge → E3.

**Step 2C:** Ari loves the idea but asks for one shared rule.

- C1: Pick the strangest artwork → E5.
- C2: Pick one artwork that reminds you of home → E6.
- C3: Drop the rule and just wander → E7.

**Endings**

- E1, **The handover:** You get the exhibit and Ari gets to guide the opening. “A small plan turned a mistake into teamwork.”
- E2, **The unofficial exhibition:** Street-food wrappers become the evening’s collection. “Changing the plan saved the date, not the itinerary.”
- E3, **Two galleries, one conversation:** Your call becomes a surprisingly good shared tour. “Connection did not require the same room.”
- E4, **Closing credits:** You arrive as the doors close; Ari is laughing, not impressed. “Commitment is charming; updates are useful.”
- E5, **Curators of chaos:** The photo comparison is ridiculous and memorable.
- E6, **A little closer:** The choices open a warm conversation about home, with an optional content note determined by editorial review.
- E7, **Parallel play:** You both enjoy the freedom and meet afterward with stories.

Replay can explore another ending but cannot create another daily completion, vote, insight event, or Quest contribution.
