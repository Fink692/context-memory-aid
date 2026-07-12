import { useState } from "react";
import { FlatList, Platform, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { parseAttendeeCsv, type ImportContact } from "@context/shared";
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  ErrorBanner,
  IconButton,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { extractTextFromPDF, MAX_PDF_FILE_BYTES } from "@/lib/native-pdf-text";
import { createModelRosterDrafts } from "@/lib/roster-import";
import { useAppStore } from "@/store/app-store";

interface PreviewRow {
  key: string;
  contact: ImportContact;
}

type ImportSource = "csv" | "pdf";
type ImportPhase = "idle" | "choosing" | "extracting" | "drafting";

const CSV_TYPES = ["text/csv", "text/plain", "application/vnd.ms-excel"];

function contactPreviewDetails(contact: ImportContact): string {
  const roleAndCompany = [contact.role, contact.company].filter(Boolean).join(" · ");
  const social = contact.socialLinks?.map((link) => (
    [link.platform, link.handle ?? link.url].filter(Boolean).join(" ")
  )).join(" · ");
  return [
    roleAndCompany,
    contact.email,
    contact.phone,
    contact.metAt ? `Met: ${contact.metAt}` : undefined,
    contact.relationshipContext,
    social,
    contact.notes,
  ].filter(Boolean).join("\n") || "Name only";
}

export default function ImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const requestedEventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const targetEventId = requestedEventId || null;
  const event = useAppStore((state) => targetEventId
    ? state.events.find((item) => item.id === targetEventId)
    : undefined);
  const importContacts = useAppStore((state) => state.importContacts);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [filename, setFilename] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [source, setSource] = useState<ImportSource>();
  const [modelLabel, setModelLabel] = useState<string>();
  const [phase, setPhase] = useState<ImportPhase>("idle");

  const pickRoster = async () => {
    let attemptedSource: ImportSource | undefined;
    setPhase("choosing");
    setErrors([]);
    setSuccess(undefined);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: Platform.OS === "ios" ? [...CSV_TYPES, "application/pdf"] : CSV_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const isPDF = asset.mimeType?.toLocaleLowerCase() === "application/pdf" || /\.pdf$/i.test(asset.name);
      setPreview([]);
      setWarnings([]);
      setModelLabel(undefined);
      setFilename(asset.name);

      if (isPDF) {
        attemptedSource = "pdf";
        setSource("pdf");
        if (Platform.OS !== "ios") {
          throw new Error("Private PDF roster import requires the native iPhone app.");
        }
        if (asset.size && asset.size > MAX_PDF_FILE_BYTES) {
          throw new Error("PDFs must be 20 MB or smaller.");
        }
        setPhase("extracting");
        const extraction = await extractTextFromPDF(asset.uri);
        setPhase("drafting");
        const drafted = await createModelRosterDrafts(extraction.text);
        if (!drafted.contacts.length) {
          throw new Error("Gemma could not find any complete person names in that PDF. Nothing was imported.");
        }
        setPreview(drafted.contacts.map((contact, index) => ({
          key: `${asset.name}:pdf:${index}`,
          contact,
        })));
        setModelLabel(drafted.model);
        setWarnings([
          ...(extraction.truncated
            ? ["The PDF exceeded the local reading limit, so only the first 100 pages or 18,000 characters were reviewed."]
            : []),
          ...(drafted.inputTruncated
            ? ["The extracted text was shortened to fit Gemma’s private prompt limit. Review the preview for omissions."]
            : []),
          ...(drafted.skipped
            ? [`${drafted.skipped} ${drafted.skipped === 1 ? "draft was" : "drafts were"} invalid or duplicated and left out.`]
            : []),
        ]);
        return;
      }

      attemptedSource = "csv";
      setSource("csv");
      if (asset.size && asset.size > 1_000_000) {
        setErrors(["CSV must be smaller than 1 MB."]);
        return;
      }
      const text = Platform.OS === "web"
        ? await (await fetch(asset.uri)).text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseAttendeeCsv(text);
      setPreview(parsed.contacts.map((contact, index) => ({
        key: `${asset.name}:csv:${index}`,
        contact,
      })));
      setErrors(parsed.errors);
    } catch (error) {
      setPreview([]);
      setErrors([attemptedSource === "csv"
        ? "Context could not read that CSV file. Try exporting it again as UTF-8 CSV."
        : attemptedSource === "pdf" && error instanceof Error
          ? error.message
          : "Context could not open that roster from Files. Try again."]);
    } finally {
      setPhase("idle");
    }
  };

  const confirmImport = () => {
    if (!preview.length || (targetEventId && !event)) return;
    const result = importContacts(preview.map((row) => row.contact), event?.id ?? null);
    const parts = event ? [
      `${result.added} new ${result.added === 1 ? "person" : "people"}`,
      `${result.linked} existing ${result.linked === 1 ? "person" : "people"} linked`,
      `${result.skipped} exact ${result.skipped === 1 ? "duplicate" : "duplicates"} skipped`,
    ] : [
      `${result.added} new ${result.added === 1 ? "person" : "people"}`,
      `${result.skipped} exact ${result.skipped === 1 ? "duplicate" : "duplicates"} skipped`,
    ];
    setSuccess(`${parts.join(" · ")} ${event ? `for ${event.name}` : "in People"}.`);
    setPreview([]);
    setFilename(undefined);
    setWarnings([]);
    setSource(undefined);
    setModelLabel(undefined);
  };

  if (targetEventId && !event) {
    return (
      <Screen>
        <EmptyState
          action={<Button onPress={() => router.replace("/import")} symbol={symbols.people}>Import to People</Button>}
          body="That event is no longer available. You can still review this roster and add people without linking them to an event."
          symbol={symbols.warning}
          title="Event not found"
        />
      </Screen>
    );
  }

  const destination = event?.name ?? "People";
  const busyLabel = phase === "extracting"
    ? "Reading PDF on This iPhone…"
    : phase === "drafting"
      ? "Creating Private Preview…"
      : phase === "choosing"
        ? "Opening Files…"
        : undefined;

  const listHeader = (
    <View style={styles.listHeader}>
      <AppText role="callout" tone="secondary">
        {event
          ? `Add attendees to ${event.name}. Exact name-and-company matches link the existing person to this event.`
          : "Add people to your private People list. Exact name-and-company matches stay as one person."}
      </AppText>

      <Button loading={phase !== "idle"} onPress={() => { void pickRoster(); }} symbol={symbols.import}>
        {busyLabel ?? (filename
          ? `Choose Another ${Platform.OS === "ios" ? "File" : "CSV"}`
          : `Choose ${Platform.OS === "ios" ? "CSV or PDF" : "CSV"} from Files`)}
      </Button>

      <ListSection
        footer={Platform.OS === "ios"
          ? "Files stay on this iPhone. PDF text is read with PDFKit and drafted by Gemma on device. Nothing is saved until you tap Import."
          : "The CSV stays on this device and must be smaller than 1 MB."}
        title="Accepted files"
      >
        <ListRow
          last={Platform.OS !== "ios"}
          subtitle="Required: name. Optional: company, role/title, met/metAt, lastSpoke, and notes."
          symbol={symbols.info}
          title="CSV · up to 1 MB"
        />
        {Platform.OS === "ios" ? (
          <ListRow
            last
            subtitle="Selectable-text rosters up to 20 MB. Gemma proposes people for review; scanned images need text recognition first."
            symbol={symbols.sparkles}
            title="PDF · private AI preview"
          />
        ) : null}
      </ListSection>

      <ErrorBanner message={errors[0]} />
      {errors.length > 1 ? (
        <View accessibilityLiveRegion="polite" style={styles.notices}>
          {errors.slice(1, 5).map((message) => (
            <AppText key={message} role="footnote" tone="destructive">{message}</AppText>
          ))}
          {errors.length > 5 ? (
            <AppText role="footnote" tone="destructive">Plus {errors.length - 5} additional row errors.</AppText>
          ) : null}
        </View>
      ) : null}
      {warnings.length ? (
        <View accessibilityLiveRegion="polite" style={styles.notices}>
          {warnings.map((message) => (
            <AppText key={message} role="footnote" tone="warning">{message}</AppText>
          ))}
        </View>
      ) : null}
      <SuccessBanner message={success} />

      {preview.length ? (
        <View style={styles.previewHeading}>
          <View style={styles.flex}>
            <AppText accessibilityRole="header" emphasis="semibold" role="title3">Preview</AppText>
            <AppText role="footnote" tone="secondary">
              {preview.length.toLocaleString()} {preview.length === 1 ? "person" : "people"} ready for {destination} · review before import
            </AppText>
            {source === "pdf" && modelLabel ? <AppText role="caption1" tone="tertiary">Drafted privately with {modelLabel}</AppText> : null}
          </View>
          {filename ? <AppText numberOfLines={2} role="footnote" style={styles.filename} tone="secondary">{filename}</AppText> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen contentContainerStyle={styles.screen} scroll={false}>
      <FlatList
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        data={preview}
        keyExtractor={(row) => row.key}
        ListHeaderComponent={listHeader}
        renderItem={({ item: row, index }) => {
          const metadata = contactPreviewDetails(row.contact);
          const last = index === preview.length - 1;
          return (
            <View style={[styles.previewRowSurface, index === 0 && styles.groupFirst, last && styles.groupLast]}>
              <ListRow
                accessibilityLabel={`${row.contact.displayName}. ${metadata}.`}
                accessoryNode={(
                  <IconButton
                    accessibilityLabel={`Remove ${row.contact.displayName} from preview`}
                    onPress={() => setPreview((rows) => rows.filter((item) => item.key !== row.key))}
                    symbol={symbols.trash}
                    tone="destructive"
                  />
                )}
                last={last}
                leading={<Avatar name={row.contact.displayName} photoUri={row.contact.photoUri} size={42} />}
                subtitle={metadata}
                title={row.contact.displayName}
              />
            </View>
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
      {preview.length ? (
        <View style={styles.stickyAction}>
          <Button
            accessibilityLabel={`Import ${preview.length} ${preview.length === 1 ? "person" : "people"} into ${destination}`}
            onPress={confirmImport}
            symbol={symbols.import}
          >
            Import {preview.length.toLocaleString()} {preview.length === 1 ? "Person" : "People"}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingBottom: 0 },
  list: { flex: 1, width: "100%" },
  listContent: { flexGrow: 1, paddingBottom: spacing.lg },
  listHeader: { gap: spacing.lg, marginBottom: spacing.sm },
  notices: { gap: spacing.xs },
  previewHeading: { minHeight: 44, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  filename: { flexShrink: 1, maxWidth: "44%", textAlign: "right" },
  previewRowSurface: { backgroundColor: colors.surface },
  groupFirst: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  groupLast: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg, borderCurve: "continuous", overflow: "hidden" },
  stickyAction: { backgroundColor: colors.canvas, paddingTop: spacing.sm, paddingBottom: spacing.sm },
});
