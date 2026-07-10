import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/ui";
import { colors, radius, shadow, spacing } from "@/constants/theme";

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close confirmation"
          accessibilityRole="button"
          onPress={busy ? undefined : onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Button disabled={busy} onPress={onCancel} style={styles.action} variant="secondary">Cancel</Button>
            <Button
              loading={busy}
              onPress={onConfirm}
              style={styles.action}
              variant={destructive ? "danger" : "primary"}
            >
              {confirmLabel}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17, 24, 39, 0.58)",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 460,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow,
  },
  title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: "800" },
  body: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
});
