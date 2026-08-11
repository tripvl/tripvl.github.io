/**
 * Магнитное склонение по модели WMM (World Magnetic Model).
 *
 * Зачем это нужно. Компас телефона на Android показывает направление на
 * МАГНИТНЫЙ север, а азимут радианта мы считаем от ГЕОГРАФИЧЕСКОГО. Разница
 * (склонение) в наших широтах достигает 10–15°: в Москве около +11.5°,
 * во Владивостоке около −10.5°. Это почти весь допуск, в пределах которого
 * мы считаем радиант найденным, поэтому поправку необходимо учитывать.
 *
 * Почему именно WMM. Простая модель наклонённого диполя, которой обычно
 * пробуют обойтись, для склонения не годится: в Евразии она ошибается на
 * 15–25° и даже путает знак. WMM — стандартная модель (её используют
 * навигационные системы и сам Android), даёт точность лучше 1°.
 * Коэффициенты лежат в js/config/wmm2025.js, всё считается на устройстве.
 *
 * Реализация по WMM Technical Report, разложение по сферическим гармоникам
 * степени 12 со схмидтовой полунормировкой присоединённых функций Лежандра.
 */

import { WMM } from '../config/wmm2025.js';
import { DEG, RAD } from './astro.js';

const A_WGS84 = 6378.137; // большая полуось эллипсоида WGS84, км
const F_WGS84 = 1 / 298.257223563;
const E2 = F_WGS84 * (2 - F_WGS84);
const R_GEOMAG = 6371.2; // опорный радиус модели, км

const N = WMM.maxDegree;
const idx = (n, m) => (n * (n + 1)) / 2 + m;

/**
 * Коэффициенты схмидтовой полунормировки: sqrt((2-δ) * (n-m)! / (n+m)!).
 * Считаем один раз при загрузке модуля.
 */
const SCHMIDT = (() => {
  const s = new Float64Array(idx(N, N) + 1);
  for (let n = 0; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      let ratio = 1; // (n-m)! / (n+m)!
      for (let k = n - m + 1; k <= n + m; k++) ratio /= k;
      s[idx(n, m)] = Math.sqrt((m === 0 ? 1 : 2) * ratio);
    }
  }
  return s;
})();

/** Дробный год — модель задана на эпоху и линейно экстраполируется. */
export function decimalYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Полный вектор геомагнитного поля.
 *
 * @param {number} latDeg  геодезическая широта, север положительный
 * @param {number} lonDeg  долгота, восток положительный
 * @param {number} altKm   высота над эллипсоидом, км
 * @param {Date} date
 * @returns {{x:number,y:number,z:number,h:number,f:number,declination:number,inclination:number}}
 *          компоненты в нТл (x — на север, y — на восток, z — вниз),
 *          склонение и наклонение в градусах
 */
export function geomagneticField(latDeg, lonDeg, altKm, date) {
  // Вековой ход. За пределами срока действия модели не экстраполируем далеко:
  // лучше замереть на границе, чем уползать всё дальше от истины.
  const t = Math.min(
    Math.max(decimalYear(date), WMM.epoch),
    WMM.validUntil,
  );
  const dt = t - WMM.epoch;

  const latGd = latDeg * DEG;
  const lon = lonDeg * DEG;

  // Геодезические координаты → геоцентрические сферические.
  const sinGd = Math.sin(latGd);
  const cosGd = Math.cos(latGd);
  const rc = A_WGS84 / Math.sqrt(1 - E2 * sinGd * sinGd);
  const p = (rc + altKm) * cosGd;
  const zc = (rc * (1 - E2) + altKm) * sinGd;
  const r = Math.hypot(p, zc);
  const latGc = Math.asin(zc / r);

  const sinPhi = Math.sin(latGc);
  const cosPhi = Math.cos(latGc);

  // Присоединённые функции Лежандра и их производные по широте.
  const { P, dP } = legendre(sinPhi, cosPhi);

  // Синусы и косинусы кратных долготы.
  const cosML = new Float64Array(N + 1);
  const sinML = new Float64Array(N + 1);
  cosML[0] = 1;
  sinML[0] = 0;
  for (let m = 1; m <= N; m++) {
    cosML[m] = Math.cos(m * lon);
    sinML[m] = Math.sin(m * lon);
  }

  let xp = 0;
  let yp = 0;
  let zp = 0;
  const ratio = R_GEOMAG / r;

  for (let n = 1; n <= N; n++) {
    const rPow = Math.pow(ratio, n + 2);
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      const g = WMM.g[i] + dt * WMM.gDot[i];
      const h = WMM.h[i] + dt * WMM.hDot[i];
      const cosPart = g * cosML[m] + h * sinML[m];
      const sinPart = g * sinML[m] - h * cosML[m];

      xp -= rPow * cosPart * dP[i];
      yp += rPow * m * sinPart * P[i];
      zp -= rPow * (n + 1) * cosPart * P[i];
    }
  }

  // На самом полюсе множитель 1/cos φ вырождается. Физически там склонение
  // не определено; подставляем крошечное значение, чтобы не получить NaN.
  yp /= Math.abs(cosPhi) < 1e-10 ? 1e-10 : cosPhi;

  // Поворот из геоцентрической системы в геодезическую.
  const delta = latGc - latGd;
  const cosD = Math.cos(delta);
  const sinD = Math.sin(delta);
  const x = xp * cosD - zp * sinD;
  const y = yp;
  const z = xp * sinD + zp * cosD;

  const hHoriz = Math.hypot(x, y);
  return {
    x,
    y,
    z,
    h: hHoriz,
    f: Math.hypot(hHoriz, z),
    declination: Math.atan2(y, x) * RAD,
    inclination: Math.atan2(z, hHoriz) * RAD,
  };
}

/**
 * Схмидтовы полунормированные функции Лежандра P(n,m)(sin φ)
 * и их производные по φ. Рекуррентные соотношения — стандартные,
 * без фазы Кондона—Шортли (принято в геомагнетизме).
 */
function legendre(sinPhi, cosPhi) {
  const size = idx(N, N) + 1;
  const P = new Float64Array(size);
  const dP = new Float64Array(size);

  P[idx(0, 0)] = 1;
  dP[idx(0, 0)] = 0;

  for (let n = 1; n <= N; n++) {
    for (let m = 0; m <= n; m++) {
      const i = idx(n, m);
      if (n === m) {
        // Диагональ: P(m,m) = (2m-1) cos φ P(m-1,m-1)
        const j = idx(n - 1, n - 1);
        P[i] = (2 * n - 1) * cosPhi * P[j];
        dP[i] = (2 * n - 1) * (cosPhi * dP[j] - sinPhi * P[j]);
      } else if (n === m + 1) {
        const j = idx(n - 1, m);
        P[i] = (2 * n - 1) * sinPhi * P[j];
        dP[i] = (2 * n - 1) * (sinPhi * dP[j] + cosPhi * P[j]);
      } else {
        const j1 = idx(n - 1, m);
        const j2 = idx(n - 2, m);
        const k = (2 * n - 1) / (n - m);
        const l = (n + m - 1) / (n - m);
        P[i] = k * sinPhi * P[j1] - l * P[j2];
        dP[i] = k * (sinPhi * dP[j1] + cosPhi * P[j1]) - l * dP[j2];
      }
    }
  }

  // Ненормированные значения → схмидтовы полунормированные.
  for (let i = 0; i < size; i++) {
    P[i] *= SCHMIDT[i];
    dP[i] *= SCHMIDT[i];
  }
  return { P, dP };
}

/**
 * Магнитное склонение в градусах: положительное — магнитный север
 * восточнее истинного. Чтобы перевести магнитный азимут в истинный:
 * true = magnetic + declination.
 */
export function declinationDeg(latDeg, lonDeg, date = new Date()) {
  return geomagneticField(latDeg, lonDeg, 0, date).declination;
}

/**
 * Перевод показаний магнитного компаса в истинный азимут.
 * Если координаты неизвестны, возвращаем как есть: небольшая систематическая
 * ошибка лучше, чем отказ работать.
 */
export function magneticToTrue(headingMagnetic, position, date = new Date()) {
  if (!position || !Number.isFinite(position.lat)) return headingMagnetic;
  return (
    headingMagnetic + declinationDeg(position.lat, position.lon, date)
  );
}

/** Модель годна до этой даты — используется в debug-панели. */
export const MODEL_INFO = {
  name: WMM.name,
  epoch: WMM.epoch,
  validUntil: WMM.validUntil,
  isExpired(date = new Date()) {
    return decimalYear(date) > WMM.validUntil;
  },
};
