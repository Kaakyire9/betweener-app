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

  it("opens image media from the bubble press path", async () => {
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

    const { getByTestId, getByText } = await render(
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

    await fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onViewImage).toHaveBeenCalledWith("https://example.com/image.jpg");
  }, 15_000);

  it("explains terminal image moderation failures without offering a futile retry", async () => {
    const onRetryFailedMessage = jest.fn();
    const item = {
      id: "rejected-image",
      clientMessageId: "rejected-image",
      text: "",
      senderId: "me",
      timestamp: new Date("2026-09-20T12:00:00.000Z"),
      type: "image",
      imageUrl: "file:///rejected-image.jpg",
      status: "failed",
      sendErrorCode: "image_content_not_allowed",
      reactions: [],
    };

    const { getByLabelText, getByText } = await render(
      <MediaMessageContent
        item={item}
        isMyMessage
        timeLabel="12:00"
        styles={styles}
        theme={Colors.light}
        isDark={false}
        receiptPulseStyle={{}}
        onRetryFailedMessage={onRetryFailedMessage}
      />
    );

    expect(getByText("Not sent · Choose another")).toBeTruthy();
    expect(getByText(/appears to contain nudity/)).toBeTruthy();
    await fireEvent.press(getByLabelText("Open photo"));
    expect(onRetryFailedMessage).not.toHaveBeenCalled();
  });

  it("keeps provider outages retryable without policy-violation copy", async () => {
    const item = {
      id: "provider-unavailable-image",
      clientMessageId: "provider-unavailable-image",
      text: "",
      senderId: "me",
      timestamp: new Date("2026-09-20T12:00:00.000Z"),
      type: "image",
      imageUrl: "file:///retryable-image.jpg",
      status: "failed",
      sendErrorCode: "image_moderation_unavailable",
      reactions: [],
    };

    const screen = await render(
      <MediaMessageContent
        item={item}
        isMyMessage
        timeLabel="12:00"
        styles={styles}
        theme={Colors.light}
        isDark={false}
        receiptPulseStyle={{}}
        onRetryFailedMessage={jest.fn()}
      />
    );

    expect(screen.getByText("Couldn’t check this photo · Try again")).toBeTruthy();
    expect(screen.getByText("Something interrupted the safety check. Try again.")).toBeTruthy();
    expect(screen.queryByText(/doesn’t meet Betweener’s media guidelines/i)).toBeNull();
  });

  it("renders a picker-local preview while media is being prepared", async () => {
    const item = {
      id: "preparing-image",
      clientMessageId: "preparing-image",
      text: "",
      senderId: "me",
      timestamp: new Date("2026-09-22T12:00:00.000Z"),
      type: "image",
      imageUrl: "file:///picker-image.jpg",
      offlineImageUri: "file:///picker-image.jpg",
      status: "sending",
      mediaItems: [{
        attachmentId: "attachment-preparing",
        index: 0,
        type: "image",
        storagePath: "",
        localUri: "file:///picker-image.jpg",
        transferState: "preparing",
        uploadProgress: 0,
      }],
      reactions: [],
    };

    const screen = await render(
      <MediaMessageContent
        item={item}
        isMyMessage
        timeLabel="12:00"
        styles={styles}
        theme={Colors.light}
        isDark={false}
        receiptPulseStyle={{}}
      />
    );

    expect(screen.getByText("Preparing...")).toBeTruthy();
    expect(screen.getByLabelText("Open photo")).toBeTruthy();
  });

  it("renders album progress and opens or manages the hidden +N item by stable index", async () => {
    const onViewImage = jest.fn();
    const onManageAlbumItem = jest.fn();
    const mediaItems = Array.from({ length: 5 }, (_, index) => ({
      attachmentId: `attachment-${index}`,
      index,
      type: "image",
      storagePath: "",
      localUri: `file:///album-${index}.jpg`,
      width: index % 2 === 0 ? 900 : 600,
      height: index % 2 === 0 ? 600 : 900,
      transferState: index === 0 ? "uploading" : "queued",
      uploadProgress: index === 0 ? 0.42 : 0,
    }));
    const item = {
      id: "album-5",
      clientMessageId: "album-5",
      text: "Album caption",
      senderId: "me",
      timestamp: new Date("2026-09-19T12:00:00.000Z"),
      type: "image",
      status: "sending",
      mediaItems,
      mediaExpectedCount: 5,
      reactions: [],
    };

    const { getByLabelText, getByText } = await render(
      <MediaMessageContent
        item={item}
        isMyMessage
        timeLabel="12:00"
        styles={styles}
        theme={Colors.light}
        isDark={false}
        receiptPulseStyle={{}}
        onViewImage={onViewImage}
        onManageAlbumItem={onManageAlbumItem}
      />
    );

    expect(getByText("42%")).toBeTruthy();
    expect(getByText("+1")).toBeTruthy();
    const moreTile = getByLabelText("Open 1 more photo");

    await fireEvent.press(moreTile);
    expect(onViewImage).toHaveBeenCalledWith(item, "file:///album-4.jpg", 4);

    fireEvent(moreTile, "longPress");
    expect(onManageAlbumItem).toHaveBeenCalledWith(item, 4);
  });

  it("opens documents from the bubble press path", async () => {
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

    const { getByTestId, getByText } = await render(
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

    await fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onOpenDocument).toHaveBeenCalledWith(item.document);
  });

  it("opens shared locations from the bubble press path", async () => {
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

    const { getByTestId, getByText } = await render(
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

    await fireEvent.press(getByTestId("chat-message-bubble-pressable"));

    expect(onOpenLocation).toHaveBeenCalledWith(item);
  });

  it("lets the sender stop an active live location share", async () => {
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

    const { getByTestId, getByText } = await render(
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

    await fireEvent.press(getByTestId("chat-location-stop-sharing"));

    expect(onStopLiveShare).toHaveBeenCalledWith("live-1");
  });
});
