import { useEffect, useRef } from "react";
import { AccessibilityInfo, ActivityIndicator, Linking, Platform, StyleSheet, View } from "react-native";
import { AppText, Button, IconButton, symbols } from "@/components/ui";
import { colors, controlSize, radius, spacing } from "@/constants/theme";
import type { DictationTargetOptions, OnDeviceDictationController } from "@/lib/use-on-device-dictation";

const stopSymbol = { ios: "stop.fill", android: "stop", web: "stop" } as const;
const cancelSymbol = { ios: "xmark", android: "close", web: "close" } as const;

export interface DictationControlProps extends Omit<DictationTargetOptions, "targetId" | "label"> {
  controller: OnDeviceDictationController;
  targetId: string;
  label: string;
  disabled?: boolean;
  compact?: boolean;
}

function phaseLabel(phase: OnDeviceDictationController["state"]["phase"], progress?: number): string {
  switch (phase) {
    case "preparing":
      return "Preparing private dictation…";
    case "downloading-assets":
      return progress === undefined
        ? "Preparing the iPhone’s speech model…"
        : `Preparing the iPhone’s speech model · ${Math.round(progress * 100)}%`;
    case "recording":
      return "Listening on this iPhone…";
    case "finalizing":
      return "Finishing transcription…";
    case "error":
      return "Dictation stopped";
    case "unavailable":
      return "On-device dictation unavailable";
    case "idle":
      return "";
  }
}

function shouldAnnouncePhase(phase: OnDeviceDictationController["state"]["phase"]): boolean {
  return phase === "preparing"
    || phase === "downloading-assets"
    || phase === "recording"
    || phase === "finalizing";
}

function compactPhaseLabel(
  phase: OnDeviceDictationController["state"]["phase"],
  elapsedMs: number,
  progress?: number,
): string {
  switch (phase) {
    case "recording":
      return `${Math.floor(elapsedMs / 1_000)}s`;
    case "downloading-assets":
      return progress === undefined ? "Preparing" : `${Math.round(progress * 100)}%`;
    case "finalizing":
      return "Finishing";
    case "preparing":
      return "Preparing";
    case "error":
    case "unavailable":
    case "idle":
      return "";
  }
}

export function DictationControl({
  controller,
  targetId,
  label,
  value,
  onChange,
  maxLength,
  maxDurationSeconds,
  separator,
  localeTag,
  contextualStrings,
  disabled = false,
  compact = false,
}: DictationControlProps) {
  const active = controller.isTargetActive(targetId);
  const blockedByAnotherField = controller.busy && !active;
  const ownsState = controller.state.targetId === targetId;
  const status = active
    ? phaseLabel(controller.state.phase, controller.state.assetProgress)
    : "";
  const announcementKey = active
    && controller.state.sessionId
    && shouldAnnouncePhase(controller.state.phase)
    ? `${controller.state.sessionId}:${controller.state.phase}`
    : undefined;
  const lastAnnouncement = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS !== "ios" || !announcementKey || lastAnnouncement.current === announcementKey) return;
    lastAnnouncement.current = announcementKey;
    AccessibilityInfo.announceForAccessibility(`${label}. ${phaseLabel(controller.state.phase)}`);
  }, [announcementKey, controller.state.phase, label]);

  if (!controller.available) return null;

  const begin = () => controller.start({
    targetId,
    label,
    value,
    onChange,
    maxLength,
    ...(maxDurationSeconds === undefined ? {} : { maxDurationSeconds }),
    ...(separator === undefined ? {} : { separator }),
    ...(localeTag === undefined ? {} : { localeTag }),
    ...(contextualStrings === undefined ? {} : { contextualStrings }),
  });

  if (!active) {
    return (
      <View style={[styles.container, compact && styles.containerCompact]}>
        {compact ? (
          <IconButton
            accessibilityLabel={`Dictate ${label}`}
            accessibilityHint={blockedByAnotherField
              ? "Finish dictation in the other field first"
              : "Starts private on-device dictation"}
            disabled={disabled || blockedByAnotherField}
            onPress={() => { void begin(); }}
            style={styles.dictationIcon}
            symbol={symbols.microphone}
          />
        ) : (
          <Button
            accessibilityLabel={`Dictate ${label}`}
            accessibilityHint={blockedByAnotherField
              ? "Finish dictation in the other field first"
              : "Starts private on-device dictation"}
            disabled={disabled || blockedByAnotherField}
            onPress={() => { void begin(); }}
            style={styles.action}
            symbol={symbols.microphone}
            variant="secondary"
          >
            Dictate
          </Button>
        )}
        {ownsState && controller.state.error ? (
          <>
            <AppText accessibilityRole="alert" role="footnote" style={styles.feedback} tone="destructive">
              {controller.state.error}
            </AppText>
            {/Settings/i.test(controller.state.error) ? (
              <Button accessibilityLabel="Open iPhone Settings for dictation access" onPress={() => { void Linking.openSettings(); }} style={styles.settingsAction} variant="secondary">
                Open iPhone Settings
              </Button>
            ) : null}
          </>
        ) : null}
        {ownsState && controller.state.reason === "duration-limit" ? (
          <AppText role="footnote" style={styles.feedback} tone="secondary">
            The one-minute dictation limit was reached. Review the text before saving.
          </AppText>
        ) : null}
        {ownsState && controller.state.reason === "character-limit" ? (
          <AppText role="footnote" style={styles.feedback} tone="secondary">
            The field’s character limit was reached. Review the ending before saving.
          </AppText>
        ) : null}
      </View>
    );
  }

  if (compact) {
    const recording = controller.state.phase === "recording";
    const compactStatus = compactPhaseLabel(
      controller.state.phase,
      controller.state.elapsedMs,
      controller.state.assetProgress,
    );
    return (
      <View style={[styles.container, styles.containerCompact]}>
        <View style={[styles.compactSession, recording && styles.compactSessionRecording]}>
          <AppText
            accessibilityLiveRegion="polite"
            emphasis="semibold"
            numberOfLines={1}
            role="caption1"
            style={styles.compactStatus}
            tone={recording ? "destructive" : "secondary"}
          >
            {compactStatus}
          </AppText>
          {recording ? (
            <IconButton
              accessibilityLabel={`Stop dictating ${label}`}
              accessibilityHint={`${Math.floor(controller.state.elapsedMs / 1_000)} seconds recorded`}
              onPress={() => { void controller.stop(); }}
              style={styles.recordingAction}
              symbol={stopSymbol}
              tone="destructive"
            />
          ) : (
            <IconButton
              accessibilityLabel={`${status} ${label}`}
              disabled
              loading
              style={styles.processingAction}
              symbol={symbols.microphone}
            />
          )}
          <IconButton
            accessibilityLabel={`Cancel dictating ${label}`}
            accessibilityHint="Discards this dictation session"
            onPress={() => { void controller.cancel(); }}
            style={styles.cancelAction}
            symbol={cancelSymbol}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.statusIndicator}>
          {controller.state.phase === "recording" ? (
            <View style={styles.recordingDot} />
          ) : (
            <ActivityIndicator color={colors.primary} size="small" />
          )}
        </View>
        <AppText accessibilityLiveRegion="polite" emphasis="semibold" role="footnote" style={styles.status}>
          {status}
        </AppText>
        {controller.state.phase === "recording" ? (
          <AppText role="caption1" style={styles.elapsed} tone="secondary">
            {Math.floor(controller.state.elapsedMs / 1_000)}s
          </AppText>
        ) : null}
      </View>
      <View style={styles.actions}>
        {controller.state.phase === "recording" ? (
          <Button
            accessibilityLabel={`Stop dictating ${label}`}
            onPress={() => { void controller.stop(); }}
            style={styles.action}
            variant="danger"
          >
            Stop
          </Button>
        ) : null}
        <Button
          accessibilityLabel={`Cancel dictating ${label}`}
          onPress={() => { void controller.cancel(); }}
          style={styles.action}
          variant="secondary"
        >
          Cancel
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: spacing.sm },
  containerCompact: { width: "auto", minWidth: controlSize.minimumTouchTarget, alignItems: "flex-end" },
  statusRow: { minHeight: 24, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusIndicator: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  recordingDot: { width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.danger },
  status: { flex: 1, minWidth: 0 },
  elapsed: { fontVariant: ["tabular-nums"] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: { minWidth: 104, minHeight: controlSize.minimumTouchTarget, paddingHorizontal: spacing.md },
  compactSession: { minHeight: controlSize.minimumTouchTarget, flexDirection: "row", alignItems: "center", gap: spacing.xxs, borderRadius: radius.pill, borderCurve: "continuous", backgroundColor: colors.fill, paddingLeft: spacing.sm },
  compactSessionRecording: { backgroundColor: colors.dangerSoft },
  compactStatus: { maxWidth: 72, fontVariant: ["tabular-nums"] },
  recordingAction: { backgroundColor: "transparent" },
  processingAction: { backgroundColor: "transparent" },
  cancelAction: { backgroundColor: "transparent" },
  dictationIcon: { backgroundColor: colors.primarySoft },
  settingsAction: { alignSelf: "flex-start", paddingHorizontal: spacing.md },
  feedback: { maxWidth: 420 },
});
