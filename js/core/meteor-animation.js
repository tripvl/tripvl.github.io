/**
 * Чистая модель короткого разлёта Персеид вокруг экранной точки радианта.
 * Здесь нет Canvas и DOM: модуль только создаёт детерминированные траектории
 * и возвращает их состояние для заданного момента времени.
 */

export const PERSEIDS_BURST_DURATION = 2000;
export const PERSEIDS_METEOR_COUNT = 6;

const DEFAULT_SEED = 0x504552;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

/** Liang–Barsky: обрезает отрезок по прямоугольнику viewport. */
function clipSegment(from, to, width, height) {
  let start = 0;
  let end = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const boundaries = [
    [-dx, from.x],
    [dx, width - from.x],
    [-dy, from.y],
    [dy, height - from.y],
  ];

  for (const [p, q] of boundaries) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) start = Math.max(start, ratio);
    else end = Math.min(end, ratio);
    if (start > end) return null;
  }

  return {
    from: { x: from.x + dx * start, y: from.y + dy * start },
    to: { x: from.x + dx * end, y: from.y + dy * end },
  };
}

/** Создаёт неизменяемое описание одного двухсекундного бёрста. */
export function createPerseidsBurst({
  startedAt,
  seed = DEFAULT_SEED,
  duration = PERSEIDS_BURST_DURATION,
  count = PERSEIDS_METEOR_COUNT,
} = {}) {
  if (!Number.isFinite(startedAt) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }

  const meteorCount = Math.max(0, Math.floor(count));
  const random = seededRandom(seed);
  const meteors = Array.from({ length: meteorCount }, (_, index) => {
    // Равномерно покрываем окружность, но слегка сдвигаем каждый луч,
    // чтобы бёрст не выглядел механической шестиконечной звездой.
    const sector = (Math.PI * 2 * index) / Math.max(1, meteorCount);
    const angle = sector + (random() - 0.5) * 0.5;
    return Object.freeze({
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      delay: index * 190 + random() * 100,
      lifetime: 620 + random() * 280,
      radialStart: 32 + random() * 42,
      travel: 115 + random() * 125,
      length: 34 + random() * 34,
      width: 1.2 + random() * 1.15,
      brightness: 0.58 + random() * 0.32,
    });
  });

  return Object.freeze({
    startedAt,
    duration,
    seed,
    meteors: Object.freeze(meteors),
  });
}

/**
 * Одноразовый триггер поверх уже рассчитанного guidance с гистерезисом.
 * `found=false` означает, что guidance действительно отпустил цель за 14°.
 */
export function resolvePerseidsBurstTrigger(
  state = { ready: true, startedAt: null },
  { found = false, eligible = false, now } = {},
) {
  if (!found) return { ready: true, startedAt: state.startedAt ?? null };
  if (eligible && state.ready && Number.isFinite(now)) {
    return { ready: false, startedAt: now };
  }
  return {
    ready: Boolean(state.ready),
    startedAt: state.startedAt ?? null,
  };
}

/**
 * Возвращает видимые отрезки для текущего кадра. Радиант передаётся заново,
 * поэтому анимация остаётся приклеенной к неподвижному небу при повороте телефона.
 */
export function samplePerseidsBurst(
  burst,
  { now, radiant, viewport } = {},
) {
  const width = viewport?.width;
  const height = viewport?.height;
  if (
    !burst ||
    !Number.isFinite(now) ||
    !finitePoint(radiant) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { active: false, progress: 0, meteors: [] };
  }

  const elapsed = now - burst.startedAt;
  if (elapsed < 0 || elapsed >= burst.duration) {
    return {
      active: false,
      progress: elapsed >= burst.duration ? 1 : 0,
      meteors: [],
    };
  }

  const meteors = [];
  for (const meteor of burst.meteors) {
    const local = (elapsed - meteor.delay) / meteor.lifetime;
    if (local < 0 || local >= 1) continue;

    const eased = 1 - (1 - local) ** 2;
    const headDistance = meteor.radialStart + meteor.travel * eased;
    const visibleLength = meteor.length * (0.72 + local * 0.28);
    const tailDistance = Math.max(meteor.radialStart, headDistance - visibleLength);
    const from = {
      x: radiant.x + meteor.dx * tailDistance,
      y: radiant.y + meteor.dy * tailDistance,
    };
    const to = {
      x: radiant.x + meteor.dx * headDistance,
      y: radiant.y + meteor.dy * headDistance,
    };
    const clipped = clipSegment(from, to, width, height);
    if (!clipped) continue;

    meteors.push({
      ...clipped,
      alpha: Math.sin(Math.PI * local) * meteor.brightness,
      width: meteor.width,
      direction: { x: meteor.dx, y: meteor.dy },
    });
  }

  return {
    active: true,
    progress: elapsed / burst.duration,
    meteors,
  };
}
