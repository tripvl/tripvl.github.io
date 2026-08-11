/**
 * КОНФИГУРАЦИЯ МЕТЕОРНЫХ ПОТОКОВ.
 *
 * Это единственное место в проекте, где заданы координаты радиантов.
 * Чтобы добавить новый поток, допишите сюда объект — остальной код
 * (расчёт, интерфейс, тексты) подхватит его без изменений.
 *
 * Поля:
 *   id            — ключ, он же значение параметра ?shower=
 *   name          — именительный падеж, «Персеиды»
 *   nameGenitive  — родительный, для «Радиант Персеид здесь»
 *   accusative    — винительный, для кнопки «Найти Персеиды»
 *   ra, dec       — экваториальные координаты радианта В ГРАДУСАХ,
 *                   эпоха J2000.0, на дату максимума
 *   drift         — суточный дрейф радианта, градусов в сутки
 *   peak          — дата максимума (month 1..12), опора для дрейфа
 *   active        — окно активности, строки 'MM-DD'
 *
 * Перевод часов в градусы: RA[°] = (часы + минуты/60) * 15.
 * Например 03h 12.8m → (3 + 12.8/60) * 15 = 48.2°.
 */

export const SHOWERS = {
  perseids: {
    id: 'perseids',
    name: 'Персеиды',
    nameGenitive: 'Персеид',
    accusative: 'Персеиды',
    ra: 48.2, // 03h 12.8m
    dec: 58.1, // +58° 06'
    drift: { ra: 1.35, dec: 0.18 },
    peak: { month: 8, day: 12 },
    active: { from: '07-17', to: '08-24' },
  },

  // Ниже — заготовки для других потоков. Они не показываются по умолчанию,
  // но доступны через ?shower=geminids и служат примером формата.
  geminids: {
    id: 'geminids',
    name: 'Геминиды',
    nameGenitive: 'Геминид',
    accusative: 'Геминиды',
    ra: 112.0, // 07h 28m
    dec: 32.5,
    drift: { ra: 1.02, dec: -0.16 },
    peak: { month: 12, day: 14 },
    active: { from: '12-04', to: '12-20' },
  },

  quadrantids: {
    id: 'quadrantids',
    name: 'Квадрантиды',
    nameGenitive: 'Квадрантид',
    accusative: 'Квадрантиды',
    ra: 230.0, // 15h 20m
    dec: 49.5,
    drift: { ra: 0.8, dec: -0.2 },
    peak: { month: 1, day: 3 },
    active: { from: '12-28', to: '01-12' },
  },

  lyrids: {
    id: 'lyrids',
    name: 'Лириды',
    nameGenitive: 'Лирид',
    accusative: 'Лириды',
    ra: 271.0, // 18h 04m
    dec: 34.0,
    drift: { ra: 1.1, dec: 0.0 },
    peak: { month: 4, day: 22 },
    active: { from: '04-16', to: '04-25' },
  },

  orionids: {
    id: 'orionids',
    name: 'Ориониды',
    nameGenitive: 'Орионид',
    accusative: 'Ориониды',
    ra: 95.0, // 06h 20m
    dec: 15.5,
    drift: { ra: 1.1, dec: 0.1 },
    peak: { month: 10, day: 21 },
    active: { from: '10-02', to: '11-07' },
  },
};

/** Поток, который открывается без параметров в адресе. */
export const DEFAULT_SHOWER = 'perseids';

/** Возвращает поток по идентификатору, с откатом на поток по умолчанию. */
export function getShower(id) {
  return SHOWERS[id] || SHOWERS[DEFAULT_SHOWER];
}
