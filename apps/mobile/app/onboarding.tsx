import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  AppSymbol,
  AppText,
  BrandMark,
  Button,
  ErrorBanner,
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
  const [finishBusy, setFinishBusy] = useState(false);
  const [error, setError] = useState<string>();
  const scrollRef = useRef<ScrollView>(null);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const setHasSeenContactImportPrompt = useAppStore((state) => state.setHasSeenContactImportPrompt);
  const router = useRouter();

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  const finish = async (loadSample: boolean, destination: "home" | "manual" | "contacts" | "file") => {
    setFinishBusy(true);
    setError(undefined);
    try {
      await completeOnboarding(false, loadSample);
      setHasSeenContactImportPrompt(true);
      if (destination === "manual") {
        router.replace({ pathname: "/contact/new", params: { global: "1" } });
        return;
      }
      if (destination === "contacts") {
        router.replace("/contacts-import");
        return;
      }
      if (destination === "file") {
        router.replace("/import");
        return;
      }
      router.replace("/home");
    } catch {
      setError("Context could not finish setup on this iPhone. Your choice is still here; try again.");
    } finally {
      setFinishBusy(false);
    }
  };

  return (
    <Screen
      contentContainerStyle={styles.screen}
      safeEdges={["top", "right", "bottom", "left"]}
      scrollRef={scrollRef}
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

      <ErrorBanner message={error} />

      {step === 0 ? (
        <View style={styles.welcome}>
          <BrandMark size={84} />
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="largeTitle">Remember the people who matter.</AppText>
            <AppText tone="secondary">Save what you learned, keep track of follow-ups, and walk into the next conversation prepared.</AppText>
          </View>
          <View style={styles.previewMark}>
            <AppSymbol name={symbols.people} size={30} tone="tint" weight="semibold" />
            <AppText emphasis="semibold" role="headline" style={styles.previewCopy}>
              People, memories, and what comes next
            </AppText>
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.stepBody}>
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="title1">Private by design.</AppText>
            <AppText tone="secondary">Your relationship context stays under your control.</AppText>
          </View>
          <ListSection>
            <ListRow
              symbol={symbols.shield}
              subtitle="Only people and memories you choose to add appear here."
              title="Saved by you"
            />
            <ListRow
              symbol={symbols.note}
              subtitle="Edit or delete anything whenever you want."
              title="Under your control"
            />
            <ListRow
              last
              symbol={symbols.sparkles}
              subtitle="Suggested content stays a draft until you save it."
              title="Review before saving"
            />
          </ListSection>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.stepBody}>
          <View style={styles.importSymbol}>
            <AppSymbol name={symbols.person} size={36} tone="tint" weight="semibold" />
          </View>
          <View style={styles.heroCopy}>
            <AppText accessibilityRole="header" emphasis="bold" role="title1">Add your first person.</AppText>
            <AppText tone="secondary">Start with a name and one useful detail. Everything else is optional.</AppText>
          </View>
          <View style={styles.finalActions}>
            <Button loading={finishBusy} onPress={() => { void finish(false, "manual"); }} symbol={symbols.plus}>Add Someone</Button>
            {Platform.OS !== "web" ? (
              <Button disabled={finishBusy} onPress={() => { void finish(false, "contacts"); }} symbol={symbols.import} variant="secondary">Choose from Contacts</Button>
            ) : null}
            <Button disabled={finishBusy} onPress={() => { void finish(false, "file"); }} symbol={symbols.import} variant="secondary">Import from File</Button>
            <Button disabled={finishBusy} onPress={() => { void finish(true, "home"); }} variant="quiet">Explore a Demo</Button>
          </View>
          <AppText role="footnote" style={styles.footnote} tone="secondary">Demo profiles are fictional and can be erased at any time.</AppText>
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
  previewCopy: { flex: 1, minWidth: 0, flexShrink: 1 },
  importSymbol: { width: 72, height: 72, alignItems: "center", justifyContent: "center", borderRadius: radius.feature, borderCurve: "continuous", backgroundColor: colors.primarySoft },
  finalActions: { gap: spacing.sm },
  footnote: { textAlign: "center" },
  nextAction: { marginTop: "auto" },
});
