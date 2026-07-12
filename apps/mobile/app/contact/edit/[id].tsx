import { useEffect, useState, type ComponentProps } from "react";
import { StyleSheet, Switch, View } from "react-native";
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
  ListRow,
  ListSection,
  Screen,
  symbols,
} from "@/components/ui";
import { colors, spacing } from "@/constants/theme";
import { findContactByIdentity } from "@/lib/contact-identity";
import { canPickProfilePhoto, deletePrivateProfilePhoto, pickProfilePhoto } from "@/lib/profile-photo";
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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [metAt, setMetAt] = useState("");
  const [relationshipContext, setRelationshipContext] = useState("");
  const [lastDiscussed, setLastDiscussed] = useState("");
  const [recentUpdate, setRecentUpdate] = useState("");
  const [topics, setTopics] = useState("");
  const [socialLinks, setSocialLinks] = useState<EditableSocialLink[]>([]);
  const [photoUri, setPhotoUri] = useState<string>();
  const [recognitionEnabled, setRecognitionEnabled] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!contact) return;
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
    setPhotoUri(contact.photoUri);
    setRecognitionEnabled(contact.recognitionEnabled);
  }, [contact]);

  const close = () => {
    if (photoUri && photoUri !== contact?.photoUri) void deletePrivateProfilePhoto(photoUri);
    if (router.canGoBack()) router.back();
    else router.replace("/people");
  };

  if (!contact) {
    return (
      <>
        <Stack.Screen options={{ title: "Edit Person", headerLeft: () => <BarButton onPress={close}>Close</BarButton> }} />
        <Screen>
          <EmptyState
            action={<Button onPress={() => router.replace("/people")}>Open People</Button>}
            body="This person may have been removed from this device."
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
        if (photoUri && photoUri !== contact.photoUri) await deletePrivateProfilePhoto(photoUri);
        setPhotoUri(selected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Context could not add that photo.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = () => {
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
      recognitionEnabled,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the profile details and try again.");
      return;
    }

    updateContact(contact.id, {
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
    if (contact.photoUri && contact.photoUri !== parsed.data.photoUri) void deletePrivateProfilePhoto(contact.photoUri);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/contact/[id]", params: { id: contact.id } });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "Edit Person",
          headerLeft: () => <BarButton onPress={close}>Cancel</BarButton>,
          headerRight: () => <BarButton disabled={photoBusy} onPress={save}>Done</BarButton>,
        }}
      />
      <Screen contentContainerStyle={styles.screen}>
        <ErrorBanner message={error} />

        <ListSection groupStyle={styles.photoGroup} title="Photo">
          <View style={styles.photoRow}>
            <Avatar name={displayName || contact.displayName} photoUri={photoUri} size={76} />
            <View style={styles.photoActions}>
              {canPickProfilePhoto() ? (
                <Button loading={photoBusy} onPress={() => { void choosePhoto(); }} symbol={symbols.camera} variant="secondary">
                  {photoUri ? "Change Photo" : "Choose Photo"}
                </Button>
              ) : null}
              {photoUri ? <BarButton destructive disabled={photoBusy} onPress={() => {
                if (photoUri !== contact.photoUri) void deletePrivateProfilePhoto(photoUri);
                setPhotoUri(undefined);
              }}>Remove Photo</BarButton> : null}
            </View>
          </View>
        </ListSection>

        <ListSection groupStyle={styles.formGroup} title="Profile">
          <ProfileField autoCapitalize="words" disabled={photoBusy} label="Name" maxLength={100} onChange={setDisplayName} placeholder="Maya Chen" value={displayName} />
          <ProfileField autoCapitalize="words" disabled={photoBusy} label="Company or place" maxLength={120} onChange={setCompany} placeholder="Neighborhood Superstore" value={company} />
          <ProfileField autoCapitalize="words" disabled={photoBusy} label="Role" maxLength={120} onChange={setRole} placeholder="Bakery manager" value={role} />
          <ProfileField autoCapitalize="none" autoComplete="email" disabled={photoBusy} keyboardType="email-address" label="Email" maxLength={254} onChange={setEmail} placeholder="maya@example.com" value={email} />
          <ProfileField autoCapitalize="none" autoComplete="tel" disabled={photoBusy} keyboardType="phone-pad" label="Phone" maxLength={40} onChange={setPhone} placeholder="(204) 555-0123" value={phone} />
          <ProfileField disabled={photoBusy} label="Where you know them from" maxLength={160} onChange={setMetAt} placeholder="Superstore on Portage Avenue" value={metAt} />
          <ProfileField disabled={photoBusy} label="Who they are to you" last maxLength={500} multiline onChange={setRelationshipContext} placeholder="Friendly staff member I see most Saturdays" value={relationshipContext} />
        </ListSection>

        <SocialLinksEditor disabled={photoBusy} onChange={setSocialLinks} rows={socialLinks} />

        <ListSection groupStyle={styles.formGroup} title="Conversation Context">
          <ProfileField disabled={photoBusy} label="Last discussed" maxLength={240} multiline onChange={setLastDiscussed} placeholder="Her sourdough starter and the Saturday rush" value={lastDiscussed} />
          <ProfileField disabled={photoBusy} label="Recent update" maxLength={240} multiline onChange={setRecentUpdate} placeholder="Moving to a weekday shift next month" value={recentUpdate} />
          <ProfileField disabled={photoBusy} label="Conversation prompts" last maxLength={1_500} multiline onChange={setTopics} placeholder={"Ask about the new shift\nHow is the sourdough starter?"} value={topics} />
        </ListSection>

        <ListSection footer="Quick matching only reads Context QR badges while you choose to scan one." title="Optional Badge Tool">
          <ListRow
            accessoryNode={(
              <Switch
                accessibilityLabel="Allow quick badge matching"
                disabled={photoBusy}
                onValueChange={setRecognitionEnabled}
                trackColor={{ false: colors.fillStrong, true: colors.primary }}
                value={recognitionEnabled}
              />
            )}
            last
            subtitle="Useful at an event, but never required for a person"
            title="Quick Badge Matching"
          />
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
  photoActions: { flex: 1, minWidth: 0, alignItems: "stretch", gap: spacing.xs },
});
