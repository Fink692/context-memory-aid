import { useState } from "react";
import { StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import type { Contact } from "@context/shared";
import { Body, Button, Card, ErrorBanner, Screen } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";

export default function NewContactScreen() {
  const router = useRouter();
  const addContact = useAppStore((state) => state.addContact);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [metAt, setMetAt] = useState("");
  const [recognitionEnabled, setRecognitionEnabled] = useState(false);
  const [error, setError] = useState<string>();

  const save = () => {
    const name = displayName.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    const id = `contact-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;
    const contact: Contact = {
      id,
      displayName: name,
      ...(company.trim() ? { company: company.trim() } : {}),
      ...(role.trim() ? { role: role.trim() } : {}),
      ...(metAt.trim() ? { metAt: metAt.trim() } : {}),
      conversationTopics: [],
      recognitionEnabled,
      timeline: [],
    };
    addContact(contact);
    router.replace({ pathname: "/contact/[id]", params: { id } });
  };

  return (
    <Screen>
      <Body muted>Save only people you already know. Recognition stays off unless you deliberately enable it.</Body>
      <ErrorBanner message={error} />
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput accessibilityLabel="Name" value={displayName} onChangeText={setDisplayName} placeholder="Jordan Patel" placeholderTextColor={colors.inkMuted} style={styles.input} autoCapitalize="words" maxLength={100} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Company</Text>
        <TextInput accessibilityLabel="Company" value={company} onChangeText={setCompany} placeholder="Stripe" placeholderTextColor={colors.inkMuted} style={styles.input} maxLength={120} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Role</Text>
        <TextInput accessibilityLabel="Role" value={role} onChangeText={setRole} placeholder="Engineering Manager" placeholderTextColor={colors.inkMuted} style={styles.input} maxLength={120} />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Where you met</Text>
        <TextInput accessibilityLabel="Where you met" value={metAt} onChangeText={setMetAt} placeholder="OpenAI Hackathon 2025" placeholderTextColor={colors.inkMuted} style={styles.input} maxLength={160} />
      </View>
      <Card style={styles.toggleCard}>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.toggleTitle}>Include in deliberate recognition</Text>
            <Text style={styles.toggleBody}>Use only with appropriate permission. A real face template is not created by this form; hackathon demo/QR matching can use the contact record.</Text>
          </View>
          <Switch value={recognitionEnabled} onValueChange={setRecognitionEnabled} />
        </View>
      </Card>
      <Button onPress={save}>Save to this event</Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, fontSize: 16 },
  toggleCard: { shadowOpacity: 0 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  flex: { flex: 1 },
  toggleTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  toggleBody: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
});
