/**
 * Режим отладки: ?debug=1
 *
 * Показывает всё, из чего складывается расчёт, и позволяет подменить
 * координаты, время и показания «компаса». Благодаря этому весь сценарий,
 * включая наведение, проверяется на обычном компьютере без датчиков:
 * heading и pitch крутятся мышью или стрелками на клавиатуре.
 *
 * Параметры адреса:
 *   ?debug=1
 *   &lat=43.1198&lon=131.8869      координаты наблюдателя
 *   &t=2026-08-12T13:00Z           момент времени (ISO)
 *   &heading=47&pitch=52           куда «направлен» телефон
 *   &shower=perseids               какой поток считать
 */

/**
 * Число или null. Пустую строку и отсутствующий параметр обязательно
 * отсекаем до Number(): Number(null) и Number('') дают 0, и незаполненное
 * поле превратилось бы во вполне валидные координаты 0°, 0°.
 */
const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function createDebug() {
  const params = new URLSearchParams(location.search);
  const enabled = params.get('debug') === '1';

  const overrides = {
    lat: num(params.get('lat')),
    lon: num(params.get('lon')),
    time: params.get('t') ? new Date(params.get('t')) : null,
    heading: num(params.get('heading')),
    pitch: num(params.get('pitch')),
  };
  if (overrides.time && Number.isNaN(overrides.time.getTime())) {
    overrides.time = null;
  }

  const listeners = new Set();
  const emit = () => {
    for (const cb of listeners) cb(overrides);
  };

  const panel = document.getElementById('debug');
  const el = {
    panel,
    values: document.getElementById('debug-values'),
    lat: document.getElementById('dbg-lat'),
    lon: document.getElementById('dbg-lon'),
    time: document.getElementById('dbg-time'),
    heading: document.getElementById('dbg-heading'),
    pitch: document.getElementById('dbg-pitch'),
    apply: document.getElementById('dbg-apply'),
    clear: document.getElementById('dbg-clear'),
    collapse: document.getElementById('debug-collapse'),
  };

  function fillInputs() {
    if (overrides.lat !== null) el.lat.value = overrides.lat;
    if (overrides.lon !== null) el.lon.value = overrides.lon;
    if (overrides.heading !== null) el.heading.value = Math.round(overrides.heading);
    if (overrides.pitch !== null) el.pitch.value = Math.round(overrides.pitch);
    if (overrides.time) {
      const d = overrides.time;
      const pad = (n) => String(n).padStart(2, '0');
      el.time.value =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  function readInputs() {
    overrides.lat = num(el.lat.value);
    overrides.lon = num(el.lon.value);
    overrides.heading = num(el.heading.value);
    overrides.pitch = num(el.pitch.value);
    const t = el.time.value ? new Date(el.time.value) : null;
    overrides.time = t && !Number.isNaN(t.getTime()) ? t : null;
    emit();
  }

  /**
   * Управление «телефоном» на компьютере: перетаскивание мышью и стрелки.
   * Один градус на пиксель по горизонтали — удобно попадать в цель.
   */
  function attachDesktopControls() {
    let dragging = false;
    let last = null;

    const ensureStart = () => {
      if (overrides.heading === null) overrides.heading = 0;
      if (overrides.pitch === null) overrides.pitch = 30;
    };

    const onDown = (e) => {
      // Не перехватываем нажатия на кнопки и поля — иначе ими не пользоваться.
      if (e.target.closest('button, input, a, summary, .debug')) return;
      dragging = true;
      last = { x: e.clientX, y: e.clientY };
    };

    const onMove = (e) => {
      if (!dragging || !last) return;
      ensureStart();
      overrides.heading = (overrides.heading + (e.clientX - last.x) * 0.5 + 360) % 360;
      overrides.pitch = Math.max(
        -90,
        Math.min(90, overrides.pitch - (e.clientY - last.y) * 0.5),
      );
      last = { x: e.clientX, y: e.clientY };
      el.heading.value = Math.round(overrides.heading);
      el.pitch.value = Math.round(overrides.pitch);
      emit();
    };

    const onUp = () => {
      dragging = false;
      last = null;
    };

    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    window.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 2;
      const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (!keys.includes(e.key)) return;
      if (e.target.matches('input')) return;
      e.preventDefault();
      ensureStart();
      if (e.key === 'ArrowLeft') overrides.heading = (overrides.heading - step + 360) % 360;
      if (e.key === 'ArrowRight') overrides.heading = (overrides.heading + step) % 360;
      if (e.key === 'ArrowUp') overrides.pitch = Math.min(90, overrides.pitch + step);
      if (e.key === 'ArrowDown') overrides.pitch = Math.max(-90, overrides.pitch - step);
      el.heading.value = Math.round(overrides.heading);
      el.pitch.value = Math.round(overrides.pitch);
      emit();
    });
  }

  if (enabled && panel) {
    panel.hidden = false;
    document.body.classList.add('has-debug');
    fillInputs();
    el.apply.addEventListener('click', readInputs);
    el.clear.addEventListener('click', () => {
      for (const key of ['lat', 'lon', 'heading', 'pitch', 'time']) {
        overrides[key] = null;
        if (el[key]) el[key].value = '';
      }
      emit();
    });
    el.collapse.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('debug--collapsed');
      el.collapse.textContent = collapsed ? 'развернуть' : 'свернуть';
      document.body.classList.toggle('has-debug', !collapsed);
    });
    attachDesktopControls();
  }

  return {
    enabled,
    overrides,
    params,

    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },

    /** Есть ли подмена показаний компаса — тогда наведение работает и без датчиков. */
    hasOrientationOverride() {
      return overrides.heading !== null || overrides.pitch !== null;
    },

    hasPositionOverride() {
      return overrides.lat !== null && overrides.lon !== null;
    },

    /** Текущее время с учётом подмены. */
    now() {
      return overrides.time ? new Date(overrides.time) : new Date();
    },

    /** Свод всех значений для панели. */
    render(info) {
      if (!enabled || !el.values) return;
      const f = (v, digits = 2) =>
        v === null || v === undefined || Number.isNaN(v)
          ? '—'
          : typeof v === 'number'
            ? v.toFixed(digits)
            : String(v);

      el.values.textContent = [
        `состояние      ${info.state}`,
        `поток          ${info.shower}`,
        ``,
        `широта         ${f(info.lat, 4)}`,
        `долгота        ${f(info.lon, 4)}`,
        `источник       ${info.positionSource || '—'}`,
        `точность       ${info.accuracy === null ? '—' : f(info.accuracy, 0) + ' м'}`,
        ``,
        `время          ${info.timeLocal}`,
        `UTC            ${info.timeUtc}`,
        ``,
        `радиант RA     ${f(info.ra, 3)}°`,
        `радиант Dec    ${f(info.dec, 3)}°`,
        `азимут цели    ${f(info.targetAz)}°`,
        `высота цели    ${f(info.targetAlt)}°`,
        ``,
        `heading        ${f(info.heading)}°`,
        `pitch          ${f(info.pitch)}°`,
        `heading сырой  ${f(info.headingRaw)}° (магнитный)`,
        `источник       ${info.headingSource || '—'}`,
        `yawOffset      ${f(info.yawOffset)}°`,
        `склонение      ${f(info.declination)}° (${info.magneticModel})`,
        ``,
        `до цели        ${f(info.separation)}°`,
        `Δ азимут       ${f(info.deltaAz)}°`,
        `Δ высота       ${f(info.deltaAlt)}°`,
        ``,
        `камера         ${info.camera}`,
        `кадр           ${info.cameraFrame || '—'}`,
        `угол камеры    ${f(info.cameraFov, 0)}° (?fov=)`,
        `видно на экране ${
          info.visibleFov
            ? `${f(info.visibleFov.horizontal, 0)}°×${f(info.visibleFov.vertical, 0)}°`
            : '—'
        }`,
        `метка          ${
          info.markerOnScreen === null
            ? '—'
            : info.markerOnScreen
              ? `${f(info.markerX, 0)}, ${f(info.markerY, 0)}`
              : 'вне кадра'
        }`,
        `созвездий в кадре ${f(info.visibleConstellations, 0)}`,
        `Canvas FPS     ${f(info.fps, 0)}`,
        ``,
        `разрешение gps ${info.geoPermission}`,
        `разрешение датчиков ${info.orientationPermission}`,
        `компас         ${info.compass}`,
        `стабильность   ${info.stable ? 'ок' : 'дрожит'} (σ ${f(info.sigma, 1)}°)`,
        `частота        ${f(info.rate, 1)} Гц`,
      ].join('\n');
    },
  };
}
