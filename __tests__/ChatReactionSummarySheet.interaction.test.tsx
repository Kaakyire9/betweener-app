// @ts-nocheck
import React from "react";
import { Modal } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

import ChatReactionSummarySheet from "@/components/chat/ChatReactionSummarySheet";
import { Colors } from "@/constants/theme";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

const reactionSheetMessage = {
  id: "message-1",
  text: "Hello",
  senderId: "peer-1",
  timestamp: new Date("2026-05-22T11:00:00.000Z"),
  type: "text",
  reactions: [
    { userId: "me", emoji: "❤️" },
    { userId: "peer-1", emoji: "🔥" },
    { userId: "peer-2", emoji: "🔥" },
  ],
};

function StatefulReactionSheet(props: Record<string, any>) {
  const [selectedEmoji, setSelectedEmoji] = React.useState<string | null>(null);
  const reactionSheetList = React.useMemo(() => {
    if (!selectedEmoji) return reactionSheetMessage.reactions;
    return reactionSheetMessage.reactions.filter((reaction) => reaction.emoji === selectedEmoji);
  }, [selectedEmoji]);

  const reactionSummary = React.useMemo(() => {
    const counts = new Map<string, number>();
    reactionSheetMessage.reactions.forEach((reaction) => {
      counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
    });
    return Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, []);

  return (
    <Modal transparent visible>
      <ChatReactionSummarySheet
        visible
        styles={styles}
        theme={Colors.light}
        isDark={false}
        currentUserId="me"
        currentUserAvatarUrl="https://example.com/me.jpg"
        reactionSheetMessage={reactionSheetMessage}
        reactionSummary={reactionSummary}
        reactionSheetList={reactionSheetList}
        reactionSheetEmoji={selectedEmoji}
        reactionProfiles={{
          "peer-1": { name: "Ayo", avatar: "https://example.com/ayo.jpg" },
          "peer-2": { name: "Kojo", avatar: null },
        }}
        reactionProfilesLoading={false}
        fallbackAvatarSource={{ uri: "https://example.com/fallback.jpg" }}
        onClose={props.onClose}
        onSelectEmoji={setSelectedEmoji}
      />
    </Modal>
  );
}

describe("ChatReactionSummarySheet interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders total reactions, current user label, and filters by emoji", () => {
    const onClose = jest.fn();
    const { getByText, getByTestId, queryByText } = render(
      <StatefulReactionSheet onClose={onClose} />
    );

    expect(getByText("3 total")).toBeTruthy();
    expect(getByText("You")).toBeTruthy();
    expect(getByText("Ayo")).toBeTruthy();
    expect(getByText("Kojo")).toBeTruthy();

    fireEvent.press(getByTestId("chat-reaction-filter-1"));

    expect(queryByText("You")).toBeNull();
    expect(getByText("Ayo")).toBeTruthy();
    expect(getByText("Kojo")).toBeTruthy();

    fireEvent.press(getByTestId("chat-reaction-filter-all"));

    expect(getByText("You")).toBeTruthy();
  });

  it("shows loading state and closes from close button and backdrop", () => {
    const onClose = jest.fn();
    const { getByTestId, getByText } = render(
      <Modal transparent visible>
        <ChatReactionSummarySheet
          visible
          styles={styles}
          theme={Colors.light}
          isDark={false}
          currentUserId="me"
          currentUserAvatarUrl={null}
          reactionSheetMessage={reactionSheetMessage}
          reactionSummary={[{ emoji: "❤️", count: 1 }]}
          reactionSheetList={reactionSheetMessage.reactions}
          reactionSheetEmoji={null}
          reactionProfiles={{}}
          reactionProfilesLoading
          fallbackAvatarSource={{ uri: "https://example.com/fallback.jpg" }}
          onClose={onClose}
          onSelectEmoji={jest.fn()}
        />
      </Modal>
    );

    expect(getByText("Loading profiles...")).toBeTruthy();

    fireEvent.press(getByTestId("chat-reaction-sheet-close"));
    fireEvent.press(getByTestId("chat-reaction-sheet-backdrop"));

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
