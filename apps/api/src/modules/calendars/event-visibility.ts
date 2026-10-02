import type { FamilyEvent, User } from "@familywall/shared";

export const REDACTED_TITLE = "Occupato";

/**
 * Applies privacy rules for the viewer:
 * - "wall-hidden" events are not sent to Kiosk sessions at all;
 * - "private" events show full details only to Admin/Parent and to the members involved,
 *   everyone else (Kiosk included) sees a busy block.
 */
export const projectEventForViewer = (event: FamilyEvent, viewer: User): FamilyEvent | null => {
  if (event.privacy === "wall-hidden" && viewer.role === "Kiosk") {
    return null;
  }

  if (event.privacy === "private") {
    const canSeeDetails = viewer.role === "Admin" || viewer.role === "Parent" || event.memberIds.includes(viewer.id);
    if (!canSeeDetails) {
      return { ...event, title: REDACTED_TITLE, tagMemberId: null, redacted: true };
    }
  }

  return event;
};
