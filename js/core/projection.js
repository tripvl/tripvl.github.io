/**
 * Проекция точки неба на экран поверх изображения с камеры.
 *
 * Задача: зная, куда направлен телефон и где на небе радиант, поставить
 * метку ровно в ту точку кадра, где радиант должен быть виден.
 *
 * Модель — обычная камера-обскура (pinhole). Камера смотрит вдоль оси −Z
 * системы координат устройства, поэтому точка перед камерой имеет
 * отрицательную z, а экранное смещение получается делением на глубину.
 *
 * Тонкость, из-за которой всё и считается именно так: видео растягивается
 * по экрану через object-fit: cover, то есть кадр обрезается. Поэтому поле
 * зрения на экране не равно полю зрения камеры, и масштаб нужно выводить
 * из фактических размеров кадра и вьюпорта, а не подбирать на глаз.
 */

import { DEG, RAD } from './astro.js';
import { applyMatrix, applyMatrixTransposed } from './orientation.js';

/**
 * Поле зрения камеры вдоль ДЛИННОЙ стороны кадра, в градусах.
 *
 * Браузер не сообщает этот параметр: в getCapabilities() его нет. Значение
 * подобрано под типичную основную камеру смартфона (эквивалент 26 мм).
 * Разброс между моделями — примерно 60–75°, поэтому в debug-режиме
 * значение можно менять и смотреть, как метка садится на реальные объекты.
 */
export const DEFAULT_CAMERA_FOV = 65;

/**
 * Фокусное расстояние в пикселях экрана.
 *
 * Считаем его один раз на кадр: пиксели квадратные, поэтому по обеим осям
 * оно одинаковое, и вся проекция сводится к умножению на одно число.
 *
 * @param {object} p
 * @param {number} p.videoWidth   ширина кадра, пиксели
 * @param {number} p.videoHeight  высота кадра
 * @param {number} p.viewWidth    ширина области показа, CSS-пиксели
 * @param {number} p.viewHeight   высота области показа
 * @param {number} p.fovDeg       поле зрения вдоль длинной стороны кадра
 * @returns {number} пикселей на единицу тангенса угла
 */
export function computeFocalLength({
  videoWidth,
  videoHeight,
  viewWidth,
  viewHeight,
  fovDeg = DEFAULT_CAMERA_FOV,
}) {
  if (!videoWidth || !videoHeight || !viewWidth || !viewHeight) return null;

  const longSide = Math.max(videoWidth, videoHeight);
  const focalInFramePixels = longSide / 2 / Math.tan((fovDeg / 2) * DEG);

  // object-fit: cover масштабирует кадр так, чтобы он накрыл вьюпорт целиком,
  // и обрезает лишнее. Берём тот же коэффициент, что и браузер.
  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);

  return focalInFramePixels * scale;
}

/**
 * Тот же масштаб для тёмного фона, когда реального видеокадра нет.
 * FOV, как и у камеры, задан вдоль длинной стороны.
 */
export function computeMapFocalLength({
  viewWidth,
  viewHeight,
  fovDeg = DEFAULT_CAMERA_FOV,
}) {
  if (!viewWidth || !viewHeight) return null;
  return Math.max(viewWidth, viewHeight) / 2 / Math.tan((fovDeg / 2) * DEG);
}

/** ENU-направление → координаты камеры с учётом поворота экрана. */
export function worldToView(R, worldVector, screenAngle = 0) {
  if (!R || !worldVector) return null;
  const d = applyMatrixTransposed(R, worldVector);
  const a = screenAngle * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: d.x * cos + d.y * sin,
    y: -d.x * sin + d.y * cos,
    z: d.z,
    depth: -d.z,
  };
}

/**
 * Куда на экране попадает направление на небе.
 *
 * @param {number[][]} R матрица поворота устройства
 * @param {{x:number,y:number,z:number}} worldVector направление в ENU
 * @param {object} view
 * @param {number} view.width  ширина вьюпорта
 * @param {number} view.height высота вьюпорта
 * @param {number} view.focal  результат computeFocalLength
 * @param {number} view.screenAngle поворот экрана в градусах
 * @returns {{x:number, y:number, inFront:boolean, onScreen:boolean,
 *            angleFromCenter:number, screenAngle:number}}
 *          x и y — координаты в пикселях от левого верхнего угла
 */
export function projectTarget(R, worldVector, view) {
  if (!R || !view?.focal) return null;

  const d = worldToView(R, worldVector, view.screenAngle || 0);

  // Камера смотрит вдоль −Z, значит глубина перед ней — это −z.
  const depth = d.depth;
  const inFront = depth > 1e-6;

  const cx = view.width / 2;
  const cy = view.height / 2;

  // Угол между осью камеры и целью — пригодится, чтобы решить,
  // показывать метку или стрелку к краю экрана.
  const angleFromCenter =
    Math.acos(Math.max(-1, Math.min(1, d.depth))) * RAD;

  if (!inFront) {
    return {
      x: cx,
      y: cy,
      inFront: false,
      onScreen: false,
      angleFromCenter,
      // Направление на цель в плоскости экрана — для стрелки у края.
      screenAngle: normalize360(Math.atan2(d.x, d.y) * RAD),
    };
  }

  const x = cx + (d.x / depth) * view.focal;
  const y = cy - (d.y / depth) * view.focal;

  return {
    x,
    y,
    inFront: true,
    onScreen: x >= 0 && x <= view.width && y >= 0 && y <= view.height,
    angleFromCenter,
    screenAngle: normalize360(Math.atan2(d.x, d.y) * RAD),
  };
}

/** Прежнее имя остаётся для совместимости, но это проекция любой точки неба. */
export const projectWorldPoint = projectTarget;

const normalizeVector = (v) => {
  const length = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};

/** Отсекает участок фигуры, ушедший под горизонт. */
export function clipWorldSegmentToHorizon(from, to) {
  if (from.z < 0 && to.z < 0) return null;
  if (from.z >= 0 && to.z >= 0) return { from, to };
  const t = from.z / (from.z - to.z);
  const crossing = normalizeVector({
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: 0,
  });
  return from.z >= 0 ? { from, to: crossing } : { from: crossing, to };
}

/**
 * Проекция отрезка небесной фигуры. Отрезает и горизонт,
 * и плоскость за спиной камеры, чтобы Canvas не получал бесконечные координаты.
 */
export function projectWorldSegment(R, from, to, view, { clipHorizon = true } = {}) {
  if (!R || !view?.focal) return null;
  const clipped = clipHorizon
    ? clipWorldSegmentToHorizon(from, to)
    : { from, to };
  if (!clipped) return null;

  let a = worldToView(R, clipped.from, view.screenAngle || 0);
  let b = worldToView(R, clipped.to, view.screenAngle || 0);
  const near = 1e-4;
  if (a.depth <= near && b.depth <= near) return null;

  const clipNear = (behind, front) => {
    const t = (near - behind.depth) / (front.depth - behind.depth);
    return {
      x: behind.x + (front.x - behind.x) * t,
      y: behind.y + (front.y - behind.y) * t,
      depth: near,
    };
  };
  if (a.depth <= near) a = clipNear(a, b);
  if (b.depth <= near) b = clipNear(b, a);

  const cx = view.width / 2;
  const cy = view.height / 2;
  const point = (v) => ({
    x: cx + (v.x / v.depth) * view.focal,
    y: cy - (v.y / v.depth) * view.focal,
  });
  const p1 = point(a);
  const p2 = point(b);
  const onScreen =
    Math.max(p1.x, p2.x) >= 0 &&
    Math.min(p1.x, p2.x) <= view.width &&
    Math.max(p1.y, p2.y) >= 0 &&
    Math.min(p1.y, p2.y) <= view.height;
  return { from: p1, to: p2, onScreen };
}

/**
 * Точная область земли в прямоугольном viewport. Горизонт — плоскость,
 * поэтому её проекция делит экран одной прямой.
 */
export function groundPolygon(R, view) {
  if (!R || !view?.focal) return [];
  const cx = view.width / 2;
  const cy = view.height / 2;
  const angle = (view.screenAngle || 0) * DEG;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const heightAt = ({ x, y }) => {
    const screenX = (x - cx) / view.focal;
    const screenY = -(y - cy) / view.focal;
    const device = {
      x: screenX * cos - screenY * sin,
      y: screenX * sin + screenY * cos,
      z: -1,
    };
    return applyMatrix(R, device).z;
  };

  let polygon = [
    { x: 0, y: 0 },
    { x: view.width, y: 0 },
    { x: view.width, y: view.height },
    { x: 0, y: view.height },
  ];
  const output = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const hc = heightAt(current);
    const hn = heightAt(next);
    const currentInside = hc <= 0;
    const nextInside = hn <= 0;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const t = hc / (hc - hn);
      output.push({
        x: current.x + (next.x - current.x) * t,
        y: current.y + (next.y - current.y) * t,
      });
    }
  }
  return output;
}

/**
 * Горизонтальное и вертикальное поле зрения, которое реально видно
 * на экране после обрезки. Показываем в debug — помогает понять,
 * почему цель «не влезает» в кадр.
 */
export function visibleFieldOfView(view) {
  if (!view?.focal) return null;
  return {
    horizontal: 2 * Math.atan(view.width / 2 / view.focal) * RAD,
    vertical: 2 * Math.atan(view.height / 2 / view.focal) * RAD,
  };
}

const normalize360 = (deg) => ((deg % 360) + 360) % 360;
