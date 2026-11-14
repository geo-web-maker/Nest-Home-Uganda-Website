/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import type { ReactNode } from 'react';

/** Words for the bar. The app supplies them (shared code never uses an app's translation function). */
export type MessageActionLabels = {
  actions: string; back: string; reply: string; replyAll: string; forward: string;
  star: string; unstar: string; trash: string; restore: string; editDraft: string;
};

export type MessageActionBarProps = {
  labels: MessageActionLabels;
  /** A draft shows one primary action (edit) instead of Reply, Reply all and Forward. */
  isDraft?: boolean;
  starred: boolean;
  /** In Trash or Spam the trash button restores the message instead. */
  restorable: boolean;
  /** Turns every action off, for example when a phone is offline. Back always works. */
  disabled?: boolean;
  onBack: () => void;
  onEditDraft?: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onStar: () => void;
  onTrash: () => void;
  onRestore: () => void;
  /** Receives the empty slot at the end of the bar where the message's More menu is drawn (pass it to MailMessageView `moreSlot`). */
  onMoreSlot?: (element: HTMLElement | null) => void;
};

const svg = (children: ReactNode, filled = false) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{children}</svg>
);
const STAR = <path d="m12 3.5 2.7 5.5 6 .9-4.4 4.2 1 6L12 17.3 6.7 20.1l1-6L3.3 9.9l6-.9z" />;
const ICON = {
  back: svg(<path d="M15 5l-7 7 7 7" />),
  reply: svg(<><path d="M9 7 4 12l5 5" /><path d="M4 12h9a7 7 0 0 1 7 7" /></>),
  replyAll: svg(<><path d="M7 7 2 12l5 5" /><path d="M12 7 7 12l5 5" /><path d="M7 12h6a7 7 0 0 1 7 7" /></>),
  forward: svg(<><path d="m15 7 5 5-5 5" /><path d="M20 12h-9a7 7 0 0 0-7 7" /></>),
  star: svg(STAR),
  starOn: svg(STAR, true),
  trash: svg(<><path d="M4 7h16" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></>),
  restore: svg(<><path d="M4 13v6h16v-6" /><path d="M12 4v10" /><path d="m8 10 4 4 4-4" /></>),
};

/**
 * The one action bar for an open message, used by both the admin Mail page and the nurse app so they match.
 * One row on every screen size: back (phones), the replies, then Star and Trash. Less common actions
 * (forward as attachment, mark unread, report spam, view options) sit in the More menu at the end of this same row.
 * Labels show on wide screens and collapse to icons on narrow ones; every control keeps its accessible name.
 */
export function MessageActionBar(props: MessageActionBarProps) {
  const { labels, disabled } = props;
  return (
    <div className="mr-bar" role="toolbar" aria-label={labels.actions}>
      <button type="button" className="mr-bar-icon mr-bar-back" aria-label={labels.back} title={labels.back} onClick={props.onBack}>{ICON.back}</button>
      {props.isDraft ? (
        <button type="button" className="mr-bar-primary" disabled={disabled} onClick={props.onEditDraft}>{labels.editDraft}</button>
      ) : (
        <>
          <button type="button" className="mr-bar-primary" disabled={disabled} onClick={props.onReply}>{ICON.reply}<span>{labels.reply}</span></button>
          <button type="button" className="mr-bar-text" disabled={disabled} aria-label={labels.replyAll} title={labels.replyAll} onClick={props.onReplyAll}>{ICON.replyAll}<span className="mr-bar-label">{labels.replyAll}</span></button>
          <button type="button" className="mr-bar-text" disabled={disabled} aria-label={labels.forward} title={labels.forward} onClick={props.onForward}>{ICON.forward}<span className="mr-bar-label">{labels.forward}</span></button>
        </>
      )}
      <span className="mr-bar-spacer" />
      <button type="button" className="mr-bar-icon" disabled={disabled} aria-label={props.starred ? labels.unstar : labels.star} title={props.starred ? labels.unstar : labels.star} aria-pressed={props.starred} onClick={props.onStar}>{props.starred ? ICON.starOn : ICON.star}</button>
      {props.restorable
        ? <button type="button" className="mr-bar-icon" disabled={disabled} aria-label={labels.restore} title={labels.restore} onClick={props.onRestore}>{ICON.restore}</button>
        : <button type="button" className="mr-bar-icon" disabled={disabled} aria-label={labels.trash} title={labels.trash} onClick={props.onTrash}>{ICON.trash}</button>}
      <div className="mr-bar-more" ref={props.onMoreSlot} />
    </div>
  );
}
