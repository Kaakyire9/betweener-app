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

jest.mock("expo-clipboard", () => ({
  getStringAsync: jest.fn(async () => ""),
  setStringAsync: jest.fn(async () => true),
  hasStringAsync: jest.fn(async () => false),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: { version: "1.1.1", extra: {} },
    nativeAppVersion: "1.1.1",
    nativeBuildVersion: "1",
    executionEnvironment: "storeClient",
  },
  ExecutionEnvironment: { StoreClient: "storeClient" },
}));

jest.mock("expo-keep-awake", () => ({
  ExpoKeepAwakeTag: "ExpoKeepAwakeDefaultTag",
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(),
  isAvailableAsync: jest.fn(async () => true),
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///test-cache/",
  documentDirectory: "file:///test-documents/",
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  createUploadTask: jest.fn(() => ({
    uploadAsync: jest.fn(async () => ({ status: 200, body: "", headers: {} })),
    cancelAsync: jest.fn(async () => undefined),
  })),
  copyAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
  getInfoAsync: jest.fn(async () => ({ exists: false, isDirectory: false, size: 0 })),
  makeDirectoryAsync: jest.fn(async () => undefined),
  moveAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(async () => ""),
  writeAsStringAsync: jest.fn(async () => undefined),
}));

jest.mock("expo-sqlite", () => {
  const database = {
    closeAsync: jest.fn(async () => undefined),
    execAsync: jest.fn(async () => undefined),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    withTransactionAsync: jest.fn(async (task: () => Promise<void>) => task()),
  };
  return {
    openDatabaseAsync: jest.fn(async () => database),
    deleteDatabaseAsync: jest.fn(async () => undefined),
  };
});

jest.mock("expo-crypto", () => {
  const nodeCrypto = require("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) =>
      nodeCrypto.createHash("sha256").update(value).digest("hex")
    ),
    getRandomBytes: jest.fn((length: number) => new Uint8Array(nodeCrypto.randomBytes(length))),
    randomUUID: jest.fn(() => nodeCrypto.randomUUID()),
  };
});

jest.mock("expo-image", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Image: ({ children, ...props }: any) => React.createElement(View, props, children),
  };
});

jest.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
  manipulateAsync: jest.fn(async (uri: string) => ({
    uri,
    width: 1080,
    height: 1080,
  })),
}));

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
