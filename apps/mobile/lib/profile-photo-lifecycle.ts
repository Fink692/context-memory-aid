export type ProfilePhotoSelection =
  | { kind: "committed" }
  | { kind: "removed" }
  | { kind: "staged"; uri: string };

export interface ProfilePhotoDraft {
  committedUri?: string;
  selection: ProfilePhotoSelection;
  ownedStagedUris: string[];
}

function uniqueUris(uris: readonly (string | undefined)[]): string[] {
  return [...new Set(uris.filter((uri): uri is string => Boolean(uri)))];
}

export function createProfilePhotoDraft(committedUri?: string): ProfilePhotoDraft {
  return {
    ...(committedUri ? { committedUri } : {}),
    selection: { kind: "committed" },
    ownedStagedUris: [],
  };
}

export function visibleProfilePhotoUri(draft: ProfilePhotoDraft): string | undefined {
  if (draft.selection.kind === "staged") return draft.selection.uri;
  if (draft.selection.kind === "removed") return undefined;
  return draft.committedUri;
}

export function stageProfilePhoto(draft: ProfilePhotoDraft, uri: string): ProfilePhotoDraft {
  return {
    ...draft,
    selection: { kind: "staged", uri },
    ownedStagedUris: uniqueUris([...draft.ownedStagedUris, uri]),
  };
}

export function removeProfilePhoto(draft: ProfilePhotoDraft): ProfilePhotoDraft {
  return { ...draft, selection: { kind: "removed" } };
}

export function replacementCleanupUris(draft: ProfilePhotoDraft): string[] {
  const selected = draft.selection.kind === "staged" ? draft.selection.uri : undefined;
  return draft.ownedStagedUris.filter((uri) => uri !== selected);
}

export function abandonProfilePhotoUris(draft: ProfilePhotoDraft): string[] {
  return uniqueUris(draft.ownedStagedUris);
}

export function forgetCleanedProfilePhotoUris(
  draft: ProfilePhotoDraft,
  cleanedUris: readonly string[],
): ProfilePhotoDraft {
  const cleaned = new Set(cleanedUris);
  return {
    ...draft,
    ownedStagedUris: draft.ownedStagedUris.filter((uri) => !cleaned.has(uri)),
  };
}

export interface ProfilePhotoCommitPlan {
  desiredUri?: string;
  promotedUri?: string;
  cleanupUris: string[];
}

export function profilePhotoCommitPlan(draft: ProfilePhotoDraft): ProfilePhotoCommitPlan {
  const desiredUri = visibleProfilePhotoUri(draft);
  const promotedUri = draft.selection.kind === "staged" ? draft.selection.uri : undefined;
  return {
    ...(desiredUri ? { desiredUri } : {}),
    ...(promotedUri ? { promotedUri } : {}),
    cleanupUris: uniqueUris([
      ...draft.ownedStagedUris.filter((uri) => uri !== promotedUri),
      desiredUri !== draft.committedUri ? draft.committedUri : undefined,
    ]),
  };
}
