import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Body, Button, Card, Eyebrow, Pill, Screen, Title } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

const promises = [
  { number: "01", title: "Your network only", body: "Context only considers people you saved and attendees in the event you selected." },
  { number: "02", title: "The camera stays deliberate", body: "Context opens it only for event badge scanning. Frames are never saved or sent for identity search." },
  { number: "03", title: "Local and reviewable", body: "On-device rules create an editable draft. Nothing enters the timeline until you confirm it." },
];

export default function OnboardingScreen() {
  const [localToolsEnabled, setLocalToolsEnabled] = useState(true);
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const router = useRouter();

  const finish = (loadSample: boolean) => {
    completeOnboarding(localToolsEnabled, loadSample);
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

      <Card style={styles.localCard}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Enable local smart tools</Text>
            <Text style={styles.switchBody}>
              Creates editable drafts with deterministic rules on this device. No account, subscription, API key, or internet connection is required.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Enable local smart tools"
            value={localToolsEnabled}
            onValueChange={setLocalToolsEnabled}
            trackColor={{ false: colors.border, true: "#A7F3D0" }}
            thumbColor={localToolsEnabled ? colors.success : colors.surface}
          />
        </View>
      </Card>

      <View style={styles.actions}>
        <Button onPress={() => finish(true)}>Explore with sample people</Button>
        <Button variant="secondary" onPress={() => finish(false)}>Start with an empty workspace</Button>
      </View>
      <Text style={styles.footnote}>Sample profiles are fictional and can be removed at any time. New contacts start with quick matching off.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xxl, paddingBottom: spacing.xxl },
  hero: { gap: spacing.md },
  promiseList: { gap: spacing.sm },
  promiseCard: { flexDirection: "row", borderRadius: radius.md },
  promiseNumber: { width: 38, color: colors.primary, fontSize: 13, fontWeight: "900" },
  promiseCopy: { flex: 1, gap: spacing.xs },
  promiseTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  promiseBody: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  localCard: { backgroundColor: "#F0EFFF", borderColor: "#D9D6FE" },
  switchRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  switchCopy: { flex: 1, gap: spacing.xs },
  switchTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  switchBody: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  footnote: { color: colors.inkMuted, textAlign: "center", fontSize: 12, lineHeight: 18 },
  actions: { gap: spacing.sm },
});
