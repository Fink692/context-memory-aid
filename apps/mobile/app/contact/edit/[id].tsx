import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Body, Button, Card, ErrorBanner, Pill, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function EditContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = singleParam(params.id);
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const updateContact = useAppStore((state) => state.updateContact);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [metAt, setMetAt] = useState("");
  const [lastDiscussed, setLastDiscussed] = useState("");
  const [recentUpdate, setRecentUpdate] = useState("");
  const [topics, setTopics] = useState("");
  const [recognitionEnabled, setRecognitionEnabled] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!contact) return;
    setDisplayName(contact.displayName);
    setCompany(contact.company ?? "");
    setRole(contact.role ?? "");
    setMetAt(contact.metAt ?? "");
    setLastDiscussed(contact.lastDiscussed ?? "");
    setRecentUpdate(contact.recentUpdate ?? "");
    setTopics(contact.conversationTopics.join("\n"));
    setRecognitionEnabled(contact.recognitionEnabled);
  }, [contact]);

  if (!contact) {
    return <Screen><Card><Body>This person is no longer available.</Body></Card><Button onPress={() => router.replace("/home")}>Return home</Button></Screen>;
  }

  const save = () => {
    const name = displayName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (contacts.some((item) => item.id !== contact.id && item.displayName.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError("Another saved person already uses this name.");
      return;
    }
    const conversationTopics = topics
      .split(/\r?\n/)
      .map((topic) => topic.trim())
      .filter(Boolean);
    if (conversationTopics.length > 8) {
      setError("Keep conversation prompts to eight lines or fewer.");
      return;
    }
    if (conversationTopics.some((topic) => topic.length > 160)) {
      setError("Each conversation prompt must be 160 characters or fewer.");
      return;
    }
    updateContact(contact.id, {
      displayName: name,
      company: company.trim() || undefined,
      role: role.trim() || undefined,
      metAt: metAt.trim() || undefined,
      lastDiscussed: lastDiscussed.trim() || undefined,
      recentUpdate: recentUpdate.trim() || undefined,
      conversationTopics,
      recognitionEnabled,
    });
    router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  return (
    <Screen contentContainerStyle={styles.screen}>
      <Pill tone="safe">Private relationship record</Pill>
      <Text style={styles.title}>Edit {contact.displayName}</Text>
      <Body muted>Keep only the details that will make the next conversation warmer or more useful.</Body>
      <ErrorBanner message={error} />

      <View style={styles.twoColumn}>
        <Field label="Name" maxLength={100} value={displayName} onChangeText={setDisplayName} placeholder="Jordan Patel" />
        <Field label="Company" maxLength={120} value={company} onChangeText={setCompany} placeholder="Stripe" />
        <Field label="Role" maxLength={120} value={role} onChangeText={setRole} placeholder="Engineering Manager" />
        <Field label="Where you met" maxLength={160} value={metAt} onChangeText={setMetAt} placeholder="Applied AI Summit" />
      </View>
      <Field label="Last discussed" maxLength={240} value={lastDiscussed} onChangeText={setLastDiscussed} placeholder="Developer tooling" multiline />
      <Field label="Recent update" maxLength={240} value={recentUpdate} onChangeText={setRecentUpdate} placeholder="Promoted to Engineering Manager" multiline />
      <View style={styles.field}>
        <Text style={styles.label}>Conversation prompts</Text>
        <Text style={styles.hint}>One prompt per line, up to eight.</Text>
        <TextInput accessibilityLabel="Conversation prompts" value={topics} onChangeText={setTopics} multiline maxLength={1_500} placeholder="Their new team\nThe marathon they ran" placeholderTextColor={colors.inkMuted} style={[styles.input, styles.textarea]} />
      </View>

      <Card style={styles.toggleCard}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.toggleTitle}>Quick badge matching</Text>
            <Text style={styles.toggleBody}>Eligible only inside an event that includes this person. No face image or embedding is created.</Text>
          </View>
          <Switch accessibilityLabel="Quick badge matching" value={recognitionEnabled} onValueChange={setRecognitionEnabled} />
        </View>
      </Card>
      <Button onPress={save}>Save changes</Button>
      <Button onPress={() => router.back()} variant="quiet">Cancel</Button>
    </Screen>
  );
}

function Field({ label, maxLength, multiline = false, ...props }: { label: string; maxLength: number; multiline?: boolean; value: string; onChangeText: (value: string) => void; placeholder: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} maxLength={maxLength} multiline={multiline} placeholderTextColor={colors.inkMuted} style={[styles.input, multiline && styles.textarea]} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  title: { color: colors.ink, fontSize: 29, lineHeight: 35, fontWeight: "800" },
  twoColumn: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  field: { flex: 1, minWidth: 240, gap: spacing.xs },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  hint: { color: colors.inkMuted, fontSize: 12 },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 16 },
  textarea: { minHeight: 92, paddingTop: spacing.md, textAlignVertical: "top" },
  toggleCard: {},
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  toggleTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  toggleBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
});
