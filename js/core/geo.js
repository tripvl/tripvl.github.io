/**
 * Местоположение наблюдателя.
 *
 * Три источника, в порядке предпочтения:
 *   1) Geolocation API,
 *   2) город, выбранный пользователем вручную,
 *   3) сохранённый результат прошлого запуска.
 *
 * Координаты никуда не отправляются: всё, что здесь происходит, остаётся
 * в памяти вкладки и в localStorage на самом устройстве.
 */

const STORAGE_KEY = 'perseids.position';

/**
 * Свой таймаут поверх штатного. Опции geolocation в некоторых браузерах
 * (заметнее всего в Safari) умеют не сработать вовсе: запрос просто
 * повисает и колбэк не вызывается ни разу. Оставлять пользователя перед
 * крутящимся индикатором нельзя, поэтому ограничиваем ожидание сами.
 */
const TIMEOUT_MS = 12000;

/** Насколько долго сохранённые координаты считаются пригодными. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const POSITION_SOURCE = {
  GPS: 'gps',
  MANUAL: 'manual',
  CACHE: 'cache',
  DEBUG: 'debug',
};

export function isSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Текущее разрешение на геолокацию, если браузер умеет об этом рассказать.
 * Permissions API поддержан не везде (в Safari его нет), поэтому ответ
 * 'unknown' — нормальная ситуация, а не ошибка.
 */
export async function permissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const res = await navigator.permissions.query({ name: 'geolocation' });
    return res.state; // granted | denied | prompt
  } catch {
    return 'unknown';
  }
}

/**
 * Запрос координат.
 * @returns {Promise<{ok:true, position:object} | {ok:false, reason:string}>}
 *          reason: 'unsupported' | 'denied' | 'unavailable' | 'timeout'
 */
export function requestPosition({ timeout = TIMEOUT_MS } = {}) {
  if (!isSupported()) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeout);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: POSITION_SOURCE.GPS,
          at: Date.now(),
        };
        save(position);
        finish({ ok: true, position });
      },
      (err) => {
        const reason =
          err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        finish({ ok: false, reason });
      },
      {
        enableHighAccuracy: true,
        timeout,
        // Свежие координаты не нужны: небо не сдвинется от того, что человек
        // прошёл сто метров. Готовы принять и получасовой результат.
        maximumAge: 30 * 60 * 1000,
      },
    );
  });
}

/** Позиция из выбранного города. */
export function positionFromCity(city) {
  const position = {
    lat: city.lat,
    lon: city.lon,
    accuracy: null,
    city: city.name,
    source: POSITION_SOURCE.MANUAL,
    at: Date.now(),
  };
  save(position);
  return position;
}

export function save(position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Приватный режим или переполненное хранилище — не повод ломать сценарий.
  }
}

/** Сохранённая позиция, если она ещё не протухла. */
export function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lon)) return null;
    if (p.source === POSITION_SOURCE.GPS && Date.now() - (p.at || 0) > CACHE_TTL_MS) {
      // Устаревшие координаты со спутника лучше перепросить, а выбранный
      // руками город — оставить: человек сам его назвал.
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function forget() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ничего страшного */
  }
}

/** Короткая подпись об источнике координат для интерфейса. */
export function describeSource(position) {
  if (!position) return '';
  switch (position.source) {
    case POSITION_SOURCE.GPS:
      return 'по GPS';
    case POSITION_SOURCE.MANUAL:
      return position.city ? `город: ${position.city}` : 'город выбран вручную';
    case POSITION_SOURCE.CACHE:
      return 'прошлый запуск';
    case POSITION_SOURCE.DEBUG:
      return 'debug';
    default:
      return '';
  }
}
