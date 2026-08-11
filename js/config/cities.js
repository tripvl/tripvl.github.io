/**
 * Города для ручного выбора местоположения.
 *
 * Нужны, когда геолокация недоступна или запрещена. Координаты — центр
 * города; для расчёта положения радианта этого более чем достаточно:
 * сдвиг на десяток километров меняет азимут на доли градуса.
 *
 * Поле tz используется только для подсказки: города с тем же часовым
 * поясом, что и у устройства, показываются первыми. Никаких запросов
 * в сеть и никакой геолокации для этого не требуется.
 */

export const CITIES = [
  { name: 'Москва', lat: 55.7558, lon: 37.6173, tz: 'Europe/Moscow' },
  { name: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351, tz: 'Europe/Moscow' },
  { name: 'Новосибирск', lat: 55.0084, lon: 82.9357, tz: 'Asia/Novosibirsk' },
  { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, tz: 'Asia/Yekaterinburg' },
  { name: 'Казань', lat: 55.7963, lon: 49.1088, tz: 'Europe/Moscow' },
  { name: 'Нижний Новгород', lat: 56.3269, lon: 44.0059, tz: 'Europe/Moscow' },
  { name: 'Челябинск', lat: 55.1644, lon: 61.4368, tz: 'Asia/Yekaterinburg' },
  { name: 'Красноярск', lat: 56.0184, lon: 92.8672, tz: 'Asia/Krasnoyarsk' },
  { name: 'Самара', lat: 53.1959, lon: 50.1002, tz: 'Europe/Samara' },
  { name: 'Уфа', lat: 54.7388, lon: 55.9721, tz: 'Asia/Yekaterinburg' },
  { name: 'Ростов-на-Дону', lat: 47.2357, lon: 39.7015, tz: 'Europe/Moscow' },
  { name: 'Краснодар', lat: 45.0355, lon: 38.9753, tz: 'Europe/Moscow' },
  { name: 'Омск', lat: 54.9885, lon: 73.3242, tz: 'Asia/Omsk' },
  { name: 'Воронеж', lat: 51.672, lon: 39.1843, tz: 'Europe/Moscow' },
  { name: 'Пермь', lat: 58.0105, lon: 56.2502, tz: 'Asia/Yekaterinburg' },
  { name: 'Волгоград', lat: 48.708, lon: 44.5133, tz: 'Europe/Volgograd' },
  { name: 'Саратов', lat: 51.5336, lon: 46.0343, tz: 'Europe/Saratov' },
  { name: 'Тюмень', lat: 57.1522, lon: 65.5272, tz: 'Asia/Yekaterinburg' },
  { name: 'Тольятти', lat: 53.5303, lon: 49.3461, tz: 'Europe/Samara' },
  { name: 'Ижевск', lat: 56.8527, lon: 53.2115, tz: 'Europe/Samara' },
  { name: 'Барнаул', lat: 53.3548, lon: 83.7698, tz: 'Asia/Barnaul' },
  { name: 'Ульяновск', lat: 54.3142, lon: 48.4031, tz: 'Europe/Ulyanovsk' },
  { name: 'Иркутск', lat: 52.287, lon: 104.305, tz: 'Asia/Irkutsk' },
  { name: 'Хабаровск', lat: 48.4827, lon: 135.0838, tz: 'Asia/Vladivostok' },
  { name: 'Владивосток', lat: 43.1198, lon: 131.8869, tz: 'Asia/Vladivostok' },
  { name: 'Ярославль', lat: 57.6261, lon: 39.8845, tz: 'Europe/Moscow' },
  { name: 'Махачкала', lat: 42.9849, lon: 47.5047, tz: 'Europe/Moscow' },
  { name: 'Томск', lat: 56.4846, lon: 84.9476, tz: 'Asia/Tomsk' },
  { name: 'Оренбург', lat: 51.7727, lon: 55.0988, tz: 'Asia/Yekaterinburg' },
  { name: 'Кемерово', lat: 55.3548, lon: 86.0873, tz: 'Asia/Novokuznetsk' },
  { name: 'Новокузнецк', lat: 53.7596, lon: 87.1216, tz: 'Asia/Novokuznetsk' },
  { name: 'Рязань', lat: 54.6295, lon: 39.7415, tz: 'Europe/Moscow' },
  { name: 'Астрахань', lat: 46.3497, lon: 48.0408, tz: 'Europe/Astrakhan' },
  { name: 'Набережные Челны', lat: 55.7436, lon: 52.3958, tz: 'Europe/Moscow' },
  { name: 'Пенза', lat: 53.2007, lon: 45.0046, tz: 'Europe/Moscow' },
  { name: 'Липецк', lat: 52.6031, lon: 39.5708, tz: 'Europe/Moscow' },
  { name: 'Киров', lat: 58.6035, lon: 49.6679, tz: 'Europe/Kirov' },
  { name: 'Чебоксары', lat: 56.1439, lon: 47.2489, tz: 'Europe/Moscow' },
  { name: 'Тула', lat: 54.1961, lon: 37.6182, tz: 'Europe/Moscow' },
  { name: 'Калининград', lat: 54.7104, lon: 20.4522, tz: 'Europe/Kaliningrad' },
  { name: 'Курск', lat: 51.7304, lon: 36.1926, tz: 'Europe/Moscow' },
  { name: 'Улан-Удэ', lat: 51.8335, lon: 107.5841, tz: 'Asia/Irkutsk' },
  { name: 'Ставрополь', lat: 45.0428, lon: 41.9734, tz: 'Europe/Moscow' },
  { name: 'Сочи', lat: 43.5855, lon: 39.7231, tz: 'Europe/Moscow' },
  { name: 'Тверь', lat: 56.8587, lon: 35.9176, tz: 'Europe/Moscow' },
  { name: 'Магнитогорск', lat: 53.4186, lon: 59.0472, tz: 'Asia/Yekaterinburg' },
  { name: 'Иваново', lat: 57.0004, lon: 40.9739, tz: 'Europe/Moscow' },
  { name: 'Брянск', lat: 53.2434, lon: 34.3639, tz: 'Europe/Moscow' },
  { name: 'Белгород', lat: 50.5952, lon: 36.5873, tz: 'Europe/Moscow' },
  { name: 'Сургут', lat: 61.254, lon: 73.3962, tz: 'Asia/Yekaterinburg' },
  { name: 'Владимир', lat: 56.129, lon: 40.407, tz: 'Europe/Moscow' },
  { name: 'Чита', lat: 52.034, lon: 113.4994, tz: 'Asia/Chita' },
  { name: 'Архангельск', lat: 64.5393, lon: 40.5187, tz: 'Europe/Moscow' },
  { name: 'Симферополь', lat: 44.9521, lon: 34.1024, tz: 'Europe/Simferopol' },
  { name: 'Мурманск', lat: 68.9585, lon: 33.0827, tz: 'Europe/Moscow' },
  { name: 'Якутск', lat: 62.0355, lon: 129.6755, tz: 'Asia/Yakutsk' },
  {
    name: 'Петропавловск-Камчатский',
    lat: 53.037,
    lon: 158.6559,
    tz: 'Asia/Kamchatka',
  },
  { name: 'Южно-Сахалинск', lat: 46.9591, lon: 142.738, tz: 'Asia/Sakhalin' },
  { name: 'Благовещенск', lat: 50.2907, lon: 127.5272, tz: 'Asia/Yakutsk' },
  {
    name: 'Комсомольск-на-Амуре',
    lat: 50.5503,
    lon: 137.0079,
    tz: 'Asia/Vladivostok',
  },
  { name: 'Норильск', lat: 69.3558, lon: 88.1893, tz: 'Asia/Krasnoyarsk' },
  { name: 'Нижневартовск', lat: 60.9344, lon: 76.5531, tz: 'Asia/Yekaterinburg' },
  { name: 'Абакан', lat: 53.7156, lon: 91.4292, tz: 'Asia/Krasnoyarsk' },
  { name: 'Находка', lat: 42.8244, lon: 132.8933, tz: 'Asia/Vladivostok' },
  { name: 'Уссурийск', lat: 43.797, lon: 131.9511, tz: 'Asia/Vladivostok' },
  { name: 'Петрозаводск', lat: 61.7849, lon: 34.3469, tz: 'Europe/Moscow' },
  { name: 'Сыктывкар', lat: 61.6688, lon: 50.8365, tz: 'Europe/Moscow' },
  { name: 'Смоленск', lat: 54.7818, lon: 32.0401, tz: 'Europe/Moscow' },
  { name: 'Псков', lat: 57.8194, lon: 28.3324, tz: 'Europe/Moscow' },
  { name: 'Минск', lat: 53.9023, lon: 27.5619, tz: 'Europe/Minsk' },
  { name: 'Киев', lat: 50.4501, lon: 30.5234, tz: 'Europe/Kyiv' },
  { name: 'Алматы', lat: 43.222, lon: 76.8512, tz: 'Asia/Almaty' },
  { name: 'Астана', lat: 51.1694, lon: 71.4491, tz: 'Asia/Almaty' },
  { name: 'Ташкент', lat: 41.2995, lon: 69.2401, tz: 'Asia/Tashkent' },
  { name: 'Баку', lat: 40.4093, lon: 49.8671, tz: 'Asia/Baku' },
  { name: 'Тбилиси', lat: 41.7151, lon: 44.8271, tz: 'Asia/Tbilisi' },
  { name: 'Ереван', lat: 40.1792, lon: 44.4991, tz: 'Asia/Yerevan' },
  { name: 'Бишкек', lat: 42.8746, lon: 74.5698, tz: 'Asia/Bishkek' },
  { name: 'Кишинёв', lat: 47.0105, lon: 28.8638, tz: 'Europe/Chisinau' },
  { name: 'Душанбе', lat: 38.5598, lon: 68.787, tz: 'Asia/Dushanbe' },
  { name: 'Рига', lat: 56.9496, lon: 24.1052, tz: 'Europe/Riga' },
  { name: 'Вильнюс', lat: 54.6872, lon: 25.2797, tz: 'Europe/Vilnius' },
  { name: 'Таллин', lat: 59.437, lon: 24.7536, tz: 'Europe/Tallinn' },
];

/** Приведение к виду, удобному для поиска: нижний регистр, «ё» → «е», без дефисов. */
function foldName(s) {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[-\s]/g, '');
}

/** Часовой пояс устройства — определяется локально, без сети. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Список городов для показа. Без запроса — города текущего часового пояса
 * идут первыми: обычно нужный оказывается в первой пятёрке.
 */
export function searchCities(query, limit = 40) {
  const q = foldName(query || '');
  const tz = deviceTimeZone();

  const matched = q
    ? CITIES.filter((c) => foldName(c.name).includes(q))
    : CITIES.slice();

  if (!q) {
    matched.sort((a, b) => {
      const byTz = Number(b.tz === tz) - Number(a.tz === tz);
      return byTz || a.name.localeCompare(b.name, 'ru');
    });
  } else {
    // При поиске важнее совпадение с начала названия.
    matched.sort((a, b) => {
      const aStarts = foldName(a.name).startsWith(q);
      const bStarts = foldName(b.name).startsWith(q);
      return Number(bStarts) - Number(aStarts) || a.name.localeCompare(b.name, 'ru');
    });
  }

  return matched.slice(0, limit);
}

/** Города текущего часового пояса — для подписи «возможно, рядом». */
export function citiesInDeviceTimeZone() {
  const tz = deviceTimeZone();
  return tz ? CITIES.filter((c) => c.tz === tz) : [];
}
