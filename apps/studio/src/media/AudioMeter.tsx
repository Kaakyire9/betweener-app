export function AudioMeter({ level, label }: { level: number; label: string }) {
  const clipped = level > 0.94;
  return (
    <div className="audio-meter" aria-label={`${label} level ${Math.round(level * 100)} percent`}>
      <span style={{ width: `${Math.round(level * 100)}%` }} className={clipped ? 'clipping' : ''} />
    </div>
  );
}
