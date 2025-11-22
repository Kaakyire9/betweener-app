Icon variants for `components/ExploreCard.tsx`

Below are 3 small code-diff style examples you can apply to change the interest-chip icons. Each block shows the `ICON_MAP` and a short note about imports (if needed).

---

1) Variant A — current family, slightly different glyphs (MaterialCommunityIcons)

Replace the `ICON_MAP` block in `ExploreCard.tsx` with:

```diff
@@
-              const ICON_MAP: Record<string, string> = {
-                Travel: 'airplane',
-                Music: 'music',
-                Business: 'briefcase',
-                Art: 'palette',
-                Fitness: 'dumbbell',
-              };
+              const ICON_MAP: Record<string, string> = {
+                Travel: 'airplane-takeoff',      // more dynamic travel glyph
+                Music: 'music-note',             // single-note glyph
+                Business: 'briefcase',
+                Art: 'brush',                    // brush instead of palette
+                Fitness: 'run',                  // active runner glyph
+              };
```

No import changes required — still uses `MaterialCommunityIcons`.

---

2) Variant B — MaterialCommunityIcons (compact / outline feel)

```diff
@@
-              const ICON_MAP: Record<string, string> = {
-                Travel: 'airplane',
-                Music: 'music',
-                Business: 'briefcase',
-                Art: 'palette',
-                Fitness: 'dumbbell',
-              };
+              const ICON_MAP: Record<string, string> = {
+                Travel: 'airplane-landing',     // landing/takeoff alternatives
+                Music: 'guitar-electric',       // more characterful icon
+                Business: 'office-building',    // business building symbol
+                Art: 'image',                   // image icon for visual art
+                Fitness: 'yoga',                // calm fitness option
+              };
```

Still `MaterialCommunityIcons` import. Use these if you want a more illustrative set.

---

3) Variant C — swap to `Ionicons` family (different visual style)

Notes: change import near the top of `ExploreCard.tsx`:

```diff
@@
-import { MaterialCommunityIcons } from "@expo/vector-icons";
+import { Ionicons } from "@expo/vector-icons";
```

Then replace `ICON_MAP` with Ionicons keys (example names shown):

```diff
@@
-              const ICON_MAP: Record<string, string> = {
-                Travel: 'airplane',
-                Music: 'music',
-                Business: 'briefcase',
-                Art: 'palette',
-                Fitness: 'dumbbell',
-              };
+              const ICON_MAP: Record<string, string> = {
+                Travel: 'airplane',            // Ionicons airplane
+                Music: 'musical-notes',        // group of notes
+                Business: 'business',          // simple business glyph
+                Art: 'color-palette',          // Ionicons palette
+                Fitness: 'barbell',            // gym barbell
+              };
```

And update the rendering site where `MaterialCommunityIcons` was used to render `Ionicons` icons instead:

```diff
-                          <MaterialCommunityIcons name={iconName as any} size={14} color="#fff" />
+                          <Ionicons name={iconName as any} size={14} color="#fff" />
```

Note: Exact Ionicons names can vary by version; if a name is missing, fallback to a text label will be used (the code already renders the interest text when no icon name exists).

---

Usage / verification

- After swapping glyphs, run type-check and start Metro:

```powershell
npx tsc --noEmit
npx expo start -c
```

- If you choose Variant C (`Ionicons`), ensure to update the import at the top of `ExploreCard.tsx` as shown.

If you want, I can apply any of these variants directly to `components/ExploreCard.tsx`. Tell me which variant (A, B, or C) you prefer and I'll patch the file and run a quick typecheck.