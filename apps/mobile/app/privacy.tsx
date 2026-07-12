import { Linking, StyleSheet, View } from "react-native";
import { AppSymbol, AppText, Button, Screen, symbols } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";

const sections = [
  {
    title: "What Context stores",
    body: "The people and profile details you choose to save—including optional phone, email, social links, and photos—plus events, notes, badge credentials, preferences, confirmed public-source URLs, and pending suggestions. Context does not require an account.",
  },
  {
    title: "Where it goes",
    body: "Your relationship workspace stays in this app’s local storage. iOS backups may include app data according to your Apple backup settings; the downloaded AI model and its cache are excluded. JSON exports are portable and unencrypted, so store them somewhere you trust.",
  },
  {
    title: "Camera and App Lock",
    body: "The camera is active only while you scan a Context QR badge; frames are not saved. If you enable App Lock, iOS handles Face ID or Touch ID and Context never receives biometric data.",
  },
  {
    title: "Contacts import",
    body: "Contacts access is optional and begins only after you choose Import. For people you select, Context can copy the name, company, job title, and available phone, email, social-profile, and profile-thumbnail details after showing a review. It never modifies Contacts or copies Contacts notes, birthdays, or postal addresses.",
  },
  {
    title: "On-device dictation",
    body: "Microphone access begins only after you tap a visible Dictate control in a person or memory form. Apple’s on-device Speech framework converts live audio to editable text. Context does not save the audio or upload audio or transcripts.",
  },
  {
    title: "Photos and documents",
    body: "A profile photo is copied into Context only after you choose it with the system photo picker. A Contacts import can also use an available thumbnail from a person you select. A people-list PDF is read only after you choose it from Files; its text and Gemma extraction stay on this device, and you review the people before import.",
  },
  {
    title: "Network use",
    body: "On iPhone, Gemma inference runs on-device. If you download the public model, Context contacts Hugging Face for that file only and verifies its published digest. Other requests occur only when you open a public search or ask Update Watch to check a source you confirmed. Relationship notes are never added to those requests.",
  },
  {
    title: "Your control",
    body: "You can export your workspace, delete individual memories or people, remove public sources, or erase the entire local workspace from Settings.",
  },
];

export default function PrivacyScreen() {
  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.summary}>
        <View style={styles.summaryIcon}>
          <AppSymbol name={symbols.shield} size={24} tone="tint" weight="semibold" />
        </View>
        <View style={styles.summaryCopy}>
          <AppText emphasis="semibold" role="headline">Local-first, without advertising or analytics</AppText>
          <AppText role="footnote" tone="secondary">Effective July 11, 2026</AppText>
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
          onPress={() => { void Linking.openURL("https://github.com/Fink692/context-memory-aid"); }}
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
  summaryIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.surface },
  summaryCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  document: { gap: spacing.xl },
  section: { gap: spacing.sm },
  support: { gap: spacing.md, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xl },
});
