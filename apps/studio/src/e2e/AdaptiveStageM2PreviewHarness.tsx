import type { EditorialPeopleCanvasV2 } from '@betweener/live-program-domain';

import { AdaptiveStageM2ReviewBook } from '../program/AdaptiveStageM2Preview.tsx';

const supportedCanvas = (value: string | null): EditorialPeopleCanvasV2 =>
  value === 'landscape_16_9' ? value : 'portrait_9_16';

const supportedReview = (value: string | null): 'people' | 'screen' | 'moments' | 'states' =>
  value === 'screen' || value === 'moments' || value === 'states' ? value : 'people';

export function AdaptiveStageM2PreviewHarness() {
  const parameters = new URL(window.location.href).searchParams;
  return <AdaptiveStageM2ReviewBook
    canvas={supportedCanvas(parameters.get('canvas'))}
    review={supportedReview(parameters.get('review'))}
  />;
}
