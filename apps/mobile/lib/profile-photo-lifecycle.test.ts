import { describe, expect, it } from "vitest";
import {
  abandonProfilePhotoUris,
  createProfilePhotoDraft,
  forgetCleanedProfilePhotoUris,
  profilePhotoCommitPlan,
  removeProfilePhoto,
  replacementCleanupUris,
  stageProfilePhoto,
  visibleProfilePhotoUri,
} from "./profile-photo-lifecycle";

describe("profile photo draft ownership", () => {
  it("keeps a committed photo untouched until a staged replacement commits", () => {
    const original = "file:///ContextProfilePhotos/original.jpg";
    const staged = stageProfilePhoto(createProfilePhotoDraft(original), "file:///ContextProfilePhotos/new.jpg");

    expect(visibleProfilePhotoUri(staged)).toContain("new.jpg");
    expect(abandonProfilePhotoUris(staged)).toEqual(["file:///ContextProfilePhotos/new.jpg"]);
    expect(profilePhotoCommitPlan(staged)).toEqual({
      desiredUri: "file:///ContextProfilePhotos/new.jpg",
      promotedUri: "file:///ContextProfilePhotos/new.jpg",
      cleanupUris: [original],
    });
  });

  it("retains replaced staged files as owned until cleanup succeeds", () => {
    const first = stageProfilePhoto(createProfilePhotoDraft(), "file:///ContextProfilePhotos/first.jpg");
    const second = stageProfilePhoto(first, "file:///ContextProfilePhotos/second.jpg");

    expect(replacementCleanupUris(second)).toEqual(["file:///ContextProfilePhotos/first.jpg"]);
    expect(abandonProfilePhotoUris(second)).toHaveLength(2);
    expect(forgetCleanedProfilePhotoUris(second, replacementCleanupUris(second)).ownedStagedUris)
      .toEqual(["file:///ContextProfilePhotos/second.jpg"]);
  });

  it("models removal without deleting the committed photo before save", () => {
    const original = "file:///ContextProfilePhotos/original.jpg";
    const removed = removeProfilePhoto(createProfilePhotoDraft(original));

    expect(visibleProfilePhotoUri(removed)).toBeUndefined();
    expect(abandonProfilePhotoUris(removed)).toEqual([]);
    expect(profilePhotoCommitPlan(removed)).toEqual({ desiredUri: undefined, promotedUri: undefined, cleanupUris: [original] });
  });
});
