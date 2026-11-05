import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

export type MailLabels = {
  attachments: string;
  download: string;
  blockedAttachment: string;
  attachmentUnavailable: string;
  remoteImagesBlocked: string;
  showImages: string;
  originalMessage: string;
  downloadOriginal: string;
  formatted: string;
  plainText: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  signedMessage: string;
  renderingNotice: string;
  scanning: string;
  scannedClean: string;
  notScanned: string;
  delivery: string;
  delivered: string;
  bounced: string;
  deferred: string;
  sent: string;
  failed: string;
  messageFormatting: string;
  bold: string;
  italic: string;
  underline: string;
  strikethrough: string;
  bulletedList: string;
  numberedList: string;
  blockQuote: string;
  insertEditLink: string;
  insertTable: string;
  insertHorizontalRule: string;
  clearFormatting: string;
  addTableRow: string;
  addTableColumn: string;
  deleteTable: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  increaseIndent: string;
  decreaseIndent: string;
  undo: string;
  redo: string;
  paragraphStyle: string;
  paragraph: string;
  heading1: string;
  heading2: string;
  heading3: string;
  heading4: string;
  fontSize: string;
  textColour: string;
  highlight: string;
  insertLinkTitle: string;
  webAddress: string;
  allowedLinkHint: string;
  applyLink: string;
  removeLink: string;
  cancel: string;
  tableTitle: string;
  rows: string;
  columns: string;
  removeQuoteTitle: string;
  removeQuoteHint: string;
  keepQuote: string;
  removeQuote: string;
  showQuotedMessage: string;
  hideQuotedMessage: string;
};

export type MailUiKit = {
  Button: ComponentType<{
    children: ReactNode;
    onClick?: () => void;
    variant?: 'primary' | 'quiet';
    disabled?: boolean;
    busy?: boolean;
    ariaLabel?: string;
    type?: 'button' | 'submit';
  }>;
  ToolbarButton: ComponentType<{
    label: string;
    pressed?: boolean;
    disabled?: boolean;
    tabIndex?: number;
    onFocus?: () => void;
    onClick: () => void;
    children: ReactNode;
  }>;
  Select: ComponentType<{
    label: string;
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    compact?: boolean;
  }>;
  TextField: ComponentType<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    autoFocus?: boolean;
    inputMode?: 'url' | 'text';
    type?: 'text' | 'url';
  }>;
  ColorField: ComponentType<{
    label: string;
    value: string;
    onChange: (value: string) => void;
  }>;
  Dialog: ComponentType<{
    id: string;
    title: string;
    closeLabel: string;
    onClose: () => void;
    children: ReactNode;
    actions?: ReactNode;
    urgent?: boolean;
    className?: string;
  }>;
  Notice: ComponentType<{
    tone: 'info' | 'success' | 'warning' | 'error';
    children: ReactNode;
  }>;
};

const MailUiContext = createContext<{ kit: MailUiKit; labels: MailLabels } | null>(null);

export function MailUiKitProvider({
  kit,
  labels,
  children,
}: {
  kit: MailUiKit;
  labels: MailLabels;
  children: ReactNode;
}) {
  return <MailUiContext.Provider value={{ kit, labels }}>{children}</MailUiContext.Provider>;
}

export function useMailUi(): { kit: MailUiKit; labels: MailLabels } {
  const value = useContext(MailUiContext);
  if (!value) throw new Error('MailUiKitProvider is missing.');
  return value;
}
