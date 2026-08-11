/**
 * Превращение чисел в подсказку «куда повернуться».
 *
 * Здесь собраны все пороги и все формулировки основного экрана — чтобы
 * менять поведение навигатора в одном месте, а не искать строки по проекту.
 *
 * Принцип: не требовать попадания в математическую точку. Человек держит
 * телефон в руке, компас телефона врёт на несколько градусов, да и радиант —
 * это область, а не точка. Поэтому работаем зонами.
 */

import { angularSeparation, signedDelta, compassPoint } from './astro.js';

export const ZONES = {
  /** Больше этого — «повернись», грубое наведение. */
  FAR: 30,
  /** От FOUND до FAR — «ещё немного». */
  NEAR: 10,
  /** Попадание: цель считается найденной. */
  FOUND: 10,
  /** Выход из состояния «найдено» — с запасом, чтобы надпись не мигала. */
  FOUND_RELEASE: 14,
};

/**
 * @param {{az:number, alt:number}} target   куда нужно смотреть
 * @param {{heading:number, pitch:number}} device  куда смотрит камера
 * @param {boolean} wasFound  предыдущее состояние — нужно для гистерезиса
 */
export function computeGuidance(target, device, wasFound = false) {
  const deltaAz = signedDelta(device.heading, target.az); // + вправо
  const deltaAlt = target.alt - device.pitch; // + выше
  const separation = angularSeparation(
    device.heading,
    device.pitch,
    target.az,
    target.alt,
  );

  // Гистерезис: войти в «найдено» сложнее, чем удержаться в нём.
  const found = wasFound
    ? separation <= ZONES.FOUND_RELEASE
    : separation <= ZONES.FOUND;

  const horizontal = horizontalHint(deltaAz);
  const vertical = verticalHint(deltaAlt);
  const ordered = orderHints(horizontal, vertical);

  return {
    deltaAz,
    deltaAlt,
    separation,
    found,
    horizontal,
    vertical,
    /** Главная строка на экране. */
    primary: found ? 'Радиант здесь' : (ordered[0]?.text ?? 'Почти на месте'),
    /**
     * Вторая строка — всегда про другую ось, чем первая. Решение о том,
     * что показать, принимается здесь целиком: если его размазать между
     * расчётом и отрисовкой, строки начинают дублировать друг друга.
     */
    secondary: found ? '' : (ordered[1]?.text ?? ''),
  };
}

/**
 * Порядок важности подсказок: сначала то, что промахивается сильнее.
 * При равной грубости первым идёт разворот — промах по азимуту исправить
 * труднее, чем поднять или опустить телефон.
 */
function orderHints(horizontal, vertical) {
  const ordered = [];
  for (const zone of ['far', 'near']) {
    if (horizontal.zone === zone) ordered.push(horizontal);
    if (vertical.zone === zone) ordered.push(vertical);
  }
  return ordered;
}

function horizontalHint(deltaAz) {
  const abs = Math.abs(deltaAz);
  const side = deltaAz > 0 ? 'вправо' : 'влево';
  if (abs < ZONES.NEAR) return { zone: 'ok', text: 'Направление найдено' };
  if (abs < ZONES.FAR)
    return { zone: 'near', text: `Ещё немного ${side}`, side, degrees: abs };
  return {
    zone: 'far',
    text: `Повернись ${side} на ${Math.round(abs)}°`,
    side,
    degrees: abs,
  };
}

function verticalHint(deltaAlt) {
  const abs = Math.abs(deltaAlt);
  const up = deltaAlt > 0;
  if (abs < ZONES.NEAR) return { zone: 'ok', text: 'Высота найдена' };
  if (abs < ZONES.FAR)
    return {
      zone: 'near',
      text: up ? 'Ещё чуть выше' : 'Ещё чуть ниже',
      up,
      degrees: abs,
    };
  return {
    zone: 'far',
    text: up ? 'Подними телефон выше' : 'Опусти телефон ниже',
    up,
    degrees: abs,
  };
}

/**
 * Текст для ручного режима: азимут словами плюс градусы.
 * «Повернись на азимут 47° — северо-восток».
 */
export function manualDirectionText(az) {
  return `Повернись на азимут ${Math.round(az)}° — ${compassPoint(az)}`;
}

/** Описание высоты понятными словами, без астрономического жаргона. */
export function altitudeText(alt) {
  const rounded = Math.round(alt);
  if (rounded < 0) return 'Сейчас радиант ниже горизонта';
  if (rounded < 15) return `Низко над горизонтом, примерно ${rounded}°`;
  if (rounded < 40) return `Примерно ${rounded}° над горизонтом`;
  if (rounded < 70) return `Высоко, примерно ${rounded}° над горизонтом`;
  return `Почти над головой, примерно ${rounded}°`;
}

/**
 * Куда смотреть для самого наблюдения. Радиант — это ориентир, но следы
 * метеоров выглядят длиннее в стороне от него, поэтому предлагаем точку
 * примерно в 50° от радианта.
 *
 * Считать честно приходится потому, что вблизи зенита градусы азимута
 * «сжимаются»: сдвиг на 50° по азимуту на высоте 40° даёт всего 36° по небу.
 * Сначала пробуем увести взгляд выше — там темнее и следы видны лучше, —
 * а если упираемся в зенит, отводим вбок ровно настолько, чтобы получить
 * нужное угловое расстояние.
 */
export const OBSERVING_OFFSET = 50;

export function observingSpot(target, offset = OBSERVING_OFFSET) {
  const MAX_ALT = 80;
  if (target.alt + offset <= MAX_ALT) {
    return { az: normalizeAz(target.az), alt: target.alt + offset };
  }

  // Требуемая разница азимутов для заданного углового расстояния
  // на той же высоте: cos(sep) = sin²(alt) + cos²(alt)·cos(Δaz).
  const rad = Math.PI / 180;
  const sinAlt = Math.sin(target.alt * rad);
  const cosAlt = Math.cos(target.alt * rad);
  const cosDelta =
    (Math.cos(offset * rad) - sinAlt * sinAlt) / (cosAlt * cosAlt);

  if (cosDelta >= -1 && cosDelta <= 1) {
    const delta = Math.acos(cosDelta) / rad;
    return { az: normalizeAz(target.az + delta), alt: target.alt };
  }

  // Так высоко, что нужного расстояния вбок не набрать — уходим вниз.
  return { az: normalizeAz(target.az), alt: target.alt - offset };
}

const normalizeAz = (az) => ((az % 360) + 360) % 360;
