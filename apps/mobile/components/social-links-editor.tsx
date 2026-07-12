import { StyleSheet, View } from "react-native";
import type { SocialLink } from "@context/shared";
import { BarButton, Button, FormField, ListSection, symbols } from "@/components/ui";
import { spacing } from "@/constants/theme";

export interface EditableSocialLink {
  id: string;
  platform: string;
  value: string;
}

function rowId(index: number): string {
  return `social-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

export function editableSocialLinks(links: SocialLink[] = []): EditableSocialLink[] {
  return links.map((link, index) => ({
    id: rowId(index),
    platform: link.platform,
    value: link.url ?? link.handle ?? "",
  }));
}

export function socialLinksIssue(rows: EditableSocialLink[]): string | undefined {
  for (const row of rows) {
    const platform = row.platform.trim();
    const value = row.value.trim();
    if (platform && !value) return `Add a handle or profile link for ${platform}, or remove that row.`;
    if (!platform && value) return "Name the social network for each handle or profile link.";
    if (/^http:\/\//i.test(value)) return "Social profile links must use HTTPS.";
  }
  return undefined;
}

export function storedSocialLinks(rows: EditableSocialLink[]): SocialLink[] {
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const platform = row.platform.trim();
    let value = row.value.trim();
    if (!platform || !value) return [];

    let link: SocialLink;
    if (/^https:\/\//i.test(value)) {
      link = { platform, url: `https://${value.slice(8)}` };
    } else if (/^www\./i.test(value) || (/^[^\s@]+\.[^\s]+$/.test(value) && !value.startsWith("@"))) {
      link = { platform, url: `https://${value}` };
    } else {
      value = value.replace(/^@/, "");
      if (!value) return [];
      link = { platform, handle: value };
    }

    const key = `${platform.toLocaleLowerCase()}|${link.url?.toLocaleLowerCase() ?? link.handle?.toLocaleLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [link];
  });
}

export function SocialLinksEditor({
  disabled = false,
  rows,
  onChange,
}: {
  disabled?: boolean;
  rows: EditableSocialLink[];
  onChange: (rows: EditableSocialLink[]) => void;
}) {
  const update = (id: string, key: "platform" | "value", value: string) => {
    onChange(rows.map((row) => row.id === id ? { ...row, [key]: value } : row));
  };

  const add = () => {
    onChange([...rows, { id: rowId(rows.length), platform: "", value: "" }]);
  };

  return (
    <ListSection
      footer="Add a handle or a full HTTPS profile link. Nothing is looked up or uploaded."
      groupStyle={styles.group}
      title="Social Profiles"
    >
      {rows.map((row, index) => (
        <View key={row.id} style={[styles.row, index !== rows.length - 1 && styles.separated]}>
          <FormField
            autoCapitalize="words"
            editable={!disabled}
            label="Network"
            maxLength={40}
            onChangeText={(value) => update(row.id, "platform", value)}
            placeholder="Instagram, LinkedIn, TikTok…"
            value={row.platform}
          />
          <FormField
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            keyboardType="url"
            label="Handle or profile link"
            maxLength={2_048}
            onChangeText={(value) => update(row.id, "value", value)}
            placeholder="@handle or https://…"
            value={row.value}
          />
          <BarButton
            accessibilityLabel={`Remove ${row.platform || "social"} profile`}
            destructive
            disabled={disabled}
            onPress={() => onChange(rows.filter((item) => item.id !== row.id))}
            style={styles.remove}
          >
            Remove
          </BarButton>
        </View>
      ))}
      <Button disabled={disabled || rows.length >= 12} onPress={add} symbol={symbols.plus} variant="secondary">
        Add Social Profile
      </Button>
    </ListSection>
  );
}

const styles = StyleSheet.create({
  group: { padding: spacing.lg, gap: spacing.md },
  row: { gap: spacing.sm, paddingBottom: spacing.md },
  separated: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(128, 128, 128, 0.24)" },
  remove: { alignSelf: "flex-end" },
});
