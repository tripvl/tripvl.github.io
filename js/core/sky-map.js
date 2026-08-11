/**
 * Чистая геометрия небесного купола. DOM и Canvas здесь не трогаются:
 * модуль получает время, место и матрицу телефона, а возвращает готовую
 * сцену в CSS-пикселях.
 */

import { CONSTELLATIONS, SKY_STARS } from '../config/constellations.js';
import {
  azAltToVector,
  equatorialToHorizontal,
  precessFromJ2000,
} from './astro.js';
import {
  groundPolygon,
  projectWorldPoint,
  projectWorldSegment,
} from './projection.js';

const CARDINALS = [
  { az: 0, label: 'С' },
  { az: 90, label: 'В' },
  { az: 180, label: 'Ю' },
  { az: 270, label: 'З' },
];

/** J2000-каталог → неподвижные ENU-векторы для конкретных места и времени. */
export function buildSkyDome({ date, position }) {
  if (!(date instanceof Date) || !position) return null;

  const stars = SKY_STARS.map(([hr, ra, dec, mag]) => {
    const ofDate = precessFromJ2000(ra, dec, date);
    const horizontal = equatorialToHorizontal(ofDate, position, date);
    return {
      hr,
      mag,
      alt: horizontal.alt,
      vector: azAltToVector(horizontal.az, horizontal.alt),
    };
  });

  const constellations = CONSTELLATIONS.map((item) => {
    const anchorEq = precessFromJ2000(item.anchor[0], item.anchor[1], date);
    const anchorHorizontal = equatorialToHorizontal(anchorEq, position, date);
    return {
      ...item,
      anchorAlt: anchorHorizontal.alt,
      anchorVector: azAltToVector(anchorHorizontal.az, anchorHorizontal.alt),
    };
  });

  return { date, position, stars, constellations };
}

/** Проецирует весь купол за один кадр. */
export function projectSkyDome({ dome, matrix, view, highlightId, target }) {
  if (!dome || !matrix || !view?.focal) return null;

  const lines = [];
  const stars = [];
  const labels = [];
  const visibleIds = new Set();
  const highlightedStars = new Set();

  for (const constellation of dome.constellations) {
    const highlight = constellation.id === highlightId;
    for (const path of constellation.paths) {
      if (highlight) path.forEach((index) => highlightedStars.add(index));
      for (let i = 1; i < path.length; i += 1) {
        const segment = projectWorldSegment(
          matrix,
          dome.stars[path[i - 1]].vector,
          dome.stars[path[i]].vector,
          view,
        );
        if (!segment?.onScreen) continue;
        lines.push({ ...segment, highlight, constellation: constellation.id });
        visibleIds.add(constellation.id);
      }
    }

    if (constellation.anchorAlt >= 0) {
      const anchor = projectWorldPoint(matrix, constellation.anchorVector, view);
      if (anchor?.onScreen) {
        labels.push({
          x: anchor.x,
          y: anchor.y,
          text: constellation.name,
          highlight,
          constellation: constellation.id,
        });
        visibleIds.add(constellation.id);
      }
    }
  }

  for (let index = 0; index < dome.stars.length; index += 1) {
    const star = dome.stars[index];
    if (star.alt < 0) continue;
    const point = projectWorldPoint(matrix, star.vector, view);
    if (!point?.onScreen) continue;
    stars.push({
      x: point.x,
      y: point.y,
      mag: star.mag,
      highlight: highlightedStars.has(index),
    });
  }

  const horizon = [];
  for (let az = 0; az < 360; az += 5) {
    const segment = projectWorldSegment(
      matrix,
      azAltToVector(az, 0),
      azAltToVector(az + 5, 0),
      view,
      { clipHorizon: false },
    );
    if (segment?.onScreen) horizon.push(segment);
  }

  const cardinals = CARDINALS.map(({ az, label }) => ({
    label,
    projection: projectWorldPoint(matrix, azAltToVector(az, 0.7), view),
  }))
    .filter(({ projection }) => projection?.onScreen)
    .map(({ label, projection }) => ({ label, x: projection.x, y: projection.y }));

  const targetVector = target ? azAltToVector(target.az, target.alt) : null;
  const targetProjection =
    target && target.alt >= 0
      ? projectWorldPoint(matrix, targetVector, view)
      : null;
  const horizonGuide = target
    ? projectWorldPoint(matrix, azAltToVector(target.az, 0), view)
    : null;

  return {
    width: view.width,
    height: view.height,
    ground: groundPolygon(matrix, view),
    horizon,
    cardinals,
    lines,
    stars,
    labels,
    target: targetProjection,
    horizonGuide,
    visibleConstellations: visibleIds.size,
  };
}

/**
 * Положение и поворот DOM-стрелки. За кадром она стоит у края,
 * внутри кадра — в центре, откуда показывает, куда вести телефон.
 */
export function targetNavigation({
  scene,
  target,
  aligned,
  sideInset = 58,
  topInset = 104,
  bottomInset = 150,
}) {
  if (!scene || !target) return { mode: 'hidden', hidden: true };
  if (aligned && target.alt >= 0) return { mode: 'aligned', hidden: true };

  const projection = target.alt < 0 ? scene.horizonGuide : scene.target;
  const below = target.alt < 0;
  const angle = projection?.screenAngle ?? 0;

  if (below && projection?.onScreen) {
    return {
      mode: 'below',
      hidden: false,
      x: projection.x,
      y: projection.y,
      angle: 180,
    };
  }

  if (!below && projection?.onScreen) {
    return {
      mode: 'inside',
      hidden: false,
      x: scene.width / 2,
      y: scene.height / 2,
      angle,
    };
  }

  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const tx =
    Math.abs(dx) < 1e-6
      ? Infinity
      : dx > 0
        ? (scene.width - sideInset - cx) / dx
        : (sideInset - cx) / dx;
  const ty =
    Math.abs(dy) < 1e-6
      ? Infinity
      : dy > 0
        ? (scene.height - bottomInset - cy) / dy
        : (topInset - cy) / dy;
  const distance = Math.min(tx, ty);
  return {
    mode: below ? 'below-edge' : 'edge',
    hidden: false,
    x: Math.max(sideInset, Math.min(scene.width - sideInset, cx + dx * distance)),
    y: Math.max(topInset, Math.min(scene.height - bottomInset, cy + dy * distance)),
    angle,
  };
}
