export const isLegacyGhanaLocalityForeignKeyError = (error: unknown) => {
  const candidate = error as {
    code?: string | null;
    message?: string | null;
    details?: string | null;
  } | null;
  const context = `${candidate?.message ?? ''} ${candidate?.details ?? ''}`.toLowerCase();

  return (
    candidate?.code === '23503' &&
    (context.includes('profiles_locality_geoname_id_fkey') || context.includes('ghana_localities'))
  );
};
