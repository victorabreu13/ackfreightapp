import { Alert, Platform } from "react-native";

// react-native-web's Alert.alert() is a hard no-op (it does nothing at all,
// not even a browser dialog), so every confirm/error dialog in this app was
// silently invisible on the website. These helpers fall back to the
// browser's own window.confirm/alert on web and use the real native Alert
// everywhere else.
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

export function confirmAction(
  options: {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
  },
  onConfirm: () => void
) {
  const { title, message, confirmLabel = "OK", cancelLabel = "Cancel", destructive } = options;

  if (Platform.OS === "web") {
    const text = message ? `${title}\n\n${message}` : title;
    if (window.confirm(text)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}
