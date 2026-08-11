/**
 * Астрономические вычисления.
 *
 * Модуль намеренно чистый: никакого DOM, никакого «текущего времени» внутри.
 * Время всегда приходит параметром — иначе функции невозможно протестировать.
 *
 * Соглашения о координатах (действуют во всём проекте):
 *   - широта  lat: градусы, север положительный;
 *   - долгота lon: градусы, ВОСТОК ПОЛОЖИТЕЛЬНЫЙ (как в Geolocation API);
 *   - азимут  az:  градусы, 0 = север, 90 = восток (по часовой стрелке);
 *   - высота  alt: градусы, 0 = горизонт, +90 = зенит.
 *
 * Источник формул — J. Meeus, «Astronomical Algorithms», 2-е изд.
 */

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

const sin = (d) => Math.sin(d * DEG);
const cos = (d) => Math.cos(d * DEG);
const tan = (d) => Math.tan(d * DEG);

/** Приводит угол к диапазону [0, 360). */
export function normalizeDeg(deg) {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

/**
 * Кратчайшая знаковая разница углов: to - from в диапазоне (-180, 180].
 * Положительное значение = цель правее (по часовой стрелке).
 */
export function signedDelta(from, to) {
  let d = normalizeDeg(to - from);
  if (d > 180) d -= 360;
  return d;
}

/** Юлианская дата для момента времени (по UTC). */
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Юлианские столетия от эпохи J2000.0. */
export function centuriesJ2000(jd) {
  return (jd - 2451545.0) / 36525;
}

/**
 * Среднее гринвичское звёздное время в градусах (Meeus, формула 12.4).
 * Точности этой формулы (доли угловой секунды на масштабе десятилетий)
 * с огромным запасом хватает для наведения телефона.
 */
export function gmstDeg(date) {
  const jd = julianDay(date);
  const d = jd - 2451545.0;
  const t = d / 36525;
  const theta =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  return normalizeDeg(theta);
}

/** Местное звёздное время в градусах. */
export function lmstDeg(date, lonEast) {
  return normalizeDeg(gmstDeg(date) + lonEast);
}

/**
 * Прецессия экваториальных координат из эпохи J2000.0 на дату наблюдения
 * (Meeus, гл. 21, углы ζ, z, θ по IAU 1976).
 *
 * За четверть века набегает около 0.35° — это уже сопоставимо с точностью
 * наведения, поэтому поправку имеет смысл учитывать.
 */
export function precessFromJ2000(raDeg, decDeg, date) {
  const t = centuriesJ2000(julianDay(date));
  // Углы даны в секундах дуги.
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) / 3600;
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) / 3600;
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) / 3600;

  const a = cos(decDeg) * sin(raDeg + zeta);
  const b =
    cos(theta) * cos(decDeg) * cos(raDeg + zeta) - sin(theta) * sin(decDeg);
  const c =
    sin(theta) * cos(decDeg) * cos(raDeg + zeta) + cos(theta) * sin(decDeg);

  return {
    ra: normalizeDeg(Math.atan2(a, b) * RAD + z),
    dec: Math.asin(Math.max(-1, Math.min(1, c))) * RAD,
  };
}

/**
 * Экваториальные координаты → горизонтальные.
 *
 * @param {{ra:number, dec:number}} eq  RA/Dec в градусах, эпоха даты
 * @param {{lat:number, lon:number}} observer
 * @param {Date} date
 * @returns {{az:number, alt:number, hourAngle:number}}
 */
export function equatorialToHorizontal(eq, observer, date) {
  const lst = lmstDeg(date, observer.lon);
  const h = normalizeDeg(lst - eq.ra); // часовой угол
  const phi = observer.lat;

  const altRad = Math.asin(
    Math.max(
      -1,
      Math.min(1, sin(eq.dec) * sin(phi) + cos(eq.dec) * cos(phi) * cos(h)),
    ),
  );

  // Meeus 13.5 даёт азимут от ЮГА к западу; переводим в азимут от севера.
  const azFromSouth =
    Math.atan2(sin(h), cos(h) * sin(phi) - tan(eq.dec) * cos(phi)) * RAD;

  return {
    az: normalizeDeg(azFromSouth + 180),
    alt: altRad * RAD,
    hourAngle: h,
  };
}

/**
 * Обратное преобразование — нужно только тестам, но пусть живёт рядом.
 */
export function horizontalToEquatorial({ az, alt }, observer, date) {
  const phi = observer.lat;
  const azFromSouth = az - 180;

  const decRad = Math.asin(
    Math.max(
      -1,
      Math.min(1, sin(alt) * sin(phi) - cos(alt) * cos(phi) * cos(azFromSouth)),
    ),
  );
  const h =
    Math.atan2(
      sin(azFromSouth),
      cos(azFromSouth) * sin(phi) + tan(alt) * cos(phi),
    ) * RAD;

  return {
    ra: normalizeDeg(lmstDeg(date, observer.lon) - h),
    dec: decRad * RAD,
  };
}

/**
 * Угол между двумя направлениями, заданными азимутом и высотой.
 * Считаем через скалярное произведение единичных векторов — устойчиво везде,
 * включая зенит и переход через север.
 */
export function angularSeparation(az1, alt1, az2, alt2) {
  const dot =
    sin(alt1) * sin(alt2) + cos(alt1) * cos(alt2) * cos(signedDelta(az1, az2));
  return Math.acos(Math.max(-1, Math.min(1, dot))) * RAD;
}

/**
 * Единичный вектор направления в системе ENU (x — восток, y — север, z — вверх).
 */
export function azAltToVector(az, alt) {
  return {
    x: cos(alt) * sin(az),
    y: cos(alt) * cos(az),
    z: sin(alt),
  };
}

/** Обратно из ENU-вектора в азимут/высоту. */
export function vectorToAzAlt(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  const z = Math.max(-1, Math.min(1, v.z / len));
  return {
    az: normalizeDeg(Math.atan2(v.x, v.y) * RAD),
    alt: Math.asin(z) * RAD,
  };
}

/**
 * Экваториальные координаты радианта потока на конкретную дату.
 *
 * Радиант не стоит на месте: за сутки он смещается по небу примерно на градус
 * (Земля движется по орбите, и направление, с которого прилетают частицы,
 * медленно меняется). Поэтому берём опорные координаты на дату максимума
 * из конфигурации потока и добавляем суточный дрейф.
 *
 * @param {object} shower  запись из js/config/showers.js
 * @param {Date} date
 * @returns {{ra:number, dec:number, daysFromPeak:number}} координаты на эпоху даты
 */
export function radiantAt(shower, date) {
  const days = daysFromPeak(shower, date);
  const drift = shower.drift || { ra: 0, dec: 0 };

  const j2000 = {
    ra: normalizeDeg(shower.ra + drift.ra * days),
    dec: Math.max(-90, Math.min(90, shower.dec + drift.dec * days)),
  };

  const ofDate = precessFromJ2000(j2000.ra, j2000.dec, date);
  return { ...ofDate, daysFromPeak: days };
}

/**
 * Сколько суток прошло от максимума потока (отрицательное — до максимума).
 * Максимум привязан к дню года, поэтому берём ближайший по времени год —
 * иначе в начале января расчёт для декабрьского потока уехал бы на год.
 */
export function daysFromPeak(shower, date) {
  const year = date.getUTCFullYear();
  let best = null;
  for (const y of [year - 1, year, year + 1]) {
    const peak = Date.UTC(y, shower.peak.month - 1, shower.peak.day, 12);
    const diff = (date.getTime() - peak) / 86400000;
    if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
  }
  return best;
}

/**
 * Активен ли поток в эту дату. Окно задаётся строками 'MM-DD' и может
 * пересекать новый год (как у Квадрантид).
 */
export function isShowerActive(shower, date) {
  if (!shower.active) return true;
  const md = (s) => {
    const [m, d] = s.split('-').map(Number);
    return m * 100 + d;
  };
  const now = (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const from = md(shower.active.from);
  const to = md(shower.active.to);
  return from <= to ? now >= from && now <= to : now >= from || now <= to;
}

const COMPASS_POINTS = [
  'север',
  'северо-северо-восток',
  'северо-восток',
  'востоко-северо-восток',
  'восток',
  'востоко-юго-восток',
  'юго-восток',
  'юго-юго-восток',
  'юг',
  'юго-юго-запад',
  'юго-запад',
  'западо-юго-запад',
  'запад',
  'западо-северо-запад',
  'северо-запад',
  'северо-северо-запад',
];

/** Словесный румб по азимуту — «северо-восток» понятнее, чем «47°». */
export function compassPoint(az) {
  const i = Math.round(normalizeDeg(az) / 22.5) % 16;
  return COMPASS_POINTS[i];
}

/** Короткая форма румба для компактных мест интерфейса. */
export function compassPointShort(az) {
  const short = ['С', 'ССВ', 'СВ', 'ВСВ', 'В', 'ВЮВ', 'ЮВ', 'ЮЮВ', 'Ю', 'ЮЮЗ', 'ЮЗ', 'ЗЮЗ', 'З', 'ЗСЗ', 'СЗ', 'ССЗ'];
  const i = Math.round(normalizeDeg(az) / 22.5) % 16;
  return short[i];
}
