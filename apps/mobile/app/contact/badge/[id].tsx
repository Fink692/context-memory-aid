import { useEffect, useMemo } from "react";
import { Alert, Share, StyleSheet, View, useWindowDimensions } from "react-native";
import { randomUUID } from "expo-crypto";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {
  AppSymbol,
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { badgePayload } from "@/lib/badge-matcher";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ContactBadgeScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = singleParam(params.id);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const updateContact = useAppStore((state) => state.updateContact);

  useEffect(() => {
    if (contact && !contact.badgeId) updateContact(contact.id, { badgeId: randomUUID() });
  }, [contact, updateContact]);

  const memberships = useMemo(
    () => events.filter((event) => contact && event.attendeeContactIds.includes(contact.id)),
    [contact, events],
  );
  const activeEvent = memberships.find((event) => event.id === currentEventId);
  const payload = contact?.badgeId ? badgePayload(contact.badgeId) : undefined;
  const qrSize = Math.max(180, Math.min(300, width - 96));

  if (!contact) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/people")}>Open People</Button>}
          body="It may have been removed from this device."
          symbol={symbols.scan}
          title="Badge unavailable"
        />
      </Screen>
    );
  }

  const shareBadge = () => {
    if (!payload) return;
    void Share.share({ title: `${contact.displayName} · Context Badge`, message: payload });
  };

  const confirmRegenerate = () => {
    Alert.alert(
      "Replace this badge?",
      "Every previous QR code for this person will stop working. Their profile and memories are unchanged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Replace Badge",
          style: "destructive",
          onPress: () => updateContact(contact.id, { badgeId: randomUUID() }),
        },
      ],
    );
  };

  const ready = contact.recognitionEnabled && Boolean(activeEvent);

  return (
    <>
      <Stack.Screen
        options={{
          title: contact.displayName,
          headerRight: () => (
            <BarButton accessibilityLabel={`Share badge for ${contact.displayName}`} disabled={!payload || !contact.recognitionEnabled} onPress={shareBadge}>
              Share
            </BarButton>
          ),
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.identity}>
          <Avatar name={contact.displayName} photoUri={contact.photoUri} size={62} />
          <View style={styles.identityCopy}>
            <AppText emphasis="semibold" role="title2">{contact.displayName}</AppText>
            <AppText role="callout" tone="secondary">{[contact.role, contact.company].filter(Boolean).join(" · ") || "Saved relationship"}</AppText>
          </View>
        </View>

        <View style={styles.qrStage}>
          <View accessibilityLabel={`QR badge for ${contact.displayName}`} accessible style={styles.qrFrame}>
            {payload ? <QRCode backgroundColor={colors.white} color={colors.black} size={qrSize} value={payload} /> : null}
          </View>
          <AppText role="footnote" style={styles.qrHint} tone="secondary">The random credential contains no name or relationship notes.</AppText>
        </View>

        <View style={[styles.status, ready ? styles.statusReady : styles.statusNeedsAction]}>
          <AppSymbol name={ready ? symbols.checkCircle : symbols.warning} size={20} tone={ready ? "success" : "warning"} />
          <View style={styles.statusCopy}>
            <AppText emphasis="semibold" role="headline">{ready ? `Ready for ${activeEvent?.name}` : contact.recognitionEnabled ? "Not in the active event" : "Badge matching is off"}</AppText>
            <AppText role="footnote" tone="secondary">{ready
              ? "Only someone who already saved this person in the same active event can match it."
              : contact.recognitionEnabled
                ? "Add this person to the active event before scanning."
                : "Turn on badge matching before sharing this code."}</AppText>
          </View>
        </View>

        {!contact.recognitionEnabled ? (
          <Button onPress={() => updateContact(contact.id, { recognitionEnabled: true })} symbol={symbols.scan}>Enable Badge Matching</Button>
        ) : !activeEvent ? (
          <Button onPress={() => router.push("/events")} symbol={symbols.events} variant="secondary">Manage Events</Button>
        ) : null}

        <Button onPress={confirmRegenerate} variant="quiet">Replace Badge</Button>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  qrStage: { alignItems: "center", gap: spacing.md },
  qrFrame: { borderRadius: radius.feature, borderCurve: "continuous", backgroundColor: colors.white, padding: spacing.lg },
  qrHint: { maxWidth: 340, textAlign: "center" },
  status: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", padding: spacing.lg },
  statusReady: { backgroundColor: colors.successSoft },
  statusNeedsAction: { backgroundColor: colors.warningSoft },
  statusCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
});
