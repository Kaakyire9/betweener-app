// @ts-nocheck
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  fetch: jest.fn(async () => ({
    type: "wifi",
    isConnected: true,
    isInternetReachable: true,
    details: null,
  })),
}));

jest.mock("expo", () => ({
  useEvent: (_emitter: any, _eventName: string, initialState: any) => initialState ?? {},
  requireNativeModule: jest.fn(() => ({})),
}));

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock("react-native-mmkv", () => {
  const store = new Map<string, string>();
  const readValue = (key: string) => store.get(key);
  return {
    createMMKV: jest.fn(() => ({
      getString: jest.fn((key: string) => readValue(key)),
      getNumber: jest.fn((key: string) => {
        const value = readValue(key);
        return value == null ? undefined : Number(value);
      }),
      getBoolean: jest.fn((key: string) => {
        const value = readValue(key);
        return value == null ? undefined : value === "true";
      }),
      set: jest.fn((key: string, value: string | number | boolean) => {
        store.set(key, String(value));
      }),
      delete: jest.fn((key: string) => {
        store.delete(key);
      }),
      contains: jest.fn((key: string) => store.has(key)),
      clearAll: jest.fn(() => {
        store.clear();
      }),
    })),
  };
});

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
