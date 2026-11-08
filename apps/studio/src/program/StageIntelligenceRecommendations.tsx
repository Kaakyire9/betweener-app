import type {
  StageIntelligenceResultV1,
  StageRecommendationV1,
} from '@betweener/live-program-domain';

const confidenceLabel = (confidence: StageRecommendationV1['confidenceBand']) =>
  confidence === 'STRONG' ? 'Best fit' : confidence === 'GOOD' ? 'Good alternative' : 'Possible fit';

function RecommendationCard({ recommendation, onPreview }: {
  recommendation: StageRecommendationV1;
  onPreview: (recommendation: StageRecommendationV1) => void;
}) {
  const hold = recommendation.kind === 'hold';
  return <article className={`stage-recommendation-card ${hold ? 'is-hold' : ''}`}
    data-testid={`stage-recommendation-${recommendation.rank}`}
    data-strategy={recommendation.strategyId}>
    <div className="stage-recommendation-meta">
      <span>{confidenceLabel(recommendation.confidenceBand)}</span>
      <span>{recommendation.factChip}</span>
    </div>
    <strong>{recommendation.title}</strong>
    <p>{recommendation.shortReason}</p>
    {hold ? <span className="stage-current-chip">ON AIR</span>
      : <button className="button button-secondary stage-preview-action"
        onClick={() => onPreview(recommendation)}>Preview</button>}
  </article>;
}

export function StageIntelligenceRecommendations({ result, onPreview }: {
  result: StageIntelligenceResultV1;
  onPreview: (recommendation: StageRecommendationV1) => void;
}) {
  return <section className="stage-intelligence" data-testid="stage-intelligence-v1">
    <div className="scene-group-heading stage-intelligence-heading">
      <div><strong>Recommended now</strong><small>Contextual editorial choices</small></div>
      <span>{result.recommendations.length}</span>
    </div>
    {result.recommendations.length ? <div className="stage-recommendation-grid">
      {result.recommendations.map((recommendation) => <RecommendationCard
        key={`${recommendation.kind}:${recommendation.strategyId}`}
        recommendation={recommendation} onPreview={onPreview} />)}
    </div> : <div className="stage-no-recommendation" role="status">
      <strong>No strong recommendation for the current stage.</strong>
      <small>Use the full Scene Library below or choose the safe fallback.</small>
    </div>}
    {result.safetyFallback ? <div className="stage-safety-fallback">
      <div><span>Safe fallback</span><strong>{result.safetyFallback.title}</strong>
        <small>{result.safetyFallback.shortReason}</small></div>
      <button className="text-button" onClick={() => onPreview(result.safetyFallback as StageRecommendationV1)}>
        Preview
      </button>
    </div> : null}
  </section>;
}
