export const normalizeOtherText = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

export const resolveOtherValue = (
  selectedValue: string | null | undefined,
  customValue: string | null | undefined,
) => {
  const normalizedSelected = normalizeOtherText(selectedValue);
  if (normalizedSelected !== "Other") return normalizedSelected;
  return normalizeOtherText(customValue);
};

export const replaceOtherInList = (
  values: string[],
  customValue: string | null | undefined,
) => {
  const normalizedCustom = normalizeOtherText(customValue);

  return Array.from(
    new Set(
      values
        .map((value) => normalizeOtherText(value))
        .flatMap((value) => {
          if (!value) return [];
          if (value !== "Other") return [value];
          return normalizedCustom ? [normalizedCustom] : [];
        }),
    ),
  );
};
