import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { parseAttendeeCsv, type ImportContact } from "@context/shared";
import { Body, Button, Card, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function ImportScreen() {
  const router = useRouter();
  const event = useAppStore((state) => state.events.find((item) => item.id === state.currentEventId));
  const importContacts = useAppStore((state) => state.importContacts);
  const [preview, setPreview] = useState<ImportContact[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState<string>();
  const [success, setSuccess] = useState<string>();

  const pickCsv = async () => {
    setErrors([]);
    setSuccess(undefined);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/plain", "application/vnd.ms-excel"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > 1_000_000) {
      setErrors(["CSV must be smaller than 1 MB."]);
      return;
    }
    const text = await (await fetch(asset.uri)).text();
    const parsed = parseAttendeeCsv(text);
    setFilename(asset.name);
    setPreview(parsed.contacts);
    setErrors(parsed.errors);
  };

  const confirmImport = () => {
    const count = importContacts(preview);
    setSuccess(`${count} new ${count === 1 ? "person" : "people"} added to ${event?.name ?? "the active event"}.`);
    setPreview([]);
  };

  return (
    <Screen>
      <Pill tone="safe">Manual event boundary</Pill>
      <Text style={styles.title}>Bring your attendee list, not your whole address book.</Text>
      <Body muted>
        Accepted columns: name, company, role/title, met/metAt, lastSpoke, and notes. Imported people start with recognition disabled.
      </Body>
      <Card style={styles.exampleCard}>
        <Text style={styles.exampleTitle}>CSV example</Text>
        <Text style={styles.code}>name,company,role,lastSpoke,notes</Text>
        <Text style={styles.code}>Jordan Patel,Stripe,Engineering Manager,2025-11-09,Developer tooling</Text>
      </Card>
      <Button onPress={pickCsv}>Choose CSV file</Button>
      <ErrorBanner message={errors[0]} />
      {errors.length > 1 ? <Text style={styles.moreErrors}>Plus {errors.length - 1} additional row errors.</Text> : null}
      {success ? <Card style={styles.successCard}><Text style={styles.successText}>{success}</Text></Card> : null}

      {preview.length ? (
        <View style={styles.preview}>
          <View style={styles.previewTopline}>
            <Text style={styles.previewTitle}>Preview · {preview.length} rows</Text>
            <Text style={styles.filename} numberOfLines={1}>{filename}</Text>
          </View>
          {preview.slice(0, 8).map((contact, index) => (
            <Card key={`${contact.displayName}-${index}`} style={styles.previewCard}>
              <Text style={styles.contactName}>{contact.displayName}</Text>
              <Text style={styles.contactMeta}>{[contact.role, contact.company].filter(Boolean).join(" · ") || "No company details"}</Text>
            </Card>
          ))}
          {preview.length > 8 ? <Body muted>And {preview.length - 8} more…</Body> : null}
          <Button onPress={confirmImport}>Add previewed people to event</Button>
        </View>
      ) : null}
      <Button variant="quiet" onPress={() => router.replace("/home")}>Back to event briefing</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: "800", letterSpacing: -0.6 },
  exampleCard: { shadowOpacity: 0, backgroundColor: colors.ink, borderColor: colors.ink },
  exampleTitle: { color: colors.white, fontSize: 13, fontWeight: "800" },
  code: { color: "#C9CED7", fontSize: 11, lineHeight: 18 },
  moreErrors: { color: colors.danger, fontSize: 12 },
  successCard: { backgroundColor: "#DDF7EC", borderColor: "#B7E4D2", shadowOpacity: 0 },
  successText: { color: colors.success, fontSize: 14, fontWeight: "700" },
  preview: { gap: spacing.sm },
  previewTopline: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  previewTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  filename: { flex: 1, color: colors.inkMuted, fontSize: 12, textAlign: "right" },
  previewCard: { paddingVertical: spacing.sm, shadowOpacity: 0 },
  contactName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  contactMeta: { color: colors.inkMuted, fontSize: 12 },
});
