// @ts-nocheck
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-blur", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    BlurView: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    LinearGradient: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock("expo-video", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    VideoView: ({ children, ...props }: any) => React.createElement(View, props, children),
    useVideoPlayer: jest.fn(() => ({
      play: jest.fn(),
      pause: jest.fn(),
      replace: jest.fn(),
    })),
  };
});

jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
    Heavy: "Heavy",
  },
  NotificationFeedbackType: {
    Success: "Success",
    Warning: "Warning",
    Error: "Error",
  },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = ({ children, ...props }: any) => React.createElement(View, props, children);
  return {
    MaterialCommunityIcons: Icon,
  };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const React = require("react");
  const { View } = require("react-native");
  const MaterialCommunityIcons = ({ children, ...props }: any) => React.createElement(View, props, children);
  return MaterialCommunityIcons;
});

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Icon = (props: any) => React.createElement(View, props);
  return new Proxy(
    {},
    {
      get: () => Icon,
    }
  );
});

jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const { View } = require("react-native");
  const gesture = () => {
    const api: any = {};
    api.activeOffsetY = jest.fn(() => api);
    api.failOffsetX = jest.fn(() => api);
    api.minDistance = jest.fn(() => api);
    api.onUpdate = jest.fn(() => api);
    api.onEnd = jest.fn(() => api);
    api.onFinalize = jest.fn(() => api);
    return api;
  };
  const Wrapper = ({ children, ...props }: any) => React.createElement(View, props, children);
  return {
    State: { ACTIVE: 4 },
    Gesture: { Pan: gesture },
    GestureDetector: Wrapper,
    GestureHandlerRootView: Wrapper,
    PanGestureHandler: Wrapper,
  };
});
