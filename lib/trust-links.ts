import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

export const TRUST_LINKS = {
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || "https://getbetweener.com/privacy",
  terms: process.env.EXPO_PUBLIC_TERMS_URL || "https://getbetweener.com/terms",
  cookies: process.env.EXPO_PUBLIC_COOKIES_URL || "https://getbetweener.com/cookies",
  childSafety: process.env.EXPO_PUBLIC_CHILD_SAFETY_URL || "https://getbetweener.com/child-safety",
  supportSite: process.env.EXPO_PUBLIC_SUPPORT_URL || "https://getbetweener.com/support",
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@getbetweener.com",
  childSafetyEmail: process.env.EXPO_PUBLIC_CHILD_SAFETY_EMAIL || "hello@getbetweener.com",
} as const;

export async function openExternalUrl(url: string) {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      controlsColor: "#6D28D9",
      showTitle: true,
    });
    return true;
  } catch {
    await Linking.openURL(url);
    return true;
  }
}

export async function openSupportEmail(subject?: string, body?: string) {
  return openEmail(TRUST_LINKS.supportEmail, subject, body);
}

export async function openChildSafetyEmail(subject?: string, body?: string) {
  return openEmail(TRUST_LINKS.childSafetyEmail, subject, body);
}

async function openEmail(recipient: string, subject?: string, body?: string) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  const url = `mailto:${recipient}${query ? `?${query}` : ""}`;
  return openExternalUrl(url);
}
