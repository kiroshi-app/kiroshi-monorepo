(() => {
  // packages/ui/src/components/companion-field.ts
  var FNV_OFFSET = 2166136261;
  var FNV_PRIME = 16777619;
  var UINT32_RANGE = 4294967296;
  var FIELD_FLOOR = 0.3;
  var PULSE_WIDTH = 0.25;
  var REVEAL_SPAN = 0.6;
  var SWEEP_SPAN = 0.6;
  var RIPPLE_SPAN = 0.5;
  var TURN = Math.PI * 2;
  var companionSeed = (name) => {
    let hash = FNV_OFFSET;
    for (const character of name) {
      hash ^= character.codePointAt(0) ?? 0;
      hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
  };
  var seededRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
      state = state + 1831565813 >>> 0;
      let mixed = Math.imul(state ^ state >>> 15, state | 1);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
      return ((mixed ^ mixed >>> 14) >>> 0) / UINT32_RANGE;
    };
  };
  var pickSilhouette = (seed, { families, variants }) => {
    const random = seededRandom(seed);
    return {
      family: Math.floor(random() * families),
      variant: Math.floor(random() * variants)
    };
  };
  var silhouetteRandom = ({ family, variant }) => seededRandom(variant * 7919 + family * 104729 + 1);
  var fraction = (value) => value - Math.floor(value);
  var pulse = (cycle) => cycle < PULSE_WIDTH ? Math.sin(Math.PI * cycle / PULSE_WIDTH) : 0;
  var reveal = (cycle) => cycle < REVEAL_SPAN ? 1 : 0;
  var breath = (cycle) => 0.5 - 0.5 * Math.cos(TURN * cycle);
  var across = (value) => (value + 1) / 2;
  var STATE_MOTION = {
    thinking: {
      period: 1800,
      phase: ({ x, y }) => Math.hypot(x, y) / Math.SQRT2 * RIPPLE_SPAN,
      wave: pulse
    },
    searching: {
      period: 1400,
      phase: ({ x }) => across(x) * SWEEP_SPAN,
      wave: pulse
    },
    working: {
      period: 1000,
      phase: ({ x, y }) => fraction(Math.atan2(y, x) / TURN),
      wave: pulse
    },
    writing: {
      period: 2000,
      phase: ({ x, y }) => across(y) * SWEEP_SPAN + across(x) * 0.05,
      wave: reveal
    },
    waiting: {
      period: 3000,
      phase: () => 0.5,
      wave: breath
    }
  };
  var fieldIntensity = (state, point, time) => {
    if (state === "idle")
      return 1;
    const { period, phase, wave } = STATE_MOTION[state];
    const cycle = fraction(time / period - phase(point));
    return FIELD_FLOOR + (1 - FIELD_FLOOR) * wave(cycle);
  };

  // packages/ui/src/components/companion-silhouette.ts
  var COLUMNS = 5;
  var ROWS = 7;
  var FILL_CHANCE = 0.55;
  var MIN_CELLS = 12;
  var SPINE = (COLUMNS - 1) / 2;
  var SYMMETRIES = [
    (column, row) => [Math.min(column, COLUMNS - 1 - column), row],
    (column, row) => column === SPINE ? [-1, 0] : [Math.min(column, COLUMNS - 1 - column), row],
    (column, row) => [
      Math.min(column, COLUMNS - 1 - column),
      Math.min(row, ROWS - 1 - row)
    ],
    (column, row) => row * COLUMNS + column <= (ROWS * COLUMNS - 1) / 2 ? [column, row] : [COLUMNS - 1 - column, ROWS - 1 - row]
  ];
  var COMPANION_SILHOUETTE_SPACE = {
    families: SYMMETRIES.length,
    variants: 1024
  };
  var silhouetteCells = (silhouette) => {
    const symmetry = SYMMETRIES[silhouette.family];
    const random = silhouetteRandom(silhouette);
    const lit = new Map;
    const isLit = (column, row) => {
      const key = symmetry(column, row).join(",");
      if (!lit.has(key))
        lit.set(key, key === "-1,0" || random() < FILL_CHANCE);
      return lit.get(key) === true;
    };
    const isSparse = Array.from({ length: ROWS * COLUMNS }).filter((_, index) => isLit(index % COLUMNS, Math.floor(index / COLUMNS))).length < MIN_CELLS;
    const cells = [];
    for (let row = 0;row < ROWS; row++)
      for (let column = 0;column < COLUMNS; column++)
        if (isLit(column, row) || isSparse && column === SPINE)
          cells.push({
            column,
            row,
            x: column / (COLUMNS - 1) * 2 - 1,
            y: row / (ROWS - 1) * 2 - 1
          });
    return cells;
  };

  // packages/ui/src/components/kiroshi-hexagon.ts
  var OUTER = { halfWidth: 200.5, halfHeight: 181.5 };
  var COS_30 = Math.cos(Math.PI / 6);
  var TAN_30 = Math.tan(Math.PI / 6);
  var EDGE_NORMAL = { x: -COS_30, y: 0.5 };
  var CORNERS = 6;
  var TURN2 = Math.PI / 3;
  var hexagonMetrics = ({
    halfWidth,
    halfHeight
  }) => {
    const apothem = (halfWidth - halfHeight) / (1 / COS_30 - 1);
    return { apothem, rounding: halfHeight - apothem };
  };
  var hexagonDistance = (x, y, apothem) => {
    let px = Math.abs(x);
    let py = Math.abs(y);
    const fold = 2 * Math.min(EDGE_NORMAL.x * px + EDGE_NORMAL.y * py, 0);
    px -= fold * EDGE_NORMAL.x;
    py -= fold * EDGE_NORMAL.y;
    const reach = apothem * TAN_30;
    const dx = px - Math.min(Math.max(px, -reach), reach);
    const dy = py - apothem;
    return Math.hypot(dx, dy) * Math.sign(dy);
  };
  var isInsideRoundedHexagon = (shape, x, y) => {
    const { apothem, rounding } = hexagonMetrics(shape);
    return hexagonDistance(x, y, apothem) <= rounding;
  };
  var roundedHexagonPath = (shape) => {
    const { apothem, rounding } = hexagonMetrics(shape);
    const reach = apothem / COS_30;
    const centre = shape.halfWidth;
    const at = (angle, radius, from) => `${(from.x + radius * Math.cos(angle)).toFixed(2)} ${(from.y + radius * Math.sin(angle)).toFixed(2)}`;
    const corner = (index) => ({
      x: centre + reach * Math.cos(index * TURN2),
      y: centre + reach * Math.sin(index * TURN2)
    });
    const steps = Array.from({ length: CORNERS }, (_, index) => {
      const vertex = corner(index);
      const before = index * TURN2 - TURN2 / 2;
      const after = before + TURN2;
      return `${index === 0 ? "M" : "L"} ${at(before, rounding, vertex)} A ${rounding.toFixed(2)} ${rounding.toFixed(2)} 0 0 1 ${at(after, rounding, vertex)}`;
    });
    return `${steps.join(" ")} Z`;
  };

  // packages/ui/src/components/field-grid.ts
  var SQUARE_SPILLS = [
    { column: 1, row: 0, share: 7 / 16 },
    { column: -1, row: 1, share: 3 / 16 },
    { column: 0, row: 1, share: 5 / 16 },
    { column: 1, row: 1, share: 1 / 16 }
  ];
  var HONEYCOMB_SPILLS = [
    { column: -1, halfRow: 1, share: 3 / 8 },
    { column: 1, halfRow: 1, share: 3 / 8 },
    { column: 0, halfRow: 2, share: 1 / 4 }
  ];
  var SQRT_3 = Math.sqrt(3);
  var HEXAGON_CORNERS = 6;
  var TURN3 = Math.PI / 3;
  var OUTLINE_SIDE = OUTER.halfWidth * 2;
  var hexagonCorners = ({ u, v }, radius) => Array.from({ length: HEXAGON_CORNERS }, (_, corner) => ({
    u: u + radius * Math.cos(corner * TURN3),
    v: v + radius * Math.sin(corner * TURN3)
  }));
  var isInsideOutline = ({ u, v }) => isInsideRoundedHexagon(OUTER, (u - 0.5) * OUTLINE_SIDE, (v - 0.5) * OUTLINE_SIDE);
  var honeycombGrid = (columns, cellShare) => {
    const pitch = 1 / columns;
    const radius = pitch / 1.5;
    const halfRowPitch = SQRT_3 * radius / 2;
    const halfRows = Math.ceil(0.5 / halfRowPitch);
    const cells = [];
    for (let halfRow = -halfRows;halfRow <= halfRows; halfRow++)
      for (let column = 0;column < columns; column++) {
        if ((column + halfRow) % 2 !== 0)
          continue;
        const cell = {
          column,
          halfRow,
          u: 0.5 + (column - (columns - 1) / 2) * pitch,
          v: 0.5 + halfRow * halfRowPitch
        };
        if (hexagonCorners(cell, radius * cellShare).every(isInsideOutline))
          cells.push(cell);
      }
    const keyOf = (column, halfRow) => `${column} ${halfRow}`;
    const indexByKey = new Map(cells.map(({ column, halfRow }, index) => [keyOf(column, halfRow), index]));
    return {
      shape: "hexagon",
      cells: columns,
      radius,
      points: cells.map(({ u, v }) => ({ u, v })),
      ahead: cells.map(({ column, halfRow }) => HONEYCOMB_SPILLS.map((spill) => ({
        to: indexByKey.get(keyOf(column + spill.column, halfRow + spill.halfRow)) ?? -1,
        share: spill.share
      })).filter(({ to }) => to >= 0))
    };
  };

  // packages/ui/src/components/hue-recipe.ts
  var LIGHTNESS_STEP = 0.0025;
  var LIGHTNESS_RESOLUTION = 1e4;
  var CHROMA_SEARCH_STEPS = 24;
  var GAMUT_TOLERANCE = 0.000001;
  var normaliseHue = (hue) => (hue % 360 + 360) % 360;
  var hueDistance = (from, to) => Math.abs((from - to + 540) % 360 - 180);
  var linearSrgbOf = (lightness, chroma, hue) => {
    const radians = hue * Math.PI / 180;
    const a = chroma * Math.cos(radians);
    const b = chroma * Math.sin(radians);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
    ];
  };
  var isInSrgb = (lightness, chroma, hue) => linearSrgbOf(lightness, chroma, hue).every((channel) => channel >= -GAMUT_TOLERANCE && channel <= 1 + GAMUT_TOLERANCE);
  var gamutChroma = (lightness, chroma, hue) => {
    if (isInSrgb(lightness, chroma, hue))
      return chroma;
    let inside = 0;
    let outside = chroma;
    for (let step = 0;step < CHROMA_SEARCH_STEPS; step++) {
      const middle = (inside + outside) / 2;
      if (isInSrgb(lightness, middle, hue))
        inside = middle;
      else
        outside = middle;
    }
    return inside;
  };
  var gammaOf = (linear) => {
    const clamped = Math.min(1, Math.max(0, linear));
    return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  var hexOf = (lightness, chroma, hue) => `#${linearSrgbOf(lightness, chroma, hue).map((linear) => Math.round(gammaOf(linear) * 255).toString(16).padStart(2, "0")).join("")}`;
  var linearOfByte = (byte) => {
    const encoded = byte / 255;
    return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
  };
  var relativeLuminance = (hex) => {
    const [red, green, blue] = [1, 3, 5].map((offset) => linearOfByte(Number.parseInt(hex.slice(offset, offset + 2), 16)));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  var contrastRatio = (first, second) => {
    const [lighter, darker] = [
      relativeLuminance(first),
      relativeLuminance(second)
    ].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };
  var yellowWeight = (hue, { centre, radius }) => {
    const distance = hueDistance(hue, centre);
    return distance < radius ? Math.cos(Math.PI / 2 * distance / radius) ** 2 : 0;
  };
  var correctedTone = (spec, hue, band) => {
    const { lightness, chroma, yellow } = spec;
    if (!yellow)
      return { lightness, chroma, hue };
    const weight = yellowWeight(hue, band);
    const blend = (from, to) => from + (to - from) * weight;
    return {
      lightness: blend(lightness, yellow.lightness),
      chroma: blend(chroma, yellow.chroma),
      hue: normaliseHue(blend(hue, hue + yellow.hue - band.centre))
    };
  };
  var roundLightness = (lightness) => Math.round(lightness * LIGHTNESS_RESOLUTION) / LIGHTNESS_RESOLUTION;
  var toneOf = (spec, hue, band) => {
    const corrected = correctedTone(spec, normaliseHue(hue), band);
    const toneAt = (lightness) => {
      const chroma = gamutChroma(lightness, corrected.chroma, corrected.hue);
      return {
        lightness,
        chroma,
        hue: corrected.hue,
        hex: hexOf(lightness, chroma, corrected.hue)
      };
    };
    let tone = toneAt(roundLightness(corrected.lightness));
    if (!spec.contrast)
      return tone;
    const { with: against, ratio } = spec.contrast;
    const direction = relativeLuminance(against) > relativeLuminance(tone.hex) ? -1 : 1;
    while (contrastRatio(tone.hex, against) < ratio && tone.lightness > 0 && tone.lightness < 1)
      tone = toneAt(roundLightness(tone.lightness + direction * LIGHTNESS_STEP));
    return tone;
  };

  // packages/ui/src/components/hue-tones.ts
  var YELLOW_BAND = { centre: 82, radius: 20 };
  var HUE_TONES = {
    light: {
      bubble: {
        lightness: 0.87,
        chroma: 0.075,
        contrast: { with: "#020202", ratio: 7 }
      },
      accent: {
        lightness: 0.5,
        chroma: 0.13,
        contrast: { with: "#ffffff", ratio: 4.5 },
        yellow: { hue: 75, lightness: 0.54, chroma: 0.115 }
      },
      "new-line": { lightness: 0.8, chroma: 0.06 },
      "avatar-ink": { lightness: 0.56, chroma: 0.13 },
      "avatar-ground": { lightness: 0.93, chroma: 0.035 },
      "conversation-icon": { lightness: 0.92, chroma: 0.033 },
      "conversation-icon-foreground": { lightness: 0.45, chroma: 0.054 }
    },
    dark: {
      bubble: {
        lightness: 0.45,
        chroma: 0.1,
        contrast: { with: "#f5f5f5", ratio: 7.2 }
      },
      accent: {
        lightness: 0.78,
        chroma: 0.12,
        contrast: { with: "#121213", ratio: 4.5 }
      },
      "new-line": { lightness: 0.4, chroma: 0.06 },
      "avatar-ink": { lightness: 0.8, chroma: 0.12 },
      "avatar-ground": { lightness: 0.3, chroma: 0.04 },
      "conversation-icon": { lightness: 0.385, chroma: 0.033 },
      "conversation-icon-foreground": { lightness: 0.8, chroma: 0.054 }
    }
  };

  // packages/ui/src/components/hue-palette.ts
  var HUE_ROLES = Object.keys(HUE_TONES.light);
  var tones = new Map;
  var hueTone = (hue, theme, role) => {
    const key = `${hue} ${theme} ${role}`;
    const cached = tones.get(key);
    if (cached)
      return cached;
    const tone = toneOf(HUE_TONES[theme][role], hue, YELLOW_BAND);
    tones.set(key, tone);
    return tone;
  };

  // packages/ui/src/components/companion-avatar.ts
  var FIELD_CELLS = 16;
  var LATTICE = 5;
  var BLOB_SIGMA = 0.055;
  var COLUMN_STEP = 0.13;
  var ROW_STEP = 0.1;
  var FLOOR = 0.03;
  var NOISE_AMPLITUDE = 0.2;
  var SILHOUETTE_WEIGHT = 0.95;
  var DRIFT_PERIOD = 9000;
  var STATE_HOLD = 0.6;
  var HUE_SALT = 1374496523;
  var HUE_JITTER = 12;
  var CELL_SHARE = 0.9;
  var TONES = [0, 0.5, 1];
  var TONE_OPACITIES = [
    { tone: 0.5, opacity: 0.45 },
    { tone: 1, opacity: 1 }
  ];
  var CHANNEL_RESOLUTION = 1e6;
  var THEME_COLOURS = {
    light: {
      untinted: "#1d3ccd",
      groundStrength: 0.25,
      secondary: "#f2f2f2"
    },
    dark: {
      untinted: "#75acff",
      groundStrength: 0.35,
      secondary: "#262626"
    }
  };
  var COMPANION_GRID = honeycombGrid(FIELD_CELLS, CELL_SHARE);
  var CELL_CORNERS = hexagonCorners({ u: 0, v: 0 }, 1);
  var COMPANION_OUTLINE = {
    side: OUTER.halfWidth * 2,
    path: roundedHexagonPath(OUTER)
  };
  var clamp01 = (value) => Math.min(1, Math.max(0, value));
  var engineStable = (channel) => Math.round(channel * CHANNEL_RESOLUTION) / CHANNEL_RESOLUTION;
  var fieldLattice = (seed) => Float32Array.from({ length: LATTICE * LATTICE }, seededRandom(seed));
  var densityField = (seed, grid) => {
    const glyph = silhouetteCells(pickSilhouette(seed, COMPANION_SILHOUETTE_SPACE)).map(({ column, row }) => ({
      x: 0.5 + (column - 2) * COLUMN_STEP,
      y: 0.5 + (row - 3) * ROW_STEP
    }));
    const silhouette = Float32Array.from(grid.points, ({ u, v }) => {
      let sum = 0;
      for (const blob of glyph)
        sum += Math.exp(-((u - blob.x) ** 2 + (v - blob.y) ** 2) / (2 * BLOB_SIGMA ** 2));
      return clamp01(sum);
    });
    return { grid, silhouette, lattice: fieldLattice(seed) };
  };
  var companionField = (name) => densityField(companionSeed(name), COMPANION_GRID);
  var smooth = (value) => value * value * (3 - 2 * value);
  var noiseAt = (lattice, u, v) => {
    const x = (u % 1 + 1) % 1 * LATTICE;
    const y = (v % 1 + 1) % 1 * LATTICE;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const at = (column, row) => lattice[row % LATTICE * LATTICE + column % LATTICE];
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return top + (bottom - top) * fy;
  };
  var densities = ({ grid, silhouette, lattice }, state, time) => {
    const drift = state === "idle" ? 0 : time / DRIFT_PERIOD;
    return Array.from(silhouette, (shape, index) => {
      const { u, v } = grid.points[index];
      const floor = FLOOR + NOISE_AMPLITUDE * noiseAt(lattice, u + drift, v);
      const hold = STATE_HOLD + (1 - STATE_HOLD) * fieldIntensity(state, { x: u * 2 - 1, y: v * 2 - 1 }, time);
      return clamp01((floor + SILHOUETTE_WEIGHT * shape) * hold);
    });
  };
  var organicTones = (field, { ahead }) => {
    const error = Float32Array.from(field);
    return Array.from(error, (_, index) => {
      const value = error[index];
      const tone = TONES.reduce((best, next) => Math.abs(next - value) < Math.abs(best - value) ? next : best);
      for (const { to, share } of ahead[index])
        error[to] += (value - tone) * share;
      return tone;
    });
  };
  var fieldTones = (field, state, time) => organicTones(densities(field, state, time), field.grid).map((tone, index) => field.mask?.[index] === 0 ? 0 : tone);
  var fieldCells = ({ points, radius }) => points.map(({ u, v }) => ({ u, v, radius: radius * CELL_SHARE }));
  var hueShift = (name) => {
    const random = seededRandom(companionSeed(name) ^ HUE_SALT);
    return Math.round((random() * 2 - 1) * HUE_JITTER);
  };
  var toLinear = (channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  var toGamma = (channel) => channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
  var srgbOfHex = (hex) => {
    const channel = (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return { red: channel(1), green: channel(3), blue: channel(5) };
  };
  var oklabOf = ({ red, green, blue }) => {
    const r = toLinear(red);
    const g = toLinear(green);
    const b = toLinear(blue);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return {
      lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
    };
  };
  var srgbOf = ({ lightness, a, b }) => {
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const gamma = (linear) => engineStable(clamp01(toGamma(linear)));
    return {
      red: gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      green: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      blue: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
    };
  };
  var companionHue = (name, hue) => hue + hueShift(name);
  var cellColourOf = (name, theme, hue) => hue === undefined ? srgbOfHex(THEME_COLOURS[theme].untinted) : srgbOfHex(hueTone(companionHue(name, hue), theme, "avatar-ink").hex);
  var groundColourOf = (name, theme, hue) => {
    if (hue !== undefined)
      return srgbOfHex(hueTone(companionHue(name, hue), theme, "avatar-ground").hex);
    const { untinted, groundStrength, secondary } = THEME_COLOURS[theme];
    const field = oklabOf(srgbOfHex(untinted));
    const surface = oklabOf(srgbOfHex(secondary));
    const mix = (key) => field[key] * groundStrength + surface[key] * (1 - groundStrength);
    return srgbOf({ lightness: mix("lightness"), a: mix("a"), b: mix("b") });
  };
  var companionAvatar = ({
    name,
    hue,
    state,
    time,
    theme
  }) => {
    const field = companionField(name);
    return {
      cells: fieldCells(field.grid),
      tones: fieldTones(field, state, time),
      toneOpacities: TONE_OPACITIES,
      cellCorners: CELL_CORNERS,
      cellColour: cellColourOf(name, theme, hue),
      groundColour: groundColourOf(name, theme, hue),
      outline: COMPANION_OUTLINE
    };
  };

  // packages/ui/src/components/hive-layout.ts
  var HIVE_DEFAULT_SIZE = 40;
  var ARTBOARD_SIZE = 96;
  var CELL_LIMIT = 3;
  var COLUMN_GAP_RATIO = 0.94;
  var ROW_PITCH_RATIO = 1.087;
  var CELL_HEIGHT_RATIO = 0.4775;
  var COUNTER_FONT_RATIO = { small: 0.4605, large: 0.3589 };
  var CAP_CENTRE_RATIO = 0.36;
  var FILL_ORDER = [
    { column: 0, row: 0 },
    { column: 1, row: 0.5 },
    { column: 0, row: 1 }
  ];
  var middleOf = (values) => (Math.min(...values) + Math.max(...values)) / 2;
  var clusterCentres = (count, cellHeight, size) => {
    const centres = FILL_ORDER.slice(0, count).map(({ column, row }) => ({
      x: column * COLUMN_GAP_RATIO * cellHeight,
      y: row * ROW_PITCH_RATIO * cellHeight
    }));
    const shiftX = size / 2 - middleOf(centres.map(({ x }) => x));
    const shiftY = size / 2 - middleOf(centres.map(({ y }) => y));
    return centres.map(({ x, y }) => ({ x: x + shiftX, y: y + shiftY }));
  };
  var counterFontRatio = (size) => {
    const progress = Math.min(Math.max((size - HIVE_DEFAULT_SIZE) / (ARTBOARD_SIZE - HIVE_DEFAULT_SIZE), 0), 1);
    return COUNTER_FONT_RATIO.small + (COUNTER_FONT_RATIO.large - COUNTER_FONT_RATIO.small) * progress;
  };
  var workingFirst = (participants) => [
    ...participants.filter(({ working }) => working),
    ...participants.filter(({ working }) => !working)
  ];
  var hiveLayout = ({ participants, size }) => {
    const cellHeight = CELL_HEIGHT_RATIO * size;
    const scale = cellHeight / (OUTER.halfHeight * 2);
    const hexagon = {
      halfWidth: OUTER.halfWidth * scale,
      halfHeight: OUTER.halfHeight * scale
    };
    const hexagonPath = roundedHexagonPath(hexagon);
    const hexagonSide = hexagon.halfWidth * 2;
    const centres = clusterCentres(Math.min(participants.length, CELL_LIMIT), cellHeight, size);
    const isOverflowing = participants.length > CELL_LIMIT;
    const shown = workingFirst(participants).slice(0, isOverflowing ? CELL_LIMIT - 1 : CELL_LIMIT);
    const fontSize = hexagon.halfHeight * 2 * counterFontRatio(size);
    return {
      cells: shown.map(({ id, isPerson }, index) => ({
        id,
        centre: centres[index],
        side: isPerson ? hexagon.halfHeight * 2 : hexagonSide,
        shape: isPerson ? "circle" : "hexagon"
      })),
      hexagonPath,
      overflow: isOverflowing ? {
        centre: centres[CELL_LIMIT - 1],
        side: hexagonSide,
        path: hexagonPath,
        hiddenCount: participants.length - shown.length,
        fontSize,
        baseline: hexagon.halfWidth + fontSize * CAP_CENTRE_RATIO
      } : null
    };
  };

  // companion-avatar-global:companion-avatar-global
  globalThis.companionAvatar = companionAvatar;
  globalThis.hiveLayout = hiveLayout;
})();
