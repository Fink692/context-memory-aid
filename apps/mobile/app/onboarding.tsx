import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Eyebrow, Pill, Screen, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

const promises = [
  { number: "01", title: "Your network only", body: "Context only considers people you saved and attendees in the event you selected." },
  { number: "02", title: "You start every scan", body: "There is no continuous or background camera. Captures are discarded after matching." },
  { number: "03", title: "You approve every memory", body: "AI creates an editable draft. Nothing enters the timeline until you confirm it." },
];

export default function OnboardingScreen() {
  const [aiEnabled, setAiEnabled] = useState(false);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const router = useRouter();

  const continueToDemo = () => {
    completeOnboarding(aiEnabled);
    router.replace("/home");
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Pill tone="safe">Private relationship memory</Pill>
        <Eyebrow>Meet people like you remember them</Eyebrow>
        <Title>Your memory, right when it matters.</Title>
        <Body muted>
          A discreet refresher for people you already know—built for conference hallways, not stranger search.
        </Body>
      </View>

      <View style={styles.promiseList}>
        {promises.map((promise) => (
          <Card key={promise.number} style={styles.promiseCard}>
            <Text style={styles.promiseNumber}>{promise.number}</Text>
            <View style={styles.promiseCopy}>
              <Text style={styles.promiseTitle}>{promise.title}</Text>
              <Text style={styles.promiseBody}>{promise.body}</Text>
            </View>
          </Card>
        ))}
      </View>

      <Card style={styles.aiCard}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Enable OpenAI memory intelligence</Text>
            <Text style={styles.switchBody}>
              Sends your dictated note and the selected person’s profile timeline to the configured API. Face images are never sent.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Enable OpenAI memory intelligence"
            value={aiEnabled}
            onValueChange={setAiEnabled}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            thumbColor={aiEnabled ? colors.success : colors.surface}
          />
        </View>
      </Card>

      <Button onPress={continueToDemo}>Enter the demo</Button>
      <Text style={styles.footnote}>Seeded profiles are fictional. Imported contacts have recognition disabled by default.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  hero: { gap: spacing.md },
  promiseList: { gap: spacing.sm },
  promiseCard: { flexDirection: "row", borderRadius: radius.md, shadowOpacity: 0 },
  promiseNumber: { width: 38, color: colors.primary, fontSize: 13, fontWeight: "900" },
  promiseCopy: { flex: 1, gap: spacing.xs },
  promiseTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  promiseBody: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  aiCard: { backgroundColor: "#F0EFFF", borderColor: "#D9D6FE", shadowOpacity: 0 },
  switchRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  switchCopy: { flex: 1, gap: spacing.xs },
  switchTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  switchBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  footnote: { color: colors.inkMuted, textAlign: "center", fontSize: 12, lineHeight: 18 },
});
