import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, Switch, View, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  EmptyState,
  ErrorBanner,
  ListRow,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import {
  defaultContactShareSelection,
  isContactShareQrSafe,
  projectContactShareCard,
  serializeContactShareVCard,
  shareableSocialLinks,
  type ContactShareSelection,
} from "@/lib/contact-share";
import { shareContactVCard } from "@/lib/contact-share-file";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type BooleanShareField = "company" | "role" | "email" | "phone";

export default function ShareContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = singleParam(params.id);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const [selection, setSelection] = useState<ContactShareSelection>();
  const [showQr, setShowQr] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!contact) return;
    setSelection(defaultContactShareSelection(contact));
    setShowQr(false);
    setError(undefined);
  }, [contact?.id]);

  const socialOptions = useMemo(() => contact ? shareableSocialLinks(contact) : [], [contact]);
  const card = useMemo(
    () => contact && selection ? projectContactShareCard(contact, selection) : undefined,
    [contact, selection],
  );
  const vCard = useMemo(() => card ? serializeContactShareVCard(card) : "", [card]);
  const qrSafe = Boolean(vCard && isContactShareQrSafe(vCard));
  const qrSize = Math.max(190, Math.min(310, width - 80));
  const includedLabels = useMemo(() => {
    if (!contact || !selection) return [];
    return [
      "name",
      selection.company && contact.company ? "company" : undefined,
      selection.role && contact.role ? "role" : undefined,
      selection.email && contact.email ? "email" : undefined,
      selection.phone && contact.phone ? "phone" : undefined,
      selection.socialLinkKeys.length ? `${selection.socialLinkKeys.length} social ${selection.socialLinkKeys.length === 1 ? "profile" : "profiles"}` : undefined,
    ].filter((value): value is string => Boolean(value));
  }, [contact, selection]);

  useEffect(() => {
    if (!showQr || qrSafe) return;
    setShowQr(false);
    setError("The selected details no longer fit in a reliable QR code. Edit the fields or use Share Contact Card.");
  }, [qrSafe, showQr]);

  useEffect(() => {
    if (!showQr || !qrSafe || !contact || !includedLabels.length) return;
    void AccessibilityInfo.announceForAccessibility(
      `Contact QR ready for ${contact.displayName}. Includes ${includedLabels.join(", ")}.`,
    );
  }, [contact, includedLabels, qrSafe, showQr]);

  if (!contact || !selection || !card) {
    return (
      <>
        <Stack.Screen options={{ title: "Share Contact" }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.dismissTo("/people")}>Open People</Button>}
            body="This person may no longer be available. Nothing was shared."
            symbol={symbols.share}
            title="Contact unavailable"
          />
        </Screen>
      </>
    );
  }

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const toggleField = (field: BooleanShareField) => {
    setSelection((current) => current ? { ...current, [field]: !current[field] } : current);
    setError(undefined);
  };

  const toggleSocial = (key: string) => {
    setSelection((current) => {
      if (!current) return current;
      const included = current.socialLinkKeys.includes(key);
      return {
        ...current,
        socialLinkKeys: included
          ? current.socialLinkKeys.filter((candidate) => candidate !== key)
          : [...current.socialLinkKeys, key],
      };
    });
    setError(undefined);
  };

  const clearOptional = () => {
    setSelection({ company: false, role: false, email: false, phone: false, socialLinkKeys: [] });
    setError(undefined);
  };

  const shareCard = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setError(undefined);
    try {
      await shareContactVCard(vCard, contact.displayName);
    } catch {
      setError("The contact card could not be shared. Nothing in Context was changed; try again.");
    } finally {
      setShareBusy(false);
    }
  };

  if (showQr && qrSafe) {
    return (
      <>
        <Stack.Screen options={{
          title: "Contact QR",
          headerLeft: () => <BarButton onPress={() => setShowQr(false)}>Fields</BarButton>,
          headerRight: () => <BarButton onPress={close}>Done</BarButton>,
          gestureEnabled: !shareBusy,
        }} />
        <Screen contentContainerStyle={styles.screen} pointerEvents={shareBusy ? "none" : "auto"}>
          <View style={styles.qrIdentity}>
            <Avatar name={contact.displayName} photoUri={contact.photoUri} size={62} />
            <View style={styles.identityCopy}>
              <AppText accessibilityRole="header" emphasis="semibold" role="title2">{contact.displayName}</AppText>
              <AppText role="footnote" tone="secondary">{includedLabels.join(" · ")}</AppText>
            </View>
          </View>

          <View style={styles.qrStage}>
            <View
              accessibilityLabel={`Contact QR for ${contact.displayName}. Includes ${includedLabels.join(", ")}.`}
              accessibilityRole="image"
              accessible
              style={styles.qrFrame}
            >
              <QRCode
                backgroundColor="#FFFFFF"
                color="#000000"
                ecl="M"
                onError={() => {
                  setShowQr(false);
                  setError("The QR code could not be created. Edit the fields or use Share Contact Card.");
                }}
                quietZone={12}
                size={qrSize}
                value={vCard}
              />
            </View>
            <AppText role="callout" style={styles.centerText} tone="secondary">
              Scan with Context or an iPhone camera. It works offline, and anyone who scans it can keep or forward a copy.
            </AppText>
          </View>

          <ErrorBanner message={error} />
          <Button loading={shareBusy} onPress={() => { void shareCard(); }} symbol={symbols.share} variant="secondary">
            Share Contact Card…
          </Button>
          <Button disabled={shareBusy} onPress={() => setShowQr(false)} variant="quiet">Edit Fields</Button>
        </Screen>
      </>
    );
  }

  const optionalRows: { field: BooleanShareField; label: string; value: string }[] = [
    ...(contact.company ? [{ field: "company" as const, label: "Company", value: contact.company }] : []),
    ...(contact.role ? [{ field: "role" as const, label: "Role", value: contact.role }] : []),
    ...(contact.email ? [{ field: "email" as const, label: "Email", value: contact.email }] : []),
    ...(contact.phone ? [{ field: "phone" as const, label: "Phone", value: contact.phone }] : []),
  ];

  return (
    <>
      <Stack.Screen options={{
        title: "Share Contact",
        headerLeft: () => <BarButton disabled={shareBusy} onPress={close}>Cancel</BarButton>,
        headerRight: () => <BarButton disabled={shareBusy} onPress={clearOptional}>Clear Optional</BarButton>,
        gestureEnabled: !shareBusy,
      }} />
      <Screen contentContainerStyle={styles.screen} pointerEvents={shareBusy ? "none" : "auto"}>
        <View style={styles.identity}>
          <Avatar name={contact.displayName} photoUri={contact.photoUri} size={72} />
          <View style={styles.identityCopy}>
            <AppText accessibilityRole="header" emphasis="semibold" role="title2">{contact.displayName}</AppText>
            <AppText role="callout" tone="secondary">Choose exactly what leaves Context.</AppText>
          </View>
        </View>

        <ListSection
          footer="Only these contact details are shared. Memories, relationship notes, events, photos, and internal identifiers stay in Context."
          title="Included"
        >
          <ListRow accessory="checkmark" last={!optionalRows.length && !socialOptions.length} subtitle={contact.displayName} title="Name" />
          {optionalRows.map((row, index) => {
            const last = index === optionalRows.length - 1 && !socialOptions.length;
            return (
              <ListRow
                accessoryNode={(
                  <Switch
                    accessibilityHint={`Double tap to ${selection[row.field] ? "exclude" : "include"} this field`}
                    accessibilityLabel={`Include ${row.label}`}
                    onValueChange={() => toggleField(row.field)}
                    trackColor={{ false: colors.fillStrong as string, true: colors.primaryFill as string }}
                    value={selection[row.field]}
                  />
                )}
                key={row.field}
                last={last}
                subtitle={row.value}
                title={row.label}
              />
            );
          })}
          {socialOptions.map((social, index) => {
            const selected = selection.socialLinkKeys.includes(social.key);
            return (
              <ListRow
                accessoryNode={(
                  <Switch
                    accessibilityHint={`Double tap to ${selected ? "exclude" : "include"} this social profile`}
                    accessibilityLabel={`Include ${social.platform}`}
                    onValueChange={() => toggleSocial(social.key)}
                    trackColor={{ false: colors.fillStrong as string, true: colors.primaryFill as string }}
                    value={selected}
                  />
                )}
                key={social.key}
                last={index === socialOptions.length - 1}
                subtitle={social.url}
                title={social.platform}
              />
            );
          })}
        </ListSection>

        {!qrSafe ? (
          <View style={styles.warningCard}>
            <AppText emphasis="semibold" role="headline" tone="warning">Too much for a reliable QR</AppText>
            <AppText role="footnote" tone="secondary">Turn off one or more long fields, or use Share Contact Card instead. Selected details are never silently shortened.</AppText>
          </View>
        ) : null}
        <ErrorBanner message={error} />
        <Button disabled={!qrSafe || shareBusy} onPress={() => setShowQr(true)} symbol={symbols.scan}>Show QR</Button>
        <Button loading={shareBusy} onPress={() => { void shareCard(); }} symbol={symbols.share} variant="secondary">
          Share Contact Card…
        </Button>
        <AppText role="footnote" style={styles.centerText} tone="secondary">
          AirDrop and nearby iPhone options appear when iOS makes them available in the share sheet.
        </AppText>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl, gap: spacing.xl },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xs },
  qrIdentity: { alignItems: "center", gap: spacing.sm },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  qrStage: { alignItems: "center", gap: spacing.lg },
  qrFrame: { borderRadius: radius.feature, borderCurve: "continuous", backgroundColor: colors.white, padding: spacing.sm },
  centerText: { maxWidth: 380, alignSelf: "center", textAlign: "center" },
  warningCard: { gap: spacing.xs, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.warningSoft, padding: spacing.lg },
});
