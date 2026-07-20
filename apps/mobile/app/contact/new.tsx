import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Alert, StyleSheet, Switch, useWindowDimensions, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ContactSchema, type Contact, type Memory } from "@context/shared";
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
import { shouldStackSharedRow } from "@/lib/accessibility-layout";
import { findContactByIdentity } from "@/lib/contact-identity";
import { duplicateContactUpdates, duplicateResolutionMessage } from "@/lib/duplicate-contact-resolution";
import { createContactId } from "@/lib/entity-id";
import { createModelContactDraft } from "@/lib/local-model";
import { mutationErrorMessage } from "@/lib/mutation-error";
import {
  abandonProfilePhotoUris,
  createProfilePhotoDraft,
  forgetCleanedProfilePhotoUris,
  removeProfilePhoto,
  replacementCleanupUris,
  stageProfilePhoto,
  visibleProfilePhotoUri,
  type ProfilePhotoDraft,
} from "@/lib/profile-photo-lifecycle";
import { canPickProfilePhoto, deletePrivateProfilePhotos, pickProfilePhoto } from "@/lib/profile-photo";
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
  const { fontScale, width } = useWindowDimensions();
  const stackPhotoRow = shouldStackSharedRow({ fontScale, width });
  const contacts = useAppStore((state) => state.contacts);
  const events = useAppStore((state) => state.events);
  const currentEventId = useAppStore((state) => state.currentEventId);
  const localToolsEnabled = useAppStore((state) => state.localToolsEnabled);
  const addContact = useAppStore((state) => state.addContact);
  const addContactToEvent = useAppStore((state) => state.addContactToEvent);
  const addMemory = useAppStore((state) => state.addMemory);
  const updateMemory = useAppStore((state) => state.updateMemory);
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
  const [photoDraft, setPhotoDraft] = useState<ProfilePhotoDraft>(() => createProfilePhotoDraft());
  const [includeInEvent, setIncludeInEvent] = useState(Boolean(event));
  const [modelBusy, setModelBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [pendingSavedContactId, setPendingSavedContactId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const modelRequest = useRef(0);
  const mounted = useRef(true);
  const photoDraftRef = useRef(photoDraft);
  const retiredPhotoUris = useRef<string[]>([]);
  const initialMemoryId = useRef(`memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  const dictation = useOnDeviceDictation();
  const busy = dictation.busy || modelBusy || photoBusy || saveBusy;
  const photoUri = visibleProfilePhotoUri(photoDraft);

  const applyPhotoDraft = (next: ProfilePhotoDraft) => {
    photoDraftRef.current = next;
    if (mounted.current) setPhotoDraft(next);
  };

  const cleanupTrackedPhotos = async (targets: readonly string[]): Promise<string[]> => {
    const failed = await deletePrivateProfilePhotos(targets);
    const failedSet = new Set(failed);
    const cleaned = targets.filter((uri) => !failedSet.has(uri));
    applyPhotoDraft(forgetCleanedProfilePhotoUris(photoDraftRef.current, cleaned));
    return failed;
  };

  const cleanupRetiredPhotos = async (): Promise<string[]> => {
    const failed = await deletePrivateProfilePhotos(retiredPhotoUris.current);
    retiredPhotoUris.current = failed;
    return failed;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      modelRequest.current += 1;
      void deletePrivateProfilePhotos([
        ...abandonProfilePhotoUris(photoDraftRef.current),
        ...retiredPhotoUris.current,
      ]);
    };
  }, []);

  const close = async () => {
    if (saveBusy || pendingSavedContactId) return;
    modelRequest.current += 1;
    try {
      try {
        if (dictation.busy) await dictation.cancel();
      } finally {
        await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
        await cleanupRetiredPhotos();
      }
    } finally {
      if (router.canGoBack()) router.back();
      else router.replace("/people");
    }
  };

  const fillDetails = async () => {
    if (dictation.busy) {
      setError("Stop dictation before asking Smart Assist to fill the details.");
      return;
    }
    if (!localToolsEnabled) {
      setError("Set up Smart Assist before asking it to fill details.");
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
      setNotice("Smart Assist filled the details. Review everything before you add the person.");
    } catch (caught) {
      if (request !== modelRequest.current) return;
      setError(caught instanceof Error
        ? caught.message
        : "Smart Assist could not fill these details. Your description is still here, and you can enter them manually.");
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
        if (!mounted.current) {
          await deletePrivateProfilePhotos([selected]);
          return;
        }
        const next = stageProfilePhoto(photoDraftRef.current, selected);
        applyPhotoDraft(next);
        const failed = await cleanupTrackedPhotos(replacementCleanupUris(next));
        if (failed.length) {
          setError("The new photo is staged, but an older selection could not be removed yet. Context will retry before saving or closing.");
        }
      }
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Context could not add that photo.");
    } finally {
      if (mounted.current) setPhotoBusy(false);
    }
  };

  const addNotesMemory = async (contactId: string) => {
    const cleanNotes = notes.trim();
    if (!cleanNotes) return;
    const existing = useAppStore.getState().contacts
      .find((contact) => contact.id === contactId)
      ?.timeline.find((memory) => memory.id === initialMemoryId.current);
    if (existing) {
      await updateMemory(contactId, existing.id, {
        summary: cleanNotes.slice(0, 500),
        details: cleanNotes,
      });
      return;
    }
    const now = new Date().toISOString();
    const memory: Memory = {
      id: initialMemoryId.current,
      contactId,
      summary: cleanNotes.slice(0, 500),
      details: cleanNotes,
      tags: ["first impression"],
      nextSteps: [],
      source: dictation.state.targetId === "new-person-description" && dictation.state.finalizedText.trim() ? "voice" : "text",
      occurredAt: now,
      createdAt: now,
    };
    await addMemory(memory);
  };

  const openSavedContact = (contactId: string) => {
    router.replace({ pathname: "/contact/[id]", params: { id: contactId } });
  };

  const finishPendingSave = async () => {
    if (!pendingSavedContactId) return;
    setSaveBusy(true);
    setError(undefined);
    try {
      if (event && includeInEvent) await addContactToEvent(pendingSavedContactId, event.id);
      await addNotesMemory(pendingSavedContactId);
      const failed = await cleanupRetiredPhotos();
      if (failed.length) {
        setError("The person is saved, but the previous private photo still needs cleanup. Tap Finish to retry.");
        return;
      }
      openSavedContact(pendingSavedContactId);
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "The person is saved, but Context could not finish the note or event link. Your details are still here; tap Finish to retry.",
      ));
    } finally {
      setSaveBusy(false);
    }
  };

  const preparePhotoCommit = async (): Promise<boolean> => {
    const failed = await cleanupTrackedPhotos(replacementCleanupUris(photoDraftRef.current));
    if (!failed.length) return true;
    setError("Context could not remove an older staged photo. Try saving again; your current photo and details are still here.");
    return false;
  };

  const saveDraftSeparately = async (draft: Contact) => {
    if (!mounted.current) return;
    setSaveBusy(true);
    setError(undefined);
    try {
      if (!await preparePhotoCommit() || !mounted.current) return;
      try {
        await addContact(draft, event && includeInEvent ? event.id : null);
      } catch (caught) {
        await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
        applyPhotoDraft(createProfilePhotoDraft());
        setError(mutationErrorMessage(
          caught,
          "Context could not save this person. The staged photo was removed; your other entered details are still here.",
        ));
        return;
      }
      const saved = useAppStore.getState().contacts.find((item) => item.id === draft.id);
      if (!saved || saved.photoUri !== draft.photoUri) {
        await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
        applyPhotoDraft(createProfilePhotoDraft());
        setError("Context could not save this person. The staged photo was removed; your other entered details are still here.");
        return;
      }
      applyPhotoDraft(createProfilePhotoDraft(draft.photoUri));
      try {
        await addNotesMemory(draft.id);
      } catch (caught) {
        setPendingSavedContactId(draft.id);
        setError(mutationErrorMessage(
          caught,
          "The person is saved, but Context could not finish the note. Your details are still here; tap Finish to retry.",
        ));
        return;
      }
      openSavedContact(draft.id);
    } finally {
      if (mounted.current) setSaveBusy(false);
    }
  };

  const updateExistingContact = async (existing: Contact, draft: Contact) => {
    if (!mounted.current) return;
    setSaveBusy(true);
    setError(undefined);
    try {
      if (!await preparePhotoCommit() || !mounted.current) return;
      // Removing a photo in the New Person form abandons that new selection;
      // it must not silently delete a photo already owned by a duplicate.
      const photoIntent = photoDraftRef.current.selection.kind === "staged" ? "replace" : "preserve";
      const updates = duplicateContactUpdates(existing, draft, photoIntent);
      const merged = ContactSchema.safeParse({ ...existing, ...updates });
      if (!merged.success) {
        setError(merged.error.issues[0]?.message ?? "Context could not combine these details with the existing person.");
        return;
      }
      try {
        await useAppStore.getState().updateContact(existing.id, updates);
      } catch {
        await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
        applyPhotoDraft(createProfilePhotoDraft());
        setError("Context could not update the existing person. The staged photo was removed; your other entered details are still here.");
        return;
      }
      const stagedPhoto = photoDraftRef.current.selection.kind === "staged"
        ? photoDraftRef.current.selection.uri
        : undefined;
      const committedPhoto = photoIntent === "preserve" ? existing.photoUri : stagedPhoto;
      applyPhotoDraft(createProfilePhotoDraft(committedPhoto));
      retiredPhotoUris.current = existing.photoUri && existing.photoUri !== committedPhoto
        ? [existing.photoUri]
        : [];
      const saved = useAppStore.getState().contacts.find((item) => item.id === existing.id);
      if (!saved || saved.photoUri !== merged.data.photoUri || saved.displayName !== merged.data.displayName) {
        setPendingSavedContactId(existing.id);
        setError("The person was updated, but Context could not finish verifying private photo cleanup. Tap Finish to retry.");
        return;
      }
      try {
        if (event && includeInEvent) await addContactToEvent(existing.id, event.id);
        await addNotesMemory(existing.id);
      } catch (caught) {
        setPendingSavedContactId(existing.id);
        setError(mutationErrorMessage(
          caught,
          "The person is updated, but Context could not finish the note or event link. Your details are still here; tap Finish to retry.",
        ));
        return;
      }
      const failed = await cleanupRetiredPhotos();
      if (failed.length) {
        setPendingSavedContactId(existing.id);
        setError("The person was updated and linked as selected, but the previous private photo still needs cleanup. Tap Finish to retry.");
        return;
      }
      openSavedContact(existing.id);
    } finally {
      if (mounted.current) setSaveBusy(false);
    }
  };

  const save = async () => {
    if (pendingSavedContactId) {
      await finishPendingSave();
      return;
    }
    if (busy) {
      setError("Finish the current dictation or Smart Assist task before adding this person.");
      return;
    }
    const name = displayName.trim();
    const cleanCompany = company.trim();
    if (!name) {
      setError("Add a name before saving this person.");
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
      recognitionEnabled: false,
      timeline: [],
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the person’s details and try again.");
      return;
    }

    const existing = findContactByIdentity(contacts, name, cleanCompany);
    if (!existing) {
      await saveDraftSeparately(parsed.data);
      return;
    }

    Alert.alert(
      "Possible Duplicate",
      duplicateResolutionMessage(existing.displayName, event?.name, Boolean(event && includeInEvent)),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Save Separately", onPress: () => { void saveDraftSeparately(parsed.data); } },
        { text: "Update Existing", onPress: () => { void updateExistingContact(existing, parsed.data); } },
      ],
    );
  };

  const contextualStrings = [displayName, company, role, event?.name]
    .filter((value): value is string => Boolean(value));
  const formLocked = busy || Boolean(pendingSavedContactId);

  return (
    <>
      <Stack.Screen
        options={{
          title: "New Person",
          gestureEnabled: !saveBusy && !pendingSavedContactId,
          headerLeft: () => <BarButton disabled={saveBusy || Boolean(pendingSavedContactId)} onPress={() => { void close(); }}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={busy} onPress={() => { void save(); }}>{pendingSavedContactId ? "Finish" : "Add"}</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <View style={styles.intro}>
          <AppText accessibilityRole="header" emphasis="semibold" role="title2">Add someone you want to remember</AppText>
          <AppText role="callout" tone="secondary">
            Start with a name and one useful detail. Everything else is optional.
          </AppText>
        </View>

        <ErrorBanner message={error} />
        <SuccessBanner message={notice} />

        <ListSection
          footer="Review every suggestion before saving."
          groupStyle={styles.intakeGroup}
          title="Quick Add"
        >
          <FormField
            accessibilityLabel="Describe this person"
            autoCapitalize="sentences"
            editable={!formLocked}
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
          {localToolsEnabled ? (
            <Button
              disabled={!intake.trim() || formLocked}
              loading={modelBusy}
              onPress={() => { void fillDetails(); }}
              symbol={symbols.sparkles}
            >
              Suggest Details
            </Button>
          ) : (
            <Button onPress={() => router.push("/smart-assist")} symbol={symbols.sparkles} variant="secondary">
              Set Up Smart Assist
            </Button>
          )}
        </ListSection>

        <ListSection groupStyle={styles.photoGroup} title="Photo">
          <View style={[styles.photoRow, stackPhotoRow && styles.photoRowStacked]}>
            <Avatar name={displayName || "New Person"} photoUri={photoUri} size={76} />
            <View style={[styles.photoActions, stackPhotoRow && styles.photoActionsStacked]}>
              {canPickProfilePhoto() ? (
                <Button disabled={formLocked} loading={photoBusy} onPress={() => { void choosePhoto(); }} symbol={symbols.camera} variant="secondary">
                  {photoUri ? "Change Photo" : "Choose Photo"}
                </Button>
              ) : null}
              {photoUri ? <BarButton destructive disabled={formLocked} onPress={() => {
                const next = removeProfilePhoto(photoDraftRef.current);
                applyPhotoDraft(next);
                void cleanupTrackedPhotos(replacementCleanupUris(next));
              }}>Remove Photo</BarButton> : null}
            </View>
          </View>
        </ListSection>

        <ListSection groupStyle={styles.formGroup} title="Details">
          <ProfileField autoCapitalize="words" disabled={formLocked} label="Name" maxLength={100} onChange={setDisplayName} placeholder="Maya Chen" value={displayName} />
          <ProfileField autoCapitalize="words" disabled={formLocked} label="Company or place" maxLength={120} onChange={setCompany} placeholder="Neighborhood Superstore" value={company} />
          <ProfileField autoCapitalize="words" disabled={formLocked} label="Role" maxLength={120} onChange={setRole} placeholder="Bakery manager" value={role} />
          <ProfileField autoCapitalize="none" autoComplete="email" disabled={formLocked} keyboardType="email-address" label="Email" maxLength={254} onChange={setEmail} placeholder="maya@example.com" value={email} />
          <ProfileField autoCapitalize="none" autoComplete="tel" disabled={formLocked} keyboardType="phone-pad" label="Phone" maxLength={40} onChange={setPhone} placeholder="(204) 555-0123" value={phone} />
          <ProfileField disabled={formLocked} label="Where you know them from" maxLength={160} onChange={setMetAt} placeholder="Superstore on Portage Avenue" value={metAt} />
          <ProfileField disabled={formLocked} label="Who they are to you" maxLength={500} multiline onChange={setRelationshipContext} placeholder="Friendly staff member I see most Saturdays" value={relationshipContext} />
          <ProfileField disabled={formLocked} label="Notes to remember" last maxLength={500} multiline onChange={setNotes} placeholder="Asked about the sourdough starter; moving to a new shift next month" value={notes} />
        </ListSection>

        <SocialLinksEditor disabled={formLocked} onChange={setSocialLinks} rows={socialLinks} />

        {event ? (
          <ListSection footer="People can live in your directory without belonging to an event." title="Event (Optional)">
            <ListRow
              accessoryNode={(
                <Switch
                  accessibilityLabel={`Include this person in ${event.name}`}
                  disabled={formLocked}
                  onValueChange={setIncludeInEvent}
                  trackColor={{ false: colors.fillStrong, true: colors.primary }}
                  value={includeInEvent}
                />
              )}
              last
              subtitle={includeInEvent ? "They will also appear in this event" : "They will only appear in People"}
              title={event.name}
            />
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
  photoRowStacked: { flexDirection: "column", alignItems: "flex-start" },
  photoActions: { flex: 1, minWidth: 0, alignItems: "stretch", gap: spacing.xs },
  photoActionsStacked: { width: "100%", flex: 0 },
});
