/**
 * Состояния интерфейса и переходы между ними.
 *
 * Главное правило: ни один отказ не заводит в тупик. Что бы ни случилось
 * с разрешениями и датчиками, пользователь оказывается на экране, где ему
 * есть что делать. Поэтому состояние не «набирается» из разрозненных if,
 * а один раз выводится из набора фактов о мире функцией resolve().
 *
 * Соответствие списку состояний из задания:
 *   1. Старт                        → START
 *   2. Запрос разрешений            → PERMISSIONS
 *   3. Определение местоположения   → LOCATING
 *   4. AR-карта и наведение        → AIMING
 *   6. Только GPS, без компаса      → GPS_ONLY
 *   7. Только выбранный город       → MANUAL_CITY
 *   8. Нет разрешений               → NO_PERMISSION
 *   9. Ошибка/отсутствие датчиков   → NO_SENSORS
 *  10. Компас нестабилен            → COMPASS_UNSTABLE
 *
 * Плюс два вспомогательных экрана, без которых восьмое и девятое состояния
 * оказались бы тупиковыми: NO_LOCATION (координаты не получены — предлагаем
 * повтор или город) и CITY_PICKER (собственно выбор города).
 */

export const STATES = {
  START: 'start',
  PERMISSIONS: 'permissions',
  LOCATING: 'locating',
  AIMING: 'aiming',
  GPS_ONLY: 'gps-only',
  MANUAL_CITY: 'manual-city',
  NO_PERMISSION: 'no-permission',
  NO_SENSORS: 'no-sensors',
  COMPASS_UNSTABLE: 'compass-unstable',
  NO_LOCATION: 'no-location',
  CITY_PICKER: 'city-picker',
};

/** Какой раздел разметки показывать для каждого состояния. */
export const SCREEN_FOR_STATE = {
  [STATES.START]: 'screen-start',
  [STATES.PERMISSIONS]: 'screen-permissions',
  [STATES.LOCATING]: 'screen-locating',
  [STATES.AIMING]: 'screen-aiming',
  [STATES.COMPASS_UNSTABLE]: 'screen-aiming',
  [STATES.GPS_ONLY]: 'screen-manual',
  [STATES.MANUAL_CITY]: 'screen-manual',
  [STATES.NO_SENSORS]: 'screen-manual',
  [STATES.NO_PERMISSION]: 'screen-no-location',
  [STATES.NO_LOCATION]: 'screen-no-location',
  [STATES.CITY_PICKER]: 'screen-cities',
};

/** Состояние компаса как источника данных. */
export const COMPASS = {
  UNKNOWN: 'unknown',
  OK: 'ok',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  NO_DATA: 'no-data',
  /** Датчик отвечает, но не знает, где север, — как компаса нет. */
  RELATIVE_ONLY: 'relative-only',
};

export function createStore() {
  const listeners = new Set();

  const ctx = {
    /** Нажата ли главная кнопка. */
    started: false,
    /** Идёт запрос разрешений. */
    askingPermissions: false,
    /** Идёт определение координат. */
    locating: false,
    /** Пробовали ли уже получить координаты (чтобы отличить «ещё ищем»). */
    triedLocation: false,
    /** Открыт ли выбор города — экран поверх остальной логики. */
    pickingCity: false,

    position: null,
    /** 'unknown' | 'granted' | 'denied' | 'prompt' */
    geoPermission: 'unknown',
    /** Почему не получили координаты: 'denied' | 'timeout' | 'unavailable' | 'unsupported' */
    geoFailure: null,

    compass: COMPASS.UNKNOWN,
    compassStable: true,
    /**
     * Пользователь сам попросил инструкцию под системный компас, хотя
     * датчики работают. Держим отдельно от compass: иначе пришедшие
     * данные датчика тут же вернули бы его на экран со стрелкой.
     */
    forcedManual: false,

    target: null,
    guidance: null,
    shower: null,
  };

  let current = STATES.START;

  function resolve() {
    if (ctx.pickingCity) return STATES.CITY_PICKER;
    if (!ctx.started) return STATES.START;
    if (ctx.askingPermissions) return STATES.PERMISSIONS;

    if (!ctx.position) {
      if (ctx.locating) return STATES.LOCATING;
      if (!ctx.triedLocation) return STATES.LOCATING;
      // Координат нет. Различаем отказ и неудачу — от этого зависит текст,
      // но выход в обоих случаях один: повторить или выбрать город.
      return ctx.geoFailure === 'denied'
        ? STATES.NO_PERMISSION
        : STATES.NO_LOCATION;
    }

    // Координаты есть. Дальше всё решает наличие рабочего компаса.
    const manualScreen =
      ctx.position.source === 'manual' ? STATES.MANUAL_CITY : STATES.GPS_ONLY;

    // Человек сам выбрал инструкцию вместо стрелки — уважаем выбор.
    if (ctx.forcedManual) return manualScreen;

    const compassWorks = ctx.compass === COMPASS.OK;

    if (!compassWorks) {
      if (ctx.compass === COMPASS.UNKNOWN) return STATES.LOCATING;
      if (
        ctx.compass === COMPASS.UNSUPPORTED ||
        ctx.compass === COMPASS.NO_DATA ||
        ctx.compass === COMPASS.RELATIVE_ONLY
      ) {
        // Датчиков нет или они молчат — но координаты есть, значит
        // рабочая инструкция под системный компас всё равно будет.
        return manualScreen === STATES.GPS_ONLY ? STATES.NO_SENSORS : manualScreen;
      }
      // Отказ в доступе к датчикам.
      return manualScreen;
    }

    if (!ctx.compassStable) return STATES.COMPASS_UNSTABLE;
    return STATES.AIMING;
  }

  function notify() {
    const next = resolve();
    const changed = next !== current;
    current = next;
    for (const cb of listeners) cb(current, ctx, changed);
  }

  return {
    get state() {
      return current;
    },
    get context() {
      return ctx;
    },

    subscribe(cb) {
      listeners.add(cb);
      cb(current, ctx, true);
      return () => listeners.delete(cb);
    },

    /**
     * Единственный способ поменять состояние: сообщить новые факты о мире.
     * Само состояние выводится из них, а не назначается вручную.
     */
    update(patch) {
      Object.assign(ctx, patch);
      notify();
    },

    /** Пересчитать состояние без изменения фактов (например, по тику часов). */
    refresh() {
      notify();
    },
  };
}

/**
 * Человеческое объяснение, почему мы оказались без координат.
 * Технических формулировок здесь нет и быть не должно.
 */
export function locationFailureText(failure) {
  switch (failure) {
    case 'denied':
      return 'Доступ к местоположению не разрешён. Ничего страшного — можно просто выбрать город, и мы посчитаем всё для него.';
    case 'unsupported':
      return 'Этот браузер не умеет определять местоположение. Выберите город из списка — расчёт будет таким же точным.';
    case 'timeout':
      return 'Местоположение определяется слишком долго. Можно попробовать ещё раз или выбрать город.';
    default:
      return 'Без координат положение радианта не посчитать. Можно попробовать ещё раз или просто выбрать город.';
  }
}

/** Заголовок экрана без координат. */
export function locationFailureTitle(failure) {
  return failure === 'denied'
    ? 'Нужно знать, где вы находитесь'
    : 'Не получилось определить ваше местоположение';
}

/** Почему нет стрелки — коротко и без слов «permission» и «sensor». */
export function compassFailureText(compass) {
  switch (compass) {
    case COMPASS.DENIED:
      return 'Доступ к датчикам не разрешён, поэтому стрелку показать не получится. Зато направление можно взять по обычному компасу.';
    case COMPASS.UNSUPPORTED:
    case COMPASS.NO_DATA:
      return 'Этот телефон или браузер не отдаёт данные компаса. Направление можно взять по обычному компасу — всё уже посчитано.';
    case COMPASS.RELATIVE_ONLY:
      return 'Телефон сообщает наклон, но не знает, где север. Возьмите направление по обычному компасу — всё уже посчитано.';
    default:
      return 'Направление можно взять по обычному компасу — всё уже посчитано.';
  }
}
