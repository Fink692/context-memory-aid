import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ContactSchema } from "@context/shared";
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
  EmptyState,
  ErrorBanner,
  FormField,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { shouldStackSharedRow } from "@/lib/accessibility-layout";
import { findContactByIdentity } from "@/lib/contact-identity";
import {
  abandonProfilePhotoUris,
  createProfilePhotoDraft,
  forgetCleanedProfilePhotoUris,
  profilePhotoCommitPlan,
  removeProfilePhoto,
  replacementCleanupUris,
  stageProfilePhoto,
  visibleProfilePhotoUri,
  type ProfilePhotoDraft,
} from "@/lib/profile-photo-lifecycle";
import { canPickProfilePhoto, deletePrivateProfilePhotos, pickProfilePhoto } from "@/lib/profile-photo";
import { useAppStore } from "@/store/app-store";

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function EditContactScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = singleParam(params.id);
  const router = useRouter();
  const { fontScale, width } = useWindowDimensions();
  const stackPhotoRow = shouldStackSharedRow({ fontScale, width });
  const contacts = useAppStore((state) => state.contacts);
  const contact = useAppStore((state) => state.contacts.find((item) => item.id === contactId));
  const updateContact = useAppStore((state) => state.updateContact);
  const [displayName, setDisplayName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [metAt, setMetAt] = useState("");
  const [relationshipContext, setRelationshipContext] = useState("");
  const [lastDiscussed, setLastDiscussed] = useState("");
  const [recentUpdate, setRecentUpdate] = useState("");
  const [topics, setTopics] = useState("");
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([]);
  const [photoDraft, setPhotoDraft] = useState<ProfilePhotoDraft>(() => createProfilePhotoDraft());
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [pendingSaved, setPendingSaved] = useState(false);
  const [error, setError] = useState<string>();
  const mounted = useRef(true);
  const initializedContactId = useRef<string | undefined>(undefined);
  const photoDraftRef = useRef(photoDraft);
  const retiredPhotoUris = useRef<string[]>([]);
  const photoUri = visibleProfilePhotoUri(photoDraft);

  const applyPhotoDraft = useCallback((next: ProfilePhotoDraft) => {
    photoDraftRef.current = next;
    if (mounted.current) setPhotoDraft(next);
  }, []);

  const cleanupTrackedPhotos = async (targets: readonly string[]): Promise<string[]> => {
    const failed = await deletePrivateProfilePhotos(targets);
    const failedSet = new Set(failed);
    applyPhotoDraft(forgetCleanedProfilePhotoUris(
      photoDraftRef.current,
      targets.filter((uri) => !failedSet.has(uri)),
    ));
    return failed;
  };

  const cleanupRetiredPhotos = async (): Promise<string[]> => {
    const failed = await deletePrivateProfilePhotos(retiredPhotoUris.current);
    retiredPhotoUris.current = failed;
    return failed;
  };

  useEffect(() => {
    if (!contact || initializedContactId.current === contact.id) return;
    initializedContactId.current = contact.id;
    setDisplayName(contact.displayName);
    setCompany(contact.company ?? "");
    setRole(contact.role ?? "");
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setMetAt(contact.metAt ?? "");
    setRelationshipContext(contact.relationshipContext ?? "");
    setLastDiscussed(contact.lastDiscussed ?? "");
    setRecentUpdate(contact.recentUpdate ?? "");
    setTopics(contact.conversationTopics.join("\n"));
    setSocialLinks(editableSocialLinks(contact.socialLinks));
    applyPhotoDraft(createProfilePhotoDraft(contact.photoUri));
  }, [applyPhotoDraft, contact]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void deletePrivateProfilePhotos([
        ...abandonProfilePhotoUris(photoDraftRef.current),
        ...retiredPhotoUris.current,
      ]);
    };
  }, []);

  const close = async () => {
    if (saveBusy || pendingSaved) return;
    try {
      await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
      await cleanupRetiredPhotos();
    } finally {
      if (router.canGoBack()) router.back();
      else router.replace("/people");
    }
  };

  if (!contact) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit Person", headerLeft: () => <BarButton onPress={() => { void close(); }}>Close</BarButton> }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/people")}>Open People</Button>}
            body="This person may no longer be available."
            symbol={symbols.person}
            title="Person unavailable"
          />
        </Screen>
      </>
    );
  }

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

  const finishPendingSave = async () => {
    setSaveBusy(true);
    const failed = await cleanupRetiredPhotos();
    if (mounted.current) setSaveBusy(false);
    if (failed.length) {
      setError("Your changes are saved, but the previous private photo still needs cleanup. Tap Finish to retry.");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const save = async () => {
    if (pendingSaved) {
      await finishPendingSave();
      return;
    }
    const name = displayName.trim();
    const cleanCompany = company.trim();
    if (!name) {
      setError("Add a name for this person.");
      return;
    }
    if (findContactByIdentity(contacts, name, cleanCompany, contact.id)) {
      setError("That person and company combination is already saved.");
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

    const socialIssue = socialLinksIssue(socialLinks);
    if (socialIssue) {
      setError(socialIssue);
      return;
    }

    const parsed = ContactSchema.safeParse({
      ...contact,
      displayName: name,
      company: cleanCompany || undefined,
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      socialLinks: storedSocialLinks(socialLinks),
      photoUri,
      metAt: metAt.trim() || undefined,
      relationshipContext: relationshipContext.trim() || undefined,
      lastDiscussed: lastDiscussed.trim() || undefined,
      recentUpdate: recentUpdate.trim() || undefined,
      conversationTopics,
      recognitionEnabled: contact.recognitionEnabled,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the profile details and try again.");
      return;
    }

    setSaveBusy(true);
    setError(undefined);
    const stagedCleanupFailures = await cleanupTrackedPhotos(replacementCleanupUris(photoDraftRef.current));
    if (!mounted.current) return;
    if (stagedCleanupFailures.length) {
      setSaveBusy(false);
      setError("Context could not remove an older staged photo. Try saving again; your current photo and edits are still here.");
      return;
    }

    const commitPlan = profilePhotoCommitPlan(photoDraftRef.current);
    try {
      await updateContact(contact.id, {
        displayName: parsed.data.displayName,
        company: parsed.data.company,
        role: parsed.data.role,
        email: parsed.data.email,
        phone: parsed.data.phone,
        socialLinks: parsed.data.socialLinks,
        photoUri: parsed.data.photoUri,
        metAt: parsed.data.metAt,
        relationshipContext: parsed.data.relationshipContext,
        lastDiscussed: parsed.data.lastDiscussed,
        recentUpdate: parsed.data.recentUpdate,
        conversationTopics: parsed.data.conversationTopics,
        recognitionEnabled: parsed.data.recognitionEnabled,
      });
    } catch {
      await cleanupTrackedPhotos(abandonProfilePhotoUris(photoDraftRef.current));
      applyPhotoDraft(createProfilePhotoDraft(contact.photoUri));
      setSaveBusy(false);
      setError("Context could not save these changes. The staged photo was removed, and the previously saved photo is still intact.");
      return;
    }
    applyPhotoDraft(createProfilePhotoDraft(commitPlan.desiredUri));
    retiredPhotoUris.current = commitPlan.cleanupUris;
    const saved = useAppStore.getState().contacts.find((item) => item.id === contact.id);
    if (!saved || saved.photoUri !== parsed.data.photoUri || saved.displayName !== parsed.data.displayName) {
      setSaveBusy(false);
      setPendingSaved(true);
      setError("Your changes were saved, but Context could not finish verifying local photo cleanup. Tap Finish to retry.");
      return;
    }

    const cleanupFailures = await cleanupRetiredPhotos();
    setSaveBusy(false);
    if (cleanupFailures.length) {
      setPendingSaved(true);
      setError("Your changes are saved, but the previous private photo still needs cleanup. Tap Finish to retry.");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  const editingLocked = photoBusy || saveBusy || pendingSaved;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Person",
          gestureEnabled: !saveBusy && !pendingSaved,
          headerLeft: () => <BarButton disabled={saveBusy || pendingSaved} onPress={() => { void close(); }}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={photoBusy || saveBusy} onPress={() => { void save(); }}>{pendingSaved ? "Finish" : "Done"}</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <ErrorBanner message={error} />

        <ListSection groupStyle={styles.photoGroup} title="Photo">
          <View style={[styles.photoRow, stackPhotoRow && styles.photoRowStacked]}>
            <Avatar name={displayName || contact.displayName} photoUri={photoUri} size={76} />
            <View style={[styles.photoActions, stackPhotoRow && styles.photoActionsStacked]}>
              {canPickProfilePhoto() ? (
                <Button disabled={editingLocked} loading={photoBusy} onPress={() => { void choosePhoto(); }} symbol={symbols.camera} variant="secondary">
                  {photoUri ? "Change Photo" : "Choose Photo"}
                </Button>
              ) : null}
              {photoUri ? <BarButton destructive disabled={editingLocked} onPress={() => {
                const next = removeProfilePhoto(photoDraftRef.current);
                applyPhotoDraft(next);
                void cleanupTrackedPhotos(replacementCleanupUris(next));
              }}>Remove Photo</BarButton> : null}
            </View>
          </View>
        </ListSection>

        <ListSection groupStyle={styles.formGroup} title="Profile">
          <ProfileField autoCapitalize="words" disabled={editingLocked} label="Name" maxLength={100} onChange={setDisplayName} placeholder="Maya Chen" value={displayName} />
          <ProfileField autoCapitalize="words" disabled={editingLocked} label="Company or place" maxLength={120} onChange={setCompany} placeholder="Neighborhood Superstore" value={company} />
          <ProfileField autoCapitalize="words" disabled={editingLocked} label="Role" maxLength={120} onChange={setRole} placeholder="Bakery manager" value={role} />
          <ProfileField autoCapitalize="none" autoComplete="email" disabled={editingLocked} keyboardType="email-address" label="Email" maxLength={254} onChange={setEmail} placeholder="maya@example.com" value={email} />
          <ProfileField autoCapitalize="none" autoComplete="tel" disabled={editingLocked} keyboardType="phone-pad" label="Phone" maxLength={40} onChange={setPhone} placeholder="(204) 555-0123" value={phone} />
          <ProfileField disabled={editingLocked} label="Where you know them from" maxLength={160} onChange={setMetAt} placeholder="Superstore on Portage Avenue" value={metAt} />
          <ProfileField disabled={editingLocked} label="Who they are to you" last maxLength={500} multiline onChange={setRelationshipContext} placeholder="Friendly staff member I see most Saturdays" value={relationshipContext} />
        </ListSection>

        <SocialLinksEditor disabled={editingLocked} onChange={setSocialLinks} rows={socialLinks} />

        <ListSection groupStyle={styles.formGroup} title="Conversation Context">
          <ProfileField disabled={editingLocked} label="Last discussed" maxLength={240} multiline onChange={setLastDiscussed} placeholder="Her sourdough starter and the Saturday rush" value={lastDiscussed} />
          <ProfileField disabled={editingLocked} label="Recent update" maxLength={240} multiline onChange={setRecentUpdate} placeholder="Moving to a weekday shift next month" value={recentUpdate} />
          <ProfileField disabled={editingLocked} label="Conversation prompts" last maxLength={1_500} multiline onChange={setTopics} placeholder={"Ask about the new shift\nHow is the sourdough starter?"} value={topics} />
        </ListSection>
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
  formGroup: { paddingHorizontal: spacing.lg },
  field: { paddingVertical: spacing.sm },
  fieldSeparated: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  photoGroup: { padding: spacing.lg },
  photoRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  photoRowStacked: { flexDirection: "column", alignItems: "flex-start" },
  photoActions: { flex: 1, minWidth: 0, alignItems: "stretch", gap: spacing.xs },
  photoActionsStacked: { width: "100%", flex: 0 },
});
