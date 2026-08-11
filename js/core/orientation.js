/**
 * Ориентация устройства: куда сейчас направлена задняя камера телефона.
 *
 * Модель взаимодействия: человек держит телефон экраном к себе и наводит
 * его на небо, как окошко. Целимся направлением ЗАДНЕЙ КАМЕРЫ — в системе
 * координат устройства это вектор (0, 0, −1).
 *
 * Что здесь непросто и почему код такой, какой есть:
 *
 * 1. alpha в разных браузерах значит разное. На Android событие
 *    deviceorientationabsolute даёт alpha, привязанную к магнитному северу.
 *    На iOS alpha отсчитывается от произвольного начального положения и
 *    вдобавок медленно уплывает — использовать её как азимут нельзя.
 *    Поэтому мы не используем «heading = 360 − alpha» как направление
 *    камеры, а строим полную матрицу. Величина −alpha нужна только для
 *    непрерывной поправки мирового yaw по webkitCompassHeading.
 *
 * 2. Компас показывает магнитный север, а радиант мы считаем от истинного.
 *    Разница в наших широтах 10–15°, поэтому склонение обязательно
 *    учитывается (см. core/magnetic.js). Это касается и iOS: Apple
 *    документирует webkitCompassHeading как отсчёт от МАГНИТНОГО севера,
 *    и это согласуется с тем, что Safari отдаёт компас, не спрашивая
 *    разрешения на геолокацию, — без неё истинный курс недоступен.
 *
 * 3. Событие deviceorientation без абсолютной привязки бесполезно для
 *    поиска севера. Такой источник мы честно считаем «компаса нет»
 *    и уходим в ручной режим, а не показываем стрелку, которая врёт.
 */

import {
  DEG,
  RAD,
  normalizeDeg,
  signedDelta,
  vectorToAzAlt,
} from './astro.js';
import { declinationDeg } from './magnetic.js';

/** Сколько ждать первого события датчика, прежде чем признать, что его нет. */
const SENSOR_TIMEOUT_MS = 3000;

/** Коэффициент сглаживания полной 3D-ориентации (0..1, больше — резче). */
export const ORIENTATION_SMOOTHING = 0.22;

/** Сглаживание медленно меняющейся iOS-поправки на магнитный север. */
const YAW_SMOOTHING = 0.25;

/** Окно оценки стабильности компаса. */
const QUALITY_WINDOW_MS = 3000;

/** Разброс азимута на неподвижном телефоне, выше которого компас считаем ненадёжным. */
const UNSTABLE_SIGMA_DEG = 12;

/** Насколько телефон должен быть неподвижен, чтобы разброс что-то значил. */
const STILL_TILT_DEG = 4;

export const HEADING_SOURCE = {
  IOS_COMPASS: 'ios-compass',
  ABSOLUTE: 'absolute',
  RELATIVE: 'relative',
};

/**
 * Матрица поворота из системы координат устройства в систему координат Земли
 * (ENU: x — восток, y — север, z — вверх), по спецификации W3C:
 * последовательные повороты Z(alpha) → X'(beta) → Y''(gamma).
 *
 * Возвращаем матрицу построчно. Вектор устройства v переводится в мировой
 * как R·v, обратно — транспонированием.
 */
export function rotationMatrix(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * DEG;
  const b = betaDeg * DEG;
  const g = gammaDeg * DEG;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const cg = Math.cos(g);
  const sg = Math.sin(g);

  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
}

/** R·v */
export function applyMatrix(R, v) {
  return {
    x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
    y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
    z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
  };
}

/** Rᵀ·v — из мировой системы в систему устройства. */
export function applyMatrixTransposed(R, v) {
  return {
    x: R[0][0] * v.x + R[1][0] * v.y + R[2][0] * v.z,
    y: R[0][1] * v.x + R[1][1] * v.y + R[2][1] * v.z,
    z: R[0][2] * v.x + R[1][2] * v.y + R[2][2] * v.z,
  };
}

/** Направление задней камеры в мировых координатах. */
export function cameraDirection(R) {
  return applyMatrix(R, { x: 0, y: 0, z: -1 });
}

/** Направление верхнего торца телефона в мировых координатах. */
export function deviceTopDirection(R) {
  return applyMatrix(R, { x: 0, y: 1, z: 0 });
}

/**
 * Магнитная поправка для iOS. −alpha — курс верхнего торца в базовой
 * системе W3C, поэтому этот расчёт не вырождается, когда телефон проходит
 * через вертикальное положение и сам торец смотрит в зенит.
 */
export function compassYawOffset(alphaDeg, compassHeading) {
  return signedDelta(normalizeDeg(-alphaDeg), normalizeDeg(compassHeading));
}

/** Курс верхней грани ВИДИМОГО экрана с учётом landscape-поворота. */
export function screenTopHeading(R, screenOrientationDeg = 0) {
  if (!R) return null;
  const angle = screenOrientationDeg * DEG;
  const top = applyMatrix(R, {
    x: -Math.sin(angle),
    y: Math.cos(angle),
    z: 0,
  });
  if (Math.hypot(top.x, top.y) < 1e-6) return null;
  return normalizeDeg(Math.atan2(top.x, top.y) * RAD);
}

const normalizeQuaternion = (q) => {
  const length = Math.hypot(q.w, q.x, q.y, q.z) || 1;
  return { w: q.w / length, x: q.x / length, y: q.y / length, z: q.z / length };
};

/** Матрица поворота → единичный quaternion. */
export function matrixToQuaternion(R) {
  const trace = R[0][0] + R[1][1] + R[2][2];
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = {
      w: s / 4,
      x: (R[2][1] - R[1][2]) / s,
      y: (R[0][2] - R[2][0]) / s,
      z: (R[1][0] - R[0][1]) / s,
    };
  } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
    const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
    q = {
      w: (R[2][1] - R[1][2]) / s,
      x: s / 4,
      y: (R[0][1] + R[1][0]) / s,
      z: (R[0][2] + R[2][0]) / s,
    };
  } else if (R[1][1] > R[2][2]) {
    const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
    q = {
      w: (R[0][2] - R[2][0]) / s,
      x: (R[0][1] + R[1][0]) / s,
      y: s / 4,
      z: (R[1][2] + R[2][1]) / s,
    };
  } else {
    const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
    q = {
      w: (R[1][0] - R[0][1]) / s,
      x: (R[0][2] + R[2][0]) / s,
      y: (R[1][2] + R[2][1]) / s,
      z: s / 4,
    };
  }
  return normalizeQuaternion(q);
}

/** Единичный quaternion → матрица поворота. */
export function quaternionToMatrix(value) {
  const { w, x, y, z } = normalizeQuaternion(value);
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/** Кратчайшая сферическая интерполяция без скачка q ↔ −q. */
export function slerpQuaternion(from, to, amount) {
  if (!from) return normalizeQuaternion(to);
  const a = normalizeQuaternion(from);
  let b = normalizeQuaternion(to);
  let dot = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z;
  if (dot < 0) {
    dot = -dot;
    b = { w: -b.w, x: -b.x, y: -b.y, z: -b.z };
  }
  if (dot > 0.9995) {
    return normalizeQuaternion({
      w: a.w + (b.w - a.w) * amount,
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount,
      z: a.z + (b.z - a.z) * amount,
    });
  }
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinAngle = Math.sin(angle);
  const fromWeight = Math.sin((1 - amount) * angle) / sinAngle;
  const toWeight = Math.sin(amount * angle) / sinAngle;
  return normalizeQuaternion({
    w: a.w * fromWeight + b.w * toWeight,
    x: a.x * fromWeight + b.x * toWeight,
    y: a.y * fromWeight + b.y * toWeight,
    z: a.z * fromWeight + b.z * toWeight,
  });
}

/**
 * Куда рисовать стрелку: угол в градусах по часовой стрелке от «вверх экрана».
 *
 * Считаем именно так, а не по разнице азимутов, потому что телефон может быть
 * наклонён как угодно. Переводим направление на цель в систему координат
 * устройства и проецируем на плоскость экрана — тогда стрелка честно
 * показывает, куда вести телефон, при любом наклоне.
 *
 * @param {number[][]} R матрица поворота устройства
 * @param {{x:number,y:number,z:number}} worldVector направление на цель в ENU
 * @param {number} screenOrientationDeg поворот экрана относительно устройства
 */
export function screenAngleTo(R, worldVector, screenOrientationDeg = 0) {
  if (!R) return null;
  const d = applyMatrixTransposed(R, worldVector);
  const rad = screenOrientationDeg * DEG;
  const x = d.x * Math.cos(rad) + d.y * Math.sin(rad);
  const y = -d.x * Math.sin(rad) + d.y * Math.cos(rad);
  if (Math.hypot(x, y) < 1e-9) return 0;
  return normalizeDeg(Math.atan2(x, y) * RAD);
}

/**
 * Матрица поворота для заданного направления камеры без крена.
 * Нужна отладочному режиму: он подменяет heading и pitch, а дальше всё
 * идёт по тому же коду, что и с настоящими датчиками.
 */
export function matrixFromHeadingPitch(heading, pitch) {
  return rotationMatrix(normalizeDeg(-heading), pitch + 90, 0);
}

/** Круговое стандартное отклонение набора азимутов. */
function circularSigma(anglesDeg) {
  if (anglesDeg.length < 2) return 0;
  let sx = 0;
  let sy = 0;
  for (const a of anglesDeg) {
    sx += Math.cos(a * DEG);
    sy += Math.sin(a * DEG);
  }
  const r = Math.hypot(sx, sy) / anglesDeg.length;
  if (r >= 1) return 0;
  return Math.sqrt(-2 * Math.log(r)) * RAD;
}

export function createOrientationTracker() {
  const listeners = new Set();

  const state = {
    /** Приходят ли вообще события ориентации. */
    available: false,
    /** Есть ли привязка к сторонам света. Без неё стрелка бессмысленна. */
    absolute: false,
    source: null,
    /** 'unknown' | 'granted' | 'denied' | 'unsupported' */
    permission: 'unknown',
    /** Истинный азимут задней камеры, с учётом склонения. */
    heading: null,
    /** Высота направления камеры над горизонтом. */
    pitch: null,
    /** Показание компаса до поправок — нужно в debug. */
    headingRaw: null,
    declination: 0,
    yawOffset: 0,
    yawOffsetInitialized: false,
    stable: true,
    sigma: 0,
    rate: 0,
    lastEventAt: 0,
    compassAccuracy: null,
  };

  let position = null;
  let matrix = null;
  let smoothedQuaternion = null;
  let started = false;
  let watchdog = null;
  let samples = [];
  let listenersAttached = false;

  const emit = () => {
    for (const cb of listeners) cb(getState());
  };

  const getState = () => ({ ...state, matrix });

  function updateQuality(headingValue, betaDeg, gammaDeg) {
    const now = performance.now();
    samples.push({ t: now, h: headingValue, b: betaDeg, g: gammaDeg });
    samples = samples.filter((s) => now - s.t <= QUALITY_WINDOW_MS);

    state.rate =
      samples.length > 1
        ? (samples.length - 1) / ((now - samples[0].t) / 1000 || 1)
        : 0;

    if (samples.length < 8) return;

    // Разброс азимута имеет смысл только на почти неподвижном телефоне:
    // иначе мы измерим не дрожание компаса, а движение руки.
    const betas = samples.map((s) => s.b);
    const gammas = samples.map((s) => s.g);
    const spread = (arr) => Math.max(...arr) - Math.min(...arr);
    const still =
      spread(betas) < STILL_TILT_DEG && spread(gammas) < STILL_TILT_DEG;

    state.sigma = circularSigma(samples.map((s) => s.h));

    const accuracyBad =
      state.compassAccuracy !== null &&
      (state.compassAccuracy < 0 || state.compassAccuracy > 20);

    state.stable = !(still && state.sigma > UNSTABLE_SIGMA_DEG) && !accuracyBad;
  }

  function handleEvent(event, absoluteHint) {
    const { alpha, beta, gamma } = event;
    if (alpha === null || beta === null || gamma === null) return;

    const compass = event.webkitCompassHeading;
    const hasCompass = typeof compass === 'number' && Number.isFinite(compass);
    const isAbsolute = hasCompass || absoluteHint || event.absolute === true;

    // Выбор источника: компас iOS надёжнее всего, затем абсолютная
    // ориентация Android. Относительную ориентацию не повышаем до
    // абсолютной никогда — она не знает, где север.
    const source = hasCompass
      ? HEADING_SOURCE.IOS_COMPASS
      : isAbsolute
        ? HEADING_SOURCE.ABSOLUTE
        : HEADING_SOURCE.RELATIVE;

    // Если уже есть источник получше, игнорируем событие послабее.
    const rank = (s) =>
      s === HEADING_SOURCE.IOS_COMPASS ? 3 : s === HEADING_SOURCE.ABSOLUTE ? 2 : 1;
    if (state.source && rank(source) < rank(state.source)) return;

    state.available = true;
    state.source = source;
    state.absolute = isAbsolute;
    state.lastEventAt = Date.now();
    if (typeof event.webkitCompassAccuracy === 'number') {
      state.compassAccuracy = event.webkitCompassAccuracy;
    }

    const rawMatrix = rotationMatrix(alpha, beta, gamma);

    // Поправка рыскания. Сравниваем мировой yaw (−alpha) с компасом,
    // а не горизонтальную проекцию верхнего торца: у вертикального телефона
    // она вырождается и после прохождения зенита меняется на 180°.
    if (hasCompass) {
      const offset = compassYawOffset(alpha, compass);
      state.yawOffset = state.yawOffsetInitialized
        ? state.yawOffset + signedDelta(state.yawOffset, offset) * YAW_SMOOTHING
        : offset;
      state.yawOffsetInitialized = true;
    } else {
      state.yawOffset = 0;
      state.yawOffsetInitialized = false;
    }

    const magneticMatrix = rotateMatrixAboutZ(rawMatrix, state.yawOffset);
    const magneticDirection = vectorToAzAlt(cameraDirection(magneticMatrix));
    const azMagnetic = magneticDirection.az;

    state.headingRaw = azMagnetic;
    state.declination = position
      ? declinationDeg(position.lat, position.lon, new Date())
      : 0;

    // Одна сглаженная матрица обслуживает карту, стрелку и guidance.
    // Quaternion не имеет разрыва на границах Euler-углов и 0/360°.
    const trueMatrix = rotateMatrixAboutZ(magneticMatrix, state.declination);
    smoothedQuaternion = slerpQuaternion(
      smoothedQuaternion,
      matrixToQuaternion(trueMatrix),
      ORIENTATION_SMOOTHING,
    );
    matrix = quaternionToMatrix(smoothedQuaternion);
    const shown = vectorToAzAlt(cameraDirection(matrix));

    state.heading = shown.az;
    state.pitch = shown.alt;

    // Оценка качества тоже не должна пользоваться азимутом камеры около
    // зенита: там он физически не определён. Мировой yaw остаётся непрерывным.
    updateQuality(normalizeDeg(-alpha + state.yawOffset), beta, gamma);
    emit();
  }

  const onAbsolute = (e) => handleEvent(e, true);
  const onRelative = (e) => handleEvent(e, false);

  function attach() {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('deviceorientationabsolute', onAbsolute, true);
    window.addEventListener('deviceorientation', onRelative, true);
  }

  function detach() {
    if (!listenersAttached) return;
    listenersAttached = false;
    window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
    window.removeEventListener('deviceorientation', onRelative, true);
  }

  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    getState,

    /** Координаты нужны, чтобы посчитать магнитное склонение. */
    setPosition(pos) {
      position = pos;
    },

    /** Есть ли в этом браузере вообще нужный API. */
    isSupported() {
      return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    },

    /** Требует ли браузер явного разрешения (iOS 13+). */
    needsPermission() {
      return (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      );
    },

    /**
     * ВАЖНО: на iOS этот метод обязан вызываться синхронно из обработчика
     * жеста пользователя, иначе система молча откажет.
     */
    async requestPermission() {
      if (!this.isSupported()) {
        state.permission = 'unsupported';
        return state.permission;
      }
      if (!this.needsPermission()) {
        state.permission = 'granted';
        return state.permission;
      }
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        state.permission = res === 'granted' ? 'granted' : 'denied';
      } catch {
        // Вызов вне жеста пользователя или отказ — для нас это одно и то же:
        // компаса нет, работаем в ручном режиме.
        state.permission = 'denied';
      }
      return state.permission;
    },

    /**
     * Запускает слушатели и сторожевой таймер.
     * @returns {Promise<{ok:boolean, reason?:string}>} придут ли пригодные данные
     */
    start() {
      if (!this.isSupported()) {
        state.permission = 'unsupported';
        return Promise.resolve({ ok: false, reason: 'unsupported' });
      }
      if (started) {
        return Promise.resolve({
          ok: state.available && state.absolute,
          reason: state.absolute ? undefined : 'relative-only',
        });
      }
      started = true;
      attach();

      return new Promise((resolve) => {
        const settle = (result) => {
          clearTimeout(watchdog);
          watchdog = null;
          resolve(result);
        };

        const check = () => {
          if (state.available && state.absolute) {
            unsubscribe();
            settle({ ok: true });
          }
        };
        const unsubscribe = this.subscribe(check);

        watchdog = setTimeout(() => {
          unsubscribe();
          if (!state.available) {
            // Датчик не отозвался: либо его нет, либо браузер молчит.
            settle({ ok: false, reason: 'no-data' });
          } else if (!state.absolute) {
            // Данные есть, но без привязки к сторонам света.
            settle({ ok: false, reason: 'relative-only' });
          } else {
            settle({ ok: true });
          }
        }, SENSOR_TIMEOUT_MS);
      });
    },

    stop() {
      started = false;
      detach();
      clearTimeout(watchdog);
      watchdog = null;
    },

    /** Сброс оценки стабильности — например, после совета отойти от машины. */
    resetQuality() {
      samples = [];
      state.stable = true;
      state.sigma = 0;
    },
  };
}

/** Поворот матрицы вокруг вертикальной оси мира на угол в градусах. */
export function rotateMatrixAboutZ(R, deg) {
  const a = deg * DEG;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Поворот в горизонтальной плоскости ENU: азимут растёт по часовой стрелке,
  // то есть от севера (y) к востоку (x).
  const Rz = [
    [c, s, 0],
    [-s, c, 0],
    [0, 0, 1],
  ];
  const out = [];
  for (let i = 0; i < 3; i++) {
    out.push([
      Rz[i][0] * R[0][0] + Rz[i][1] * R[1][0] + Rz[i][2] * R[2][0],
      Rz[i][0] * R[0][1] + Rz[i][1] * R[1][1] + Rz[i][2] * R[2][1],
      Rz[i][0] * R[0][2] + Rz[i][1] * R[1][2] + Rz[i][2] * R[2][2],
    ]);
  }
  return out;
}
