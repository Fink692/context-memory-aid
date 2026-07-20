import { useState } from "react";
import { Linking, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppSymbol, AppText, Button, ErrorBanner, Screen, symbols } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { shouldStackSharedRow } from "@/lib/accessibility-layout";

const sections = [
  {
    title: "What Context stores",
    body: "The people and profile details you choose to save—including optional phone, email, social links, and photos—plus events, memories, follow-ups, and preferences. Context does not require an account.",
  },
  {
    title: "Where it goes",
    body: "Your relationship workspace stays in Context. iOS backups may include app data according to your Apple backup settings; the downloaded AI model and its cache are excluded. JSON exports are portable and unencrypted, so store them somewhere you trust.",
  },
  {
    title: "App Lock",
    body: "If you enable App Lock, iOS handles Face ID or Touch ID and Context never receives biometric data.",
  },
  {
    title: "Contacts import",
    body: "Contacts access is optional and begins only after you choose Import. For people you select, Context can copy the name, company, job title, and available phone, email, and social-profile details after showing a review. It never modifies Contacts or copies Contacts notes, birthdays, or postal addresses.",
  },
  {
    title: "Contact sharing",
    body: "Sharing begins only after you review the selected contact-card fields. A QR code is created and scanned on-device, and a shared vCard can leave through an app you choose in the iOS share sheet. Memories, relationship notes, events, photos, and internal identifiers are never included. Anyone who receives a card can keep or forward that copy.",
  },
  {
    title: "Dictation",
    body: "Microphone access begins only after you tap a visible Dictate control in a person or memory form. Apple speech recognition converts live audio to editable text. Context does not save the audio or upload audio or transcripts.",
  },
  {
    title: "Photos and documents",
    body: "A profile photo is copied into Context only after you choose it with the system photo picker. A people-list PDF is read only after you choose it from Files, and every extracted person is shown for review before import.",
  },
  {
    title: "Network use",
    body: "If you download the public Gemma model, Context contacts Hugging Face for that file only and verifies its published digest. Other network links open only after you tap them. Relationship notes are never added to those requests.",
  },
  {
    title: "Your control",
    body: "You can export your workspace, delete individual memories or people, or erase the entire workspace from Settings.",
  },
];

export default function PrivacyScreen() {
  const [error, setError] = useState<string>();
  const { fontScale, width } = useWindowDimensions();
  const stackSummary = shouldStackSharedRow({ fontScale, width });

  const openSupport = async () => {
    setError(undefined);
    try {
      await Linking.openURL("https://github.com/Fink692/context-memory-aid");
    } catch {
      setError("Project support could not be opened right now.");
    }
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <ErrorBanner message={error} />
      <View key={stackSummary ? "stacked" : "inline"} style={[styles.summary, stackSummary && styles.summaryStacked]}>
        <View style={styles.summaryIcon}>
          <AppSymbol name={symbols.shield} size={24} tone="tint" weight="semibold" />
        </View>
        <View style={[styles.summaryCopy, stackSummary && styles.summaryCopyStacked]}>
          <AppText emphasis="semibold" role="headline">Privacy, without advertising or analytics</AppText>
          <AppText role="footnote" tone="secondary">Effective July 18, 2026</AppText>
        </View>
      </View>

      <View style={styles.document}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText accessibilityRole="header" emphasis="semibold" role="title3">{section.title}</AppText>
            <AppText tone="secondary">{section.body}</AppText>
          </View>
        ))}
      </View>

      <View style={styles.support}>
        <AppText accessibilityRole="header" emphasis="semibold" role="title3">Questions or support</AppText>
        <AppText tone="secondary">Review the source or report a privacy concern through the project repository.</AppText>
        <Button
          onPress={() => { void openSupport(); }}
          symbol={symbols.share}
          variant="secondary"
        >
          Open Project Support
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  summary: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.primarySoft, padding: spacing.lg },
  summaryStacked: { flexDirection: "column", alignItems: "flex-start" },
  summaryIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  summaryCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  summaryCopyStacked: { width: "100%", flex: 0 },
  document: { gap: spacing.xl },
  section: { gap: spacing.sm },
  support: { gap: spacing.md, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xl },
});
