import { useState } from "react";
import { Platform, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppSymbol,
  AppText,
  BrandMark,
  Button,
  ListRow,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

type Step = 0 | 1 | 2;

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>(0);
  const [localToolsEnabled, setLocalToolsEnabled] = useState(true);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const setHasSeenContactImportPrompt = useAppStore((state) => state.setHasSeenContactImportPrompt);
  const router = useRouter();

  const finish = (loadSample: boolean, importFromContacts = false) => {
    completeOnboarding(localToolsEnabled, loadSample);
    setHasSeenContactImportPrompt(true);
    router.replace(importFromContacts ? "/contacts-import" : "/home");
  };

  return (
    <Screen
      contentContainerStyle={styles.screen}
      safeEdges={["top", "right", "bottom", "left"]}
    >
      <View
        accessibilityLabel={`Step ${step + 1} of 3`}
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 3, now: step + 1, text: `Step ${step + 1} of 3` }}
        accessible
        style={styles.progress}
      >
        {[0, 1, 2].map((value) => <View key={value} style={[styles.progressDot, value === step && styles.progressDotActive]} />)}
      </View>

      {step === 0 ? (
        <View style={styles.welcome}>
          <BrandMark size={84} />
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="largeTitle">Remember the people who matter.</AppText>
            <AppText tone="secondary">From work and school to your neighborhood, a shop, travel, or an event, Context gives you a private place to remember who you met and what matters next.</AppText>
          </View>
          <View style={styles.previewMark}>
            <AppSymbol name={symbols.people} size={30} tone="tint" weight="semibold" />
            <AppText emphasis="semibold" role="headline">Your relationships, not a stranger search</AppText>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepBody}>
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="title1">Private by design.</AppText>
            <AppText tone="secondary">The useful context stays under your control.</AppText>
          </View>
          <ListSection>
            <ListRow
              symbol={symbols.shield}
              subtitle="Context only searches people you chose to save."
              title="Your people only"
            />
            <ListRow
              symbol={symbols.camera}
              subtitle="The camera opens only while you scan a Context badge."
              title="A deliberate camera"
            />
            <ListRow
              last
              symbol={symbols.sparkles}
              subtitle="Suggestions remain editable until you choose to save them."
              title="Reviewable assistance"
            />
          </ListSection>
          <ListSection footer={Platform.OS === "ios" ? "Gemma can be downloaded later in Settings. Non-AI tools work immediately." : "You can change this later in Settings."}>
            <ListRow
              accessoryNode={(
                <Switch
                  accessibilityLabel="Private smart assist"
                  onValueChange={setLocalToolsEnabled}
                  trackColor={{ false: colors.fillStrong, true: colors.primary }}
                  value={localToolsEnabled}
                />
              )}
              last
              subtitle={Platform.OS === "web" ? "Use a model running on this computer" : "Create private drafts and conversation prompts"}
              symbol={symbols.model}
              title="Private smart assist"
            />
          </ListSection>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepBody}>
          <View style={styles.importSymbol}>
            <AppSymbol name={symbols.import} size={36} tone="tint" weight="semibold" />
          </View>
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="title1">Bring in your people.</AppText>
            <AppText tone="secondary">Choose exactly who to copy. Context can bring in names, companies, roles, and available phone, email, social, and profile-thumbnail details—never Contacts notes, birthdays, or postal addresses.</AppText>
          </View>
          <View style={styles.finalActions}>
            {Platform.OS !== "web" ? (
              <Button onPress={() => finish(false, true)} symbol={symbols.import}>Choose from Contacts</Button>
            ) : (
              <Button onPress={() => finish(true)} symbol={symbols.people}>Try with sample people</Button>
            )}
            {Platform.OS !== "web" ? <Button onPress={() => finish(true)} variant="secondary">Try with sample people</Button> : null}
            <Button onPress={() => finish(false)} variant="quiet">Start with an empty workspace</Button>
          </View>
          <AppText role="footnote" style={styles.footnote} tone="secondary">Sample profiles are fictional and can be erased at any time.</AppText>
        </View>
      ) : null}

      {step < 2 ? (
        <View style={styles.nextAction}>
          <Button onPress={() => setStep((step + 1) as Step)}>Continue</Button>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  progress: { minHeight: 24, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.sm },
  progressDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.fillStrong },
  progressDotActive: { width: 22, backgroundColor: colors.primary },
  welcome: { flex: 1, minHeight: 540, justifyContent: "center", alignItems: "flex-start", gap: spacing.xl },
  stepBody: { flex: 1, minHeight: 520, justifyContent: "center", gap: spacing.xl },
  heroCopy: { width: "100%", gap: spacing.md },
  previewMark: { width: "100%", flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.primarySoft, padding: spacing.lg },
  importSymbol: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.feature, borderCurve: "continuous", backgroundColor: colors.primarySoft },
  finalActions: { gap: spacing.sm },
  footnote: { textAlign: "center" },
  nextAction: { marginTop: "auto" },
});
