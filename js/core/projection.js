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
import { applyMatrixTransposed } from './orientation.js';

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

  const d = applyMatrixTransposed(R, worldVector);

  // Поворот экрана относительно корпуса: в ландшафте «право» устройства
  // перестаёт быть «правом» экрана.
  const a = (view.screenAngle || 0) * DEG;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const sx = d.x * cos + d.y * sin;
  const sy = -d.x * sin + d.y * cos;

  // Камера смотрит вдоль −Z, значит глубина перед ней — это −z.
  const depth = -d.z;
  const inFront = depth > 1e-6;

  const cx = view.width / 2;
  const cy = view.height / 2;

  // Угол между осью камеры и целью — пригодится, чтобы решить,
  // показывать метку или стрелку к краю экрана.
  const angleFromCenter =
    Math.acos(Math.max(-1, Math.min(1, -d.z))) * RAD;

  if (!inFront) {
    return {
      x: cx,
      y: cy,
      inFront: false,
      onScreen: false,
      angleFromCenter,
      // Направление на цель в плоскости экрана — для стрелки у края.
      screenAngle: normalize360(Math.atan2(sx, sy) * RAD),
    };
  }

  const x = cx + (sx / depth) * view.focal;
  const y = cy - (sy / depth) * view.focal;

  return {
    x,
    y,
    inFront: true,
    onScreen: x >= 0 && x <= view.width && y >= 0 && y <= view.height,
    angleFromCenter,
    screenAngle: normalize360(Math.atan2(sx, sy) * RAD),
  };
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
