import { useEffect, useRef, useState } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { Event } from "@context/shared";
import {
  AppText,
  BarButton,
  ErrorBanner,
  FormField,
  ListRow,
  ListSection,
  Screen,
  TextField,
  symbols,
} from "@/components/ui";
import { colors, radius, spacing } from "@/constants/theme";
import { mutationErrorMessage } from "@/lib/mutation-error";

export interface EventEditorValues {
  name: string;
  startsAt: string;
  endsAt?: string;
  locationLabel?: string;
}

function defaultStart(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString();
}

function defaultEnd(startsAt: string): string {
  const start = new Date(startsAt);
  return new Date(start.getTime() + 2 * 60 * 60 * 1_000).toISOString();
}

export function EventEditorSheet({
  active,
  event,
  onActivationChange,
  onCancel,
  onDelete,
  onSave,
  visible,
}: {
  active: boolean;
  event?: Event;
  onActivationChange?: (active: boolean) => Promise<void> | void;
  onCancel: () => void;
  onDelete?: () => Promise<void> | void;
  onSave: (values: EventEditorValues) => Promise<void> | void;
  visible: boolean;
}) {
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(() => defaultEnd(defaultStart()));
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string>();
  const [saveBusy, setSaveBusy] = useState(false);
  const [optionBusy, setOptionBusy] = useState(false);
  const saveInFlight = useRef(false);
  const busy = saveBusy || optionBusy;

  useEffect(() => {
    if (!visible) return;
    setName(event?.name ?? "");
    const nextStartsAt = event?.startsAt ?? defaultStart();
    setStartsAt(nextStartsAt);
    setEndsAt(event?.endsAt ?? defaultEnd(nextStartsAt));
    setLocation(event?.locationLabel ?? "");
    setError(undefined);
    setSaveBusy(false);
    setOptionBusy(false);
  }, [event?.id, visible]);

  const dismiss = () => {
    if (!busy) onCancel();
  };

  const save = async () => {
    if (saveInFlight.current) return;
    const cleanName = name.trim();
    const parsedDate = new Date(startsAt);
    if (!cleanName) {
      setError("Enter an event name.");
      return;
    }
    if (Number.isNaN(parsedDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    const parsedEndDate = new Date(endsAt);
    if (Number.isNaN(parsedEndDate.getTime()) || parsedEndDate <= parsedDate) {
      setError("Choose an end time after the event starts.");
      return;
    }
    saveInFlight.current = true;
    setSaveBusy(true);
    setError(undefined);
    try {
      await onSave({
        name: cleanName,
        startsAt: parsedDate.toISOString(),
        endsAt: parsedEndDate.toISOString(),
        ...(location.trim() ? { locationLabel: location.trim() } : {}),
      });
    } catch (caught) {
      setError(mutationErrorMessage(
        caught,
        "Context could not save this event. Your edits are still here; try again.",
      ));
    } finally {
      saveInFlight.current = false;
      setSaveBusy(false);
    }
  };

  const changeActivation = async () => {
    if (!onActivationChange || busy) return;
    setOptionBusy(true);
    setError(undefined);
    try {
      await onActivationChange(!active);
    } catch {
      setError("Context could not update Today. This event is still saved; try again.");
    } finally {
      setOptionBusy(false);
    }
  };

  const deleteEvent = async () => {
    if (!onDelete || busy) return;
    setOptionBusy(true);
    setError(undefined);
    try {
      await onDelete();
    } catch {
      setError("Context could not delete this event. Nothing was changed; try again.");
    } finally {
      setOptionBusy(false);
    }
  };

  return (
    <Modal
      allowSwipeDismissal={!busy}
      animationType="slide"
      onRequestClose={dismiss}
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      visible={visible}
    >
      <Screen
        accessibilityViewIsModal
        contentContainerStyle={styles.sheet}
        onAccessibilityEscape={dismiss}
        pointerEvents={busy ? "none" : "auto"}
        safeEdges={["top", "right", "bottom", "left"]}
      >
        <View style={styles.sheetBar}>
          <BarButton disabled={busy} onPress={dismiss}>Cancel</BarButton>
          <AppText accessibilityRole="header" emphasis="semibold" role="headline" style={styles.sheetTitle}>
            {event ? "Edit Event" : "New Event"}
          </AppText>
          <BarButton disabled={!name.trim() || busy} loading={saveBusy} onPress={() => { void save(); }}>{event ? "Save" : "Add"}</BarButton>
        </View>

        <ErrorBanner message={error} />

        <View style={styles.form}>
          <FormField
            autoCapitalize="words"
            autoFocus
            label="Event name"
            maxLength={160}
            onChangeText={setName}
            placeholder="Applied AI Summit"
            returnKeyType="next"
            value={name}
          />

          <View style={styles.field}>
            <AppText emphasis="semibold" role="footnote" tone="secondary">Date and time</AppText>
            {Platform.OS === "ios" ? (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  accessibilityLabel="Event date and time"
                  display="compact"
                  minuteInterval={5}
                  mode="datetime"
                  onValueChange={(_changeEvent, value) => {
                    const nextStartsAt = value.toISOString();
                    setStartsAt(nextStartsAt);
                    if (new Date(endsAt) <= value) setEndsAt(defaultEnd(nextStartsAt));
                  }}
                  value={Number.isNaN(new Date(startsAt).getTime()) ? new Date() : new Date(startsAt)}
                />
              </View>
            ) : (
              <TextField
                accessibilityLabel="Event date and time"
                autoCapitalize="none"
                onChangeText={setStartsAt}
                placeholder="2026-07-10T18:30"
                value={startsAt}
              />
              )}
          </View>

          <View style={styles.field}>
            <AppText emphasis="semibold" role="footnote" tone="secondary">End date and time</AppText>
            {Platform.OS === "ios" ? (
              <View style={styles.pickerRow}>
                <DateTimePicker
                  accessibilityLabel="Event end date and time"
                  display="compact"
                  minuteInterval={5}
                  mode="datetime"
                  onValueChange={(_changeEvent, value) => setEndsAt(value.toISOString())}
                  value={Number.isNaN(new Date(endsAt).getTime()) ? new Date() : new Date(endsAt)}
                />
              </View>
            ) : (
              <TextField
                accessibilityLabel="Event end date and time"
                autoCapitalize="none"
                onChangeText={setEndsAt}
                placeholder="2026-07-10T20:30"
                value={endsAt}
              />
            )}
          </View>

          <FormField
            autoCapitalize="words"
            label="Location"
            maxLength={160}
            onChangeText={setLocation}
            placeholder="Convention Hall A"
            returnKeyType="done"
            value={location}
          />
        </View>

        {event && onActivationChange ? (
          <ListSection title="Event options">
            <ListRow
              disabled={busy}
              last={!onDelete}
              onPress={() => { void changeActivation(); }}
              subtitle={active
                ? "Keep the event saved and return Today to your everyday people"
                : "Put this event and its people on Today"}
              symbol={symbols.checkCircle}
              title={active ? "Remove from Today" : "Show on Today"}
            />
            {onDelete ? (
              <ListRow destructive disabled={busy} last onPress={() => { void deleteEvent(); }} symbol={symbols.trash} title="Delete Event" />
            ) : null}
          </ListSection>
        ) : event && onDelete ? (
          <ListSection title="Event options">
            <ListRow destructive disabled={busy} last onPress={() => { void deleteEvent(); }} symbol={symbols.trash} title="Delete Event" />
          </ListSection>
        ) : (
          <AppText role="footnote" tone="secondary">New events appear on Today automatically.</AppText>
        )}
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  sheetBar: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { flex: 1, minWidth: 0, textAlign: "center" },
  form: { gap: spacing.lg },
  field: { gap: spacing.xs },
  pickerRow: {
    minHeight: 52,
    alignItems: "flex-start",
    justifyContent: "center",
    borderRadius: radius.md,
    borderCurve: "continuous",
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
});
