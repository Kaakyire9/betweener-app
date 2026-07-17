// @ts-nocheck
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import ChatMessageBubblePressable from "@/components/chat/ChatMessageBubblePressable";
import {
  DocumentMessageContent,
  LocationMessageContent,
  MediaMessageContent,
} from "@/components/chat/message-variants";
import { Colors } from "@/constants/theme";

const styles = new Proxy(
  {},
  {
    get: () => ({}),
  }
);

function VariantBubbleHarness({
  item,
  children,
  onViewImage = jest.fn(),
  onOpenDocument = jest.fn(),
  onOpenLocation = jest.fn(),
}) {
  return (
    <ChatMessageBubblePressable
      messageId={item.id}
      canRetryFailedText={false}
      styles={styles}
      isMyMessage={item.senderId === "me"}
      onFocus={jest.fn()}
      onRetryFailedMessage={jest.fn()}
      onLongPress={jest.fn()}
      onPressContent={() => {
        if (item.type === "image" && item.imageUrl) {
          onViewImage(item.offlineImageUri ?? item.imageUrl);
          return;
        }
        if (item.type === "document" && item.document?.url) {
          onOpenDocument(item.document);
          return;
        }
        if (item.type === "location" && item.location) {
          onOpenLocation(item);
        }
      }}
    >
      {children}
    </ChatMessageBubblePressable>
  );
}

describe("Chat message variant interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("opens image media from the bubble press path", () => {
    const onViewImage = jest.fn();
    const item = {
      id: "image-1",
      text: "Look at this",
      senderId: "peer-1",
      timestamp: new Date("2026-05-22T12:00:00.000Z"),
      type: "image",
      imageUrl: "https://example.com/image.jpg",
      reactions: [],
    };

    const { getByTestId, getByText } = render(
      <VariantBubbleHarness item={item} onViewImage={onViewImage}>
        <MediaMessageContent
          item={item}
          isMyMessage={false}
          timeLabel="12:00"
          styles={styles}
          theme={Colors.light}
          isDark={false}
          receiptPulseStyle={{}}
        />
      </VariantBubbleHarness>
    );

    expect(getByText("Look at this")).toBeTruthy();

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onViewImage).toHaveBeenCalledWith("https://example.com/image.jpg");
  });

  it("opens documents from the bubble press path", () => {
    const onOpenDocument = jest.fn();
    const item = {
      id: "doc-1",
      text: "",
      senderId: "me",
      timestamp: new Date("2026-05-22T12:10:00.000Z"),
      type: "document",
      document: {
        name: "brochure.pdf",
        url: "https://example.com/brochure.pdf",
        sizeLabel: "2.1 MB",
        typeLabel: "PDF",
      },
      reactions: [],
    };

    const { getByTestId, getByText } = render(
      <VariantBubbleHarness item={item} onOpenDocument={onOpenDocument}>
        <DocumentMessageContent
          item={item}
          isMyMessage
          styles={styles}
          theme={Colors.light}
        />
      </VariantBubbleHarness>
    );

    expect(getByText("brochure.pdf")).toBeTruthy();
    expect(getByText("2.1 MB | PDF")).toBeTruthy();

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onOpenDocument).toHaveBeenCalledWith(item.document);
  });

  it("opens shared locations from the bubble press path", () => {
    const onOpenLocation = jest.fn();
    const item = {
      id: "loc-1",
      text: "",
      senderId: "peer-1",
      timestamp: new Date("2026-05-22T12:20:00.000Z"),
      type: "location",
      location: {
        lat: 5.6037,
        lng: -0.187,
        label: "Accra Mall",
        address: "Spintex Rd",
      },
      reactions: [],
    };

    const { getByTestId, getByText } = render(
      <VariantBubbleHarness item={item} onOpenLocation={onOpenLocation}>
        <LocationMessageContent
          item={item}
          isMyMessage={false}
          styles={styles}
          theme={Colors.light}
          onStopLiveShare={jest.fn()}
          formatRemainingTime={() => "1h left"}
        />
      </VariantBubbleHarness>
    );

    expect(getByText("Accra Mall")).toBeTruthy();
    expect(getByText("Tap for directions")).toBeTruthy();

    fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onOpenLocation).toHaveBeenCalledWith(item);
  });

  it("lets the sender stop an active live location share", () => {
    const onStopLiveShare = jest.fn();
    const item = {
      id: "live-1",
      text: "",
      senderId: "me",
      timestamp: new Date("2026-05-22T12:30:00.000Z"),
      type: "location",
      location: {
        lat: 5.6037,
        lng: -0.187,
        label: "Live location",
        live: true,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
      reactions: [],
    };

    const { getByTestId, getByText } = render(
      <LocationMessageContent
        item={item}
        isMyMessage
        styles={styles}
        theme={Colors.light}
        onStopLiveShare={onStopLiveShare}
        formatRemainingTime={() => "59m left"}
      />
    );

    expect(getByText("Live")).toBeTruthy();
    expect(getByText("59m left")).toBeTruthy();

    fireEvent.press(getByTestId("chat-location-stop-sharing"));

    expect(onStopLiveShare).toHaveBeenCalledWith("live-1");
  });
});
