export type MomentAtmosphere = {
  accentColor: string;
  glowOpacity: number;
  backgroundOverlay: [string, string];
  microAnimationType: "wave" | "drift" | "pulse" | "calm";
};

const normalize = (value?: string | null) => String(value || "").trim().toLowerCase();

export function getMomentAtmosphere(momentType?: string | null): MomentAtmosphere {
  const type = normalize(momentType);

  if (/(music|song|playlist|dance|concert|sound)/.test(type)) {
    return {
      accentColor: "#45D8D0",
      glowOpacity: 0.2,
      backgroundOverlay: ["rgba(69,216,208,0.16)", "rgba(69,216,208,0)"],
      microAnimationType: "wave",
    };
  }

  if (/(travel|trip|beach|flight|city|ghana|accra)/.test(type)) {
    return {
      accentColor: "#D8B4FE",
      glowOpacity: 0.16,
      backgroundOverlay: ["rgba(216,180,254,0.15)", "rgba(216,180,254,0)"],
      microAnimationType: "drift",
    };
  }

  if (/(food|cook|dinner|brunch|coffee)/.test(type)) {
    return {
      accentColor: "#F6C177",
      glowOpacity: 0.18,
      backgroundOverlay: ["rgba(246,193,119,0.16)", "rgba(246,193,119,0)"],
      microAnimationType: "calm",
    };
  }

  if (/(gym|run|active|workout|sport|fitness)/.test(type)) {
    return {
      accentColor: "#6EE7B7",
      glowOpacity: 0.18,
      backgroundOverlay: ["rgba(110,231,183,0.15)", "rgba(110,231,183,0)"],
      microAnimationType: "pulse",
    };
  }

  if (/(verified|trust|phone|id)/.test(type)) {
    return {
      accentColor: "#2EC4B6",
      glowOpacity: 0.14,
      backgroundOverlay: ["rgba(46,196,182,0.13)", "rgba(46,196,182,0)"],
      microAnimationType: "calm",
    };
  }

  return {
    accentColor: "#2EC4B6",
    glowOpacity: 0.12,
    backgroundOverlay: ["rgba(46,196,182,0.10)", "rgba(46,196,182,0)"],
    microAnimationType: "calm",
  };
}

