import { useRef, useState, type ComponentProps } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ContactSchema, type Memory } from "@context/shared";
import { DictationControl } from "@/components/dictation-control";
import {
  editableSocialLinks,
  socialLinksIssue,
  SocialLinksEditor,
  storedSocialLinks,
  type EditableSocialLink,
} from "@/components/social-links-editor";
import {
  AppText,
  Avatar,
  BarButton,
  Button,
  ErrorBanner,
  FormField,
  ListRow,
  ListSection,
  Screen,
  SuccessBanner,
  symbols,
} from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { findContactByIdentity } from "@/lib/contact-identity";
import { createContactId } from "@/lib/entity-id";
import { createModelContactDraft } from "@/lib/local-model";
import { canPickProfilePhoto, deletePrivateProfilePhoto, pickProfilePhoto } from "@/lib/profile-photo";
import { useOnDeviceDictation } from "@/lib/use-on-device-dictation";
import { useAppStore } from "@/store/app-store";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function valueOrCurrent(extracted: string | undefined, current: string): string {
  return extracted?.trim() || current;
}

export default function NewContactScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[]; global?: string | string[] }>();
  const router = useRouter();
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const addContact = useAppStore((state) => state.addContact);
  const addContactToEvent = useAppStore((state) => state.addContactToEvent);
  const addMemory = useAppStore((state) => state.addMemory);
  const requestedEventId = firstParam(params.eventId);
  const saveGlobally = firstParam(params.global) === "1";
  const event = events.find((item) => item.id === requestedEventId)
    ?? (!saveGlobally ? events.find((item) => item.id === currentEventId) : undefined);

  const [intake, setIntake] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [metAt, setMetAt] = useState("");
  const [relationshipContext, setRelationshipContext] = useState("");
  const [notes, setNotes] = useState("");
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([]);
  const [photoUri, setPhotoUri] = useState<string>();
  const [includeInEvent, setIncludeInEvent] = useState(Boolean(event));
  const [recognitionEnabled, setRecognitionEnabled] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const modelRequest = useRef(0);
  const dictation = useOnDeviceDictation();
  const busy = dictation.busy || modelBusy || photoBusy;

  const close = async () => {
    modelRequest.current += 1;
    if (dictation.busy) await dictation.cancel();
    await deletePrivateProfilePhoto(photoUri);
    if (router.canGoBack()) router.back();
    else router.replace("/people");
  };

  const fillDetails = async () => {
    if (dictation.busy) {
      setError("Stop dictation before asking Gemma to fill the details.");
      return;
    }
    if (!localToolsEnabled) {
      setError("Turn on On-Device Assistance in Settings, then download Gemma to fill details privately.");
      return;
    }
    const description = intake.trim();
    if (!description) {
      setError("Describe the person first. You can type or dictate everything in the box above.");
      return;
    }
    const request = ++modelRequest.current;
    setModelBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await createModelContactDraft(description);
      if (request !== modelRequest.current) return;
      const draft = result.draft;
      setDisplayName((current) => valueOrCurrent(draft.displayName, current));
      setCompany((current) => valueOrCurrent(draft.company, current));
      setRole((current) => valueOrCurrent(draft.role, current));
      setEmail((current) => valueOrCurrent(draft.email, current));
      setPhone((current) => valueOrCurrent(draft.phone, current));
      setMetAt((current) => valueOrCurrent(draft.metAt, current));
      setRelationshipContext((current) => valueOrCurrent(draft.relationshipContext, current));
      setNotes((current) => valueOrCurrent(draft.notes?.slice(0, 500), current));
      if (draft.socialLinks.length) setSocialLinks(editableSocialLinks(draft.socialLinks));
      setNotice(`Gemma filled the details on this iPhone using ${result.model}. Review everything before you add the person.`);
    } catch (caught) {
      if (request !== modelRequest.current) return;
      setError(caught instanceof Error
        ? caught.message
        : "Gemma could not fill these details. Your description is still here, and you can enter them manually.");
    } finally {
      if (request === modelRequest.current) setModelBusy(false);
    }
  };

  const choosePhoto = async () => {
    setPhotoBusy(true);
    setError(undefined);
    try {
      const selected = await pickProfilePhoto();
      if (selected) {
        await deletePrivateProfilePhoto(photoUri);
        setPhotoUri(selected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not add that photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = () => {
    if (busy) {
      setError("Finish the current dictation or on-device task before adding this person.");
      return;
    }
    const name = displayName.trim();
    const cleanCompany = company.trim();
    if (!name) {
      setError("Add a name before saving this person.");
      return;
    }

    const existing = findContactByIdentity(contacts, name, cleanCompany);
    if (existing) {
      if (event && includeInEvent) addContactToEvent(existing.id, event.id);
      router.replace({ pathname: "/contact/[id]", params: { id: existing.id } });
      return;
    }

    const id = createContactId(name);
    const socialIssue = socialLinksIssue(socialLinks);
    if (socialIssue) {
      setError(socialIssue);
      return;
    }
    const parsed = ContactSchema.safeParse({
      id,
      displayName: name,
      company: cleanCompany || undefined,
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      socialLinks: storedSocialLinks(socialLinks),
      photoUri,
      metAt: metAt.trim() || undefined,
      relationshipContext: relationshipContext.trim() || undefined,
      conversationTopics: [],
      recognitionEnabled: Boolean(event && includeInEvent && recognitionEnabled),
      timeline: [],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the person’s details and try again.");
      return;
    }

    addContact(parsed.data, event && includeInEvent ? event.id : null);
    const cleanNotes = notes.trim();
    if (cleanNotes) {
      const now = new Date().toISOString();
      const memory: Memory = {
        id: `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        contactId: id,
        summary: cleanNotes.slice(0, 500),
        tags: ["first impression"],
        nextSteps: [],
        source: dictation.state.targetId === "new-person-description" && dictation.state.finalizedText.trim() ? "voice" : "text",
        occurredAt: now,
        createdAt: now,
      };
      addMemory(memory);
    }
    router.replace({ pathname: "/contact/[id]", params: { id } });
  };

  const contextualStrings = [displayName, company, role, event?.name]
    .filter((value): value is string => Boolean(value));

  return (
    <>
      <Stack.Screen
        options={{
          title: "New Person",
          headerLeft: () => <BarButton onPress={() => { void close(); }}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={busy} onPress={save}>Add</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">Add anyone you want to remember</AppText>
          <AppText role="callout" tone="secondary">
            A neighbor, customer, coworker, teacher, someone from a shop, or a person you met at an event—all belong here.
          </AppText>
        </View>

        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />

        <ListSection
          footer="Speech and Gemma stay on this iPhone. Gemma only fills what you say; you review it before saving."
          groupStyle={styles.intakeGroup}
          title="Describe Once"
        >
          <FormField
            accessibilityLabel="Describe this person"
            autoCapitalize="sentences"
            editable={!busy}
            label="What do you remember?"
            maxLength={4_000}
            multiline
            onChangeText={(value) => {
              modelRequest.current += 1;
              setIntake(value);
              setNotice(undefined);
            }}
            placeholder="I met Maya at the neighborhood Superstore. She works in the bakery, her number is…"
            value={intake}
          />
          <DictationControl
            contextualStrings={contextualStrings}
            controller={dictation}
            disabled={modelBusy || photoBusy}
            label="person description"
            maxDurationSeconds={90}
            maxLength={4_000}
            onChange={setIntake}
            targetId="new-person-description"
            value={intake}
          />
          <Button
            disabled={!intake.trim() || dictation.busy || photoBusy}
            loading={modelBusy}
            onPress={() => { void fillDetails(); }}
            symbol={symbols.sparkles}
          >
            Fill Details with Gemma
          </Button>
        </ListSection>

        <ListSection groupStyle={styles.photoGroup} title="Photo">
          <View style={styles.photoRow}>
            <Avatar name={displayName || "New Person"} photoUri={photoUri} size={76} />
            <View style={styles.photoActions}>
              {canPickProfilePhoto() ? (
                <Button disabled={dictation.busy || modelBusy} loading={photoBusy} onPress={() => { void choosePhoto(); }} symbol={symbols.camera} variant="secondary">
                  {photoUri ? "Change Photo" : "Choose Photo"}
                </Button>
              ) : null}
              {photoUri ? <BarButton destructive disabled={busy} onPress={() => { void deletePrivateProfilePhoto(photoUri); setPhotoUri(undefined); }}>Remove Photo</BarButton> : null}
            </View>
          </View>
        </ListSection>

        <ListSection groupStyle={styles.formGroup} title="Details">
          <ProfileField autoCapitalize="words" disabled={busy} label="Name" maxLength={100} onChange={setDisplayName} placeholder="Maya Chen" value={displayName} />
          <ProfileField autoCapitalize="words" disabled={busy} label="Company or place" maxLength={120} onChange={setCompany} placeholder="Neighborhood Superstore" value={company} />
          <ProfileField autoCapitalize="words" disabled={busy} label="Role" maxLength={120} onChange={setRole} placeholder="Bakery manager" value={role} />
          <ProfileField autoCapitalize="none" autoComplete="email" disabled={busy} keyboardType="email-address" label="Email" maxLength={254} onChange={setEmail} placeholder="maya@example.com" value={email} />
          <ProfileField autoCapitalize="none" autoComplete="tel" disabled={busy} keyboardType="phone-pad" label="Phone" maxLength={40} onChange={setPhone} placeholder="(204) 555-0123" value={phone} />
          <ProfileField disabled={busy} label="Where you know them from" maxLength={160} onChange={setMetAt} placeholder="Superstore on Portage Avenue" value={metAt} />
          <ProfileField disabled={busy} label="Who they are to you" maxLength={500} multiline onChange={setRelationshipContext} placeholder="Friendly staff member I see most Saturdays" value={relationshipContext} />
          <ProfileField disabled={busy} label="Notes to remember" last maxLength={500} multiline onChange={setNotes} placeholder="Asked about the sourdough starter; moving to a new shift next month" value={notes} />
        </ListSection>

        <SocialLinksEditor disabled={busy} onChange={setSocialLinks} rows={socialLinks} />

        {event ? (
          <ListSection footer="People can live in your directory without belonging to an event." title="Event (Optional)">
            <ListRow
              accessoryNode={(
                <Switch
                  accessibilityLabel={`Include this person in ${event.name}`}
                  disabled={busy}
                  onValueChange={setIncludeInEvent}
                  trackColor={{ false: colors.fillStrong, true: colors.primary }}
                  value={includeInEvent}
                />
              )}
              last={!includeInEvent}
              subtitle={includeInEvent ? "They will also appear in this event" : "They will only appear in People"}
              title={event.name}
            />
            {includeInEvent ? (
              <ListRow
                accessoryNode={(
                  <Switch
                    accessibilityLabel="Allow quick badge matching"
                    disabled={busy}
                    onValueChange={setRecognitionEnabled}
                    trackColor={{ false: colors.fillStrong, true: colors.primary }}
                    value={recognitionEnabled}
                  />
                )}
                last
                subtitle="Match this person only when you scan their Context badge"
                title="Quick Badge Matching"
              />
            ) : null}
          </ListSection>
        ) : null}
      </Screen>
    </>
  );
}

function ProfileField({
  disabled,
  label,
  last = false,
  multiline = false,
  onChange,
  ...props
}: Omit<ComponentProps<typeof FormField>, "editable" | "label" | "multiline" | "onChange" | "onChangeText"> & {
  disabled: boolean;
  label: string;
  last?: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={[styles.field, !last && styles.fieldSeparated]}>
      <FormField {...props} editable={!disabled} label={label} multiline={multiline} onChangeText={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxxl },
  intro: { gap: spacing.xs },
  intakeGroup: { padding: spacing.lg, gap: spacing.md },
  formGroup: { paddingHorizontal: spacing.lg },
  field: { paddingVertical: spacing.sm },
  fieldSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  photoGroup: { padding: spacing.lg },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  photoActions: { flex: 1, minWidth: 0, alignItems: "stretch", gap: spacing.xs },
});
