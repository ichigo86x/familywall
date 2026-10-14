import { useRef, useState, type CSSProperties } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface } from "@fluentui/react-components";
import { AVATAR_PHOTO_MAX_LENGTH, type User } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/** Google's animated Noto emoji (free licence); emoji without an animation fall back to the plain character. */
const animatedEmojiUrl = (emoji: string) =>
  `https://fonts.gstatic.com/s/e/notoemoji/latest/${[...emoji]
    .map((char) => char.codePointAt(0)!.toString(16))
    .filter((code) => code !== "fe0f")
    .join("_")}/512.webp`;

const AnimatedEmoji = ({ emoji }: { emoji: string }) => {
  // The plain emoji shows at once; the animation replaces it once downloaded (never, offline).
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  return (
    <>
      {state !== "loaded" ? <span className="member-picture__emoji">{emoji}</span> : null}
      {state !== "failed" ? (
        <img
          className={`member-picture__emoji-img ${state === "loaded" ? "" : "member-picture__emoji-img--hidden"}`.trim()}
          src={animatedEmojiUrl(emoji)}
          alt=""
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
        />
      ) : null}
    </>
  );
};

/** A member's picture: their photo, their emoji (animated when available) or their initials on their colour. */
export const MemberAvatar = ({ member, className = "" }: { member: Pick<User, "displayName" | "color" | "avatar">; className?: string }) => {
  const avatar = member.avatar;
  const kind = !avatar ? "initials" : avatar.startsWith("data:image/") ? "photo" : "emoji";
  return (
    <span className={`member-picture member-picture--${kind} ${className}`.trim()} style={{ "--member-color": member.color } as CSSProperties} aria-hidden="true">
      {kind === "photo" ? <img src={avatar!} alt="" /> : kind === "emoji" ? <AnimatedEmoji emoji={avatar!} /> : initials(member.displayName)}
    </span>
  );
};

const EMOJI = [
  "😀", "😎", "🤓", "🥳", "😇", "🤠", "👩", "👨", "👧", "👦", "👵", "👴",
  "🐶", "🐱", "🦊", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦄", "🐲", "🦖",
  "🐙", "🦋", "🐝", "🐢", "🐬", "🦉", "🐧", "🤖", "👻", "⚽", "🎸", "🚀",
  "🌈", "⭐", "🌻", "🍕", "🍦", "🎨"
];

const PHOTO_SIZE = 192;

/** Square crop of the middle of the photo, as a small JPEG data URL. */
const resizePhoto = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= AVATAR_PHOTO_MAX_LENGTH) {
      return url;
    }
  }
  throw new Error("La foto è troppo grande anche dopo averla ridotta.");
};

/** Choose an emoji or a photo for a member (their own, or anyone's for an Admin). */
export const AvatarDialog = ({ member, onClose, onSaved }: { member: User; onClose: () => void; onSaved: (member: User) => void }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async (avatar: string | null) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.setMemberAvatar(member.id, avatar));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Salvataggio non riuscito.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>Foto di {member.displayName}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <div className="avatar-dialog__preview">
              <MemberAvatar member={member} className="member-picture--large" />
              <span className="calendar-detail-hint">Le emoji si animano quando il pannello è collegato a internet.</span>
            </div>
            <div className="avatar-dialog__grid" role="group" aria-label="Emoji">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`avatar-dialog__emoji ${member.avatar === emoji ? "avatar-dialog__emoji--selected" : ""}`.trim()}
                  disabled={busy}
                  aria-label={`Usa ${emoji}`}
                  onClick={() => void save(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(change) => {
                const file = change.target.files?.[0];
                change.target.value = "";
                if (file) {
                  void resizePhoto(file)
                    .then(save)
                    .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Foto non leggibile."));
                }
              }}
            />
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {member.avatar ? (
              <Button appearance="secondary" disabled={busy} onClick={() => void save(null)}>
                Usa le iniziali
              </Button>
            ) : null}
            <Button appearance="primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              📷 Carica una foto
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
