import { Alert, Linking } from 'react-native';

type OpenSettingsPromptOptions = {
  cancelLabel?: string;
  confirmLabel?: string;
};

export function showOpenSettingsPrompt(
  title: string,
  message: string,
  options: OpenSettingsPromptOptions = {},
) {
  const { cancelLabel = 'Not now', confirmLabel = 'Open Settings' } = options;

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      onPress: () => {
        void Linking.openSettings();
      },
    },
  ]);
}
