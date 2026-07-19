// @ts-nocheck
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import ChatSafetyModal from "@/components/chat/ChatSafetyModal";
import { haptics } from "@/lib/haptics";

jest.mock("@/hooks/use-color-scheme", () => ({
  useColorScheme: () => "light",
}));

describe("ChatSafetyModal interactions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the safety copy when visible", async () => {
    const { getByText } = await render(
      <ChatSafetyModal visible onGotIt={jest.fn()} />
    );

    expect(getByText("Start the conversation")).toBeTruthy();
    expect(getByText("Keep private details off the table")).toBeTruthy();
    expect(getByText("Got it")).toBeTruthy();
  });

  it("triggers haptics and calls onGotIt when pressed", async () => {
    const onGotIt = jest.fn();
    const tapSpy = jest.spyOn(haptics, "tap");

    const { getByText } = await render(
      <ChatSafetyModal visible onGotIt={onGotIt} />
    );

    await fireEvent.press(getByText("Got it"));

    await waitFor(() => {
      expect(onGotIt).toHaveBeenCalledTimes(1);
    });
    expect(tapSpy).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when hidden", async () => {
    const { queryByText } = await render(
      <ChatSafetyModal visible={false} onGotIt={jest.fn()} />
    );

    expect(queryByText("Start the conversation")).toBeNull();
  });
});
