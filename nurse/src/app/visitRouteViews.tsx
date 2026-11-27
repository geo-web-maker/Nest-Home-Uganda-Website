import type { CachedVisit } from '../offline/db';
import { copy } from '../copy';
import { ActiveVisit } from '../screens/ActiveVisit';
import { VisitDetail } from '../screens/VisitDetail';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';
import type { NurseRouteViews } from './routes';

type VisitRouteViewOptions = {
  selectedVisit: (visitId: string) => CachedVisit | undefined;
  photosEnabled: boolean;
  onArrive: (visit: CachedVisit) => void;
  onLeave: (visit: CachedVisit) => void;
  onNote: (visit: CachedVisit) => void;
  onPhoto: (visit: CachedVisit) => void;
  onSync: () => void;
};

/** Route-specific visit rendering is kept separate from the app's sync/session coordinator. */
export function createVisitRouteViews({
  selectedVisit,
  photosEnabled,
  onArrive,
  onLeave,
  onNote,
  onPhoto,
  onSync,
}: VisitRouteViewOptions): Pick<NurseRouteViews, 'visit' | 'activeVisit'> {
  const unavailable = (heading: string, message: string) => (
    <Card>
      <h2>{heading}</h2>
      <p>{message}</p>
      <PillButton type="button" tone="gold" onClick={onSync}>
        {copy.generic.syncSchedule}
      </PillButton>
    </Card>
  );

  return {
    visit: (visitId) => {
      const visit = selectedVisit(visitId);
      return visit ? (
        <VisitDetail
          visit={visit}
          photosEnabled={photosEnabled}
          onArrive={onArrive}
          onLeave={onLeave}
          onNote={onNote}
          onPhoto={onPhoto}
        />
      ) : (
        unavailable(copy.generic.visitUnavailable, copy.generic.visitUnavailableCopy)
      );
    },
    activeVisit: (visitId) => {
      const visit = selectedVisit(visitId);
      return visit && visit.status === 'in_progress' ? (
        <ActiveVisit
          visit={visit}
          onNote={onNote}
          onPhoto={onPhoto}
          onLeave={onLeave}
          photosEnabled={photosEnabled}
        />
      ) : (
        unavailable(copy.generic.activeVisitUnavailable, copy.generic.activeVisitUnavailableCopy)
      );
    },
  };
}
