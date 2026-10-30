import { PillButton } from '../ui/PillButton';
import { useEffect, useState } from 'react';
import { copy } from '../copy';
import {
  detectInstallGuidance,
  hasSeenInstallHint,
  persistInstallHintSeen,
  type InstallGuidanceKind,
} from './installGuidance';

type BeforeInstallPromptChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<BeforeInstallPromptChoice>;
};

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function runtimeInstallKind(): InstallGuidanceKind {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } };
  const displayModeStandalone =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;

  // userAgentData is an additional guard where Chromium exposes it; the UA and
  // platform checks remain the cross-browser fallback (notably for Safari).
  if (nav.userAgentData?.mobile && !/iphone/i.test(nav.userAgent)) return null;
  return detectInstallGuidance({
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: Boolean(nav.standalone),
    displayModeStandalone,
  });
}

export function InstallHint() {
  const [kind, setKind] = useState<InstallGuidanceKind>(null);
  const [alreadyShown] = useState(() => hasSeenInstallHint(safeLocalStorage()));
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);

  useEffect(() => {
    const refreshEnvironment = () => {
      const nextKind = runtimeInstallKind();
      setKind(nextKind);
      if (isStandaloneMode()) setInstalled(true);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      // Only defer the native prompt while this first-time Chromium guide is
      // available. Once it has been shown, leave later browser prompts alone.
      if (alreadyShown || dismissed || runtimeInstallKind() !== 'desktop-chromium') return;
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    refreshEnvironment();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    const displayMode = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
    displayMode?.addEventListener?.('change', refreshEnvironment);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      displayMode?.removeEventListener?.('change', refreshEnvironment);
    };
  }, [alreadyShown, dismissed]);

  useEffect(() => {
    if (kind && !alreadyShown) persistInstallHintSeen(safeLocalStorage());
  }, [alreadyShown, kind]);

  const dismiss = () => {
    persistInstallHintSeen(safeLocalStorage());
    setDismissed(true);
  };

  const install = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch {
      // If the native prompt is unavailable, the browser-specific manual steps
      // remain visible in the hint instead of failing the nurse workflow.
    }
  };

  if (!kind || alreadyShown || dismissed || installed) return null;

  const guidance = copy.shell.installGuidance[kind];
  const steps = kind === 'iphone'
    ? [
        { title: 'Tap Share', detail: copy.profile.installStepOne },
        { title: 'Choose Add to Home Screen', detail: copy.profile.installStepTwo },
        { title: 'Tap Add', detail: copy.profile.installStepThree },
      ]
    : guidance.steps;
  return (
    <aside className="mk-install-hint" aria-label={copy.shell.installHintLabel}>
      <div className="mk-install-hint__icon" aria-hidden="true">＋</div>
      <div className="mk-install-hint__content">
        <strong>{guidance.title}</strong>
        <p>{guidance.intro}</p>
        <ol className="mk-install-steps">
          {steps.map((step, index) => (
            <li key={`${kind}-${index}`}>
              <span className="mk-install-step-number" aria-hidden="true">{index + 1}</span>
              <span className="mk-install-step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
            </li>
          ))}
        </ol>
        {kind === 'desktop-chromium' && installPrompt && (
          <PillButton className="mk-install-hint__install" type="button" tone="gold" size="sm" showArrow={false} onClick={() => void install()}>
            {copy.shell.installApp}
          </PillButton>
        )}
        <PillButton className="mk-install-hint__got-it" type="button" tone="forest" size="sm" showArrow={false} onClick={dismiss}>
          {copy.profile.installGotIt}
        </PillButton>
      </div>
      <button
        className="mk-install-hint__dismiss"
        type="button"
        aria-label={copy.shell.dismissInstallHint}
        onClick={dismiss}
      >
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}

function isStandaloneMode(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || (
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  );
}
