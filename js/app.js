/**
 * Точка входа: связывает расчёт, датчики, состояние и отрисовку.
 *
 * Логика здесь только координирующая. Всё содержательное лежит в модулях:
 *   core/astro.js       — где на небе радиант
 *   core/magnetic.js    — поправка компаса на магнитное склонение
 *   core/geo.js         — где наблюдатель
 *   core/orientation.js — куда направлен телефон
 *   core/guidance.js    — что сказать пользователю
 *   core/sky-map.js     — геометрия небесного купола и указателя
 *   ui/state.js         — в каком мы состоянии
 *   ui/render.js        — как это выглядит
 *   ui/sky-canvas.js    — отрисовка карты в Canvas 2D
 */

import { getShower, DEFAULT_SHOWER } from './config/showers.js';
import {
  radiantAt,
  equatorialToHorizontal,
  isShowerActive,
} from './core/astro.js';
import { MODEL_INFO } from './core/magnetic.js';
import {
  requestPosition,
  positionFromCity,
  loadSaved,
  permissionState,
  POSITION_SOURCE,
} from './core/geo.js';
import {
  createOrientationTracker,
  matrixFromHeadingPitch,
  HEADING_SOURCE,
} from './core/orientation.js';
import { computeGuidance } from './core/guidance.js';
import { createCamera } from './core/camera.js';
import {
  computeFocalLength,
  computeMapFocalLength,
  visibleFieldOfView,
  DEFAULT_CAMERA_FOV,
} from './core/projection.js';
import { buildSkyDome, projectSkyDome, targetNavigation } from './core/sky-map.js';
import { createStore, STATES, COMPASS } from './ui/state.js';
import { createRenderer } from './ui/render.js';
import { drawSkyScene } from './ui/sky-canvas.js';
import { createDebug } from './ui/debug.js';

const debug = createDebug();
const shower = getShower(debug.params.get('shower') || DEFAULT_SHOWER);
const store = createStore();
const ui = createRenderer();
const orientation = createOrientationTracker();
const camera = createCamera();

let cityQuery = '';
/** Поле зрения камеры: в debug его можно подкрутить под конкретный телефон. */
let cameraFov = Number(debug.params.get('fov')) || DEFAULT_CAMERA_FOV;
let lastProjection = null;
let lastView = null;
let lastScene = null;
let skyDome = null;
let skyDomeSecond = null;
let skyDomePositionKey = null;
let targetAligned = false;
let fps = 0;
let framesSinceSample = 0;
let fpsSampleAt = performance.now();

/* ------------------------------------------------------------------ */
/* Данные                                                              */
/* ------------------------------------------------------------------ */

/** Время расчёта: обычное текущее либо подменённое в debug. */
const now = () => debug.now();

/**
 * Координаты наблюдателя. Отладочная подмена не живёт отдельной жизнью,
 * а записывается в состояние через syncDebugPosition() — иначе экран
 * и расчёт разъезжаются: расчёт видит координаты, а состояние их не видит.
 */
function effectivePosition() {
  return store.context.position;
}

/** Переносит отладочные координаты в состояние приложения. */
function syncDebugPosition() {
  if (!debug.hasPositionOverride()) return false;
  const position = {
    lat: debug.overrides.lat,
    lon: debug.overrides.lon,
    accuracy: null,
    source: POSITION_SOURCE.DEBUG,
  };
  orientation.setPosition(position);
  store.update({
    position,
    started: true,
    locating: false,
    triedLocation: true,
    geoFailure: null,
  });
  return true;
}

/** Куда сейчас смотрит телефон: настоящие датчики либо подмена. */
function effectiveOrientation() {
  const sensors = orientation.getState();
  if (debug.hasOrientationOverride()) {
    const heading = debug.overrides.heading ?? sensors.heading ?? 0;
    const pitch = debug.overrides.pitch ?? sensors.pitch ?? 0;
    return {
      heading,
      pitch,
      matrix: matrixFromHeadingPitch(heading, pitch),
      source: 'debug',
      stable: true,
      sigma: 0,
      rate: 0,
      headingRaw: heading,
      yawOffset: 0,
      declination: 0,
      permission: sensors.permission,
    };
  }
  return sensors;
}

/** Положение радианта на небе для текущих координат и времени. */
function computeTarget() {
  const position = effectivePosition();
  if (!position) return null;
  const date = now();
  const radiant = radiantAt(shower, date);
  const horizontal = equatorialToHorizontal(radiant, position, date);
  return { ...horizontal, ra: radiant.ra, dec: radiant.dec };
}

/* ------------------------------------------------------------------ */
/* Основной цикл                                                       */
/* ------------------------------------------------------------------ */

/**
 * Кадровый цикл — только для экрана наведения: весь купол и стрелка должны идти плавно.
 * Всё остальное обновляется по таймеру, см. startLoops().
 */
function tick() {
  requestAnimationFrame(tick);
  if (document.hidden) return;

  const state = store.state;
  if (state !== STATES.AIMING && state !== STATES.COMPASS_UNSTABLE) {
    return;
  }
  update();
}

function startLoops() {
  requestAnimationFrame(tick);
  // Страховка: requestAnimationFrame не вызывается, пока вкладка скрыта,
  // и может тормозиться браузером. Секундного таймера достаточно, чтобы
  // числа на всех экранах оставались верными в любом случае.
  setInterval(() => {
    if (!document.hidden) update();
  }, 1000);
}

function update() {
  const ctx = store.context;
  const target = computeTarget();
  const sensors = effectiveOrientation();

  if (target) ctx.target = target;

  // Наводить есть куда только когда известны и цель, и направление телефона.
  // Проверяем через isFinite: null, undefined и случайный NaN от датчика
  // одинаково означают «данных нет», и рисовать по ним ничего нельзя.
  if (target && Number.isFinite(sensors.heading) && Number.isFinite(sensors.pitch)) {
    const guidance = computeGuidance(
      target,
      { heading: sensors.heading, pitch: sensors.pitch },
      targetAligned,
    );
    targetAligned = target.alt >= 0 && guidance.found;
    ctx.guidance = guidance;
    if (ctx.compassStable !== sensors.stable) {
      store.update({ compassStable: sensors.stable });
    }
  }

  render();
}

/** Экраны, на которых живёт карта неба. */
const SKY_STATES = [STATES.AIMING, STATES.COMPASS_UNSTABLE];

function render() {
  const ctx = store.context;
  const state = store.state;
  const target = ctx.target;
  const sensors = effectiveOrientation();

  const skyActive = SKY_STATES.includes(state);
  if (camera.active && !skyActive) {
    camera.stop();
    ui.setCameraActive(false);
  }

  ui.showState(state);
  ui.setSkyActive(skyActive);

  switch (state) {
    case STATES.AIMING:
    case STATES.COMPASS_UNSTABLE: {
      if (!target || !ctx.guidance) break;
      renderSky(sensors, target);
      break;
    }
    case STATES.GPS_ONLY:
    case STATES.MANUAL_CITY:
    case STATES.NO_SENSORS:
      if (target && ctx.position) {
        ui.renderManual(target, ctx.position, ctx.compass);
      }
      break;
    case STATES.NO_PERMISSION:
    case STATES.NO_LOCATION:
      ui.renderNoLocation(ctx.geoFailure);
      break;
    default:
      break;
  }

  renderDebug(target, sensors);
}

/**
 * Весь небесный купол: астрономия тикает раз в секунду, проекция и Canvas — каждый кадр.
 */
function renderSky(sensors, target) {
  const position = effectivePosition();
  if (!position || !target || !sensors.matrix) {
    lastProjection = null;
    lastScene = null;
    return;
  }

  const date = now();
  const second = Math.floor(date.getTime() / 1000);
  const positionKey = `${position.lat.toFixed(5)}:${position.lon.toFixed(5)}`;
  if (!skyDome || skyDomeSecond !== second || skyDomePositionKey !== positionKey) {
    skyDome = buildSkyDome({ date, position });
    skyDomeSecond = second;
    skyDomePositionKey = positionKey;
  }

  const geometry = camera.geometry();
  lastView = {
    width: window.innerWidth,
    height: window.innerHeight,
    screenAngle: window.screen?.orientation?.angle || 0,
    focal:
      camera.active && geometry
        ? computeFocalLength({
            ...geometry,
            viewWidth: window.innerWidth,
            viewHeight: window.innerHeight,
            fovDeg: cameraFov,
          })
        : computeMapFocalLength({
            viewWidth: window.innerWidth,
            viewHeight: window.innerHeight,
            fovDeg: cameraFov,
          }),
  };

  lastScene = projectSkyDome({
    dome: skyDome,
    matrix: sensors.matrix,
    view: lastView,
    highlightId: shower.constellation,
    target,
  });
  if (!lastScene) return;
  lastProjection = lastScene.target;

  drawSkyScene(ui.el.skyCanvas, lastScene, {
    cameraActive: camera.active,
    night: ui.isNight(),
  });
  const navigation = targetNavigation({
    scene: lastScene,
    target,
    aligned: targetAligned,
  });
  ui.renderSkyGuidance({
    navigation,
    scene: lastScene,
    target,
    aligned: targetAligned,
    stable: sensors.stable,
  });

  framesSinceSample += 1;
  const sampledAt = performance.now();
  if (sampledAt - fpsSampleAt >= 1000) {
    fps = (framesSinceSample * 1000) / (sampledAt - fpsSampleAt);
    framesSinceSample = 0;
    fpsSampleAt = sampledAt;
  }
}

async function toggleAr() {
  if (camera.active) {
    camera.stop();
    ui.setCameraActive(false);
    ui.setArNotice('');
    update();
    return;
  }

  ui.setArNotice('');

  const result = await camera.start(ui.el.arVideo);
  if (!result.ok) {
    ui.setCameraActive(false);
    ui.setArNotice(camera.failureText());
    return;
  }
  ui.setCameraActive(true);
  update();
}

function renderDebug(target, sensors) {
  if (!debug.enabled) return;
  const position = effectivePosition();
  const date = now();
  const ctx = store.context;

  debug.render({
    state: store.state,
    shower: shower.id,
    lat: position?.lat ?? null,
    lon: position?.lon ?? null,
    positionSource: position?.source ?? null,
    accuracy: position?.accuracy ?? null,
    timeLocal: date.toLocaleString('ru-RU'),
    timeUtc: date.toISOString(),
    ra: target?.ra ?? null,
    dec: target?.dec ?? null,
    targetAz: target?.az ?? null,
    targetAlt: target?.alt ?? null,
    heading: sensors.heading,
    pitch: sensors.pitch,
    headingRaw: sensors.headingRaw,
    headingSource: sensors.source,
    yawOffset: sensors.yawOffset,
    declination: sensors.declination,
    magneticModel: MODEL_INFO.isExpired(date)
      ? `${MODEL_INFO.name}, срок истёк`
      : MODEL_INFO.name,
    separation: ctx.guidance?.separation ?? null,
    deltaAz: ctx.guidance?.deltaAz ?? null,
    deltaAlt: ctx.guidance?.deltaAlt ?? null,
    camera: camera.status,
    cameraFov,
    cameraFrame: camera.geometry()
      ? `${camera.geometry().videoWidth}×${camera.geometry().videoHeight}`
      : null,
    visibleFov: lastView ? visibleFieldOfView(lastView) : null,
    markerX: lastProjection?.x ?? null,
    markerY: lastProjection?.y ?? null,
    markerOnScreen: lastProjection ? lastProjection.onScreen : null,
    visibleConstellations: lastScene?.visibleConstellations ?? null,
    fps,
    geoPermission: ctx.geoPermission,
    orientationPermission: sensors.permission,
    compass: ctx.compass,
    stable: sensors.stable,
    sigma: sensors.sigma,
    rate: sensors.rate,
  });
}

/* ------------------------------------------------------------------ */
/* Сценарий                                                            */
/* ------------------------------------------------------------------ */

/**
 * Нажатие главной кнопки.
 *
 * Порядок здесь важен: на iOS запрос доступа к датчикам обязан начаться
 * синхронно внутри обработчика жеста. Любой await до него — и система
 * молча откажет, даже не показав диалог.
 */
async function onStart() {
  const permissionPromise = orientation.needsPermission()
    ? orientation.requestPermission()
    : Promise.resolve(orientation.isSupported() ? 'granted' : 'unsupported');

  store.update({ started: true, askingPermissions: true });

  const permission = await permissionPromise;
  store.update({ askingPermissions: false, locating: true });

  // Датчики и координаты запрашиваем параллельно: ждать одно ради другого
  // незачем, а секунды на старте заметны.
  startSensors(permission);
  await locate();
}

async function startSensors(permission) {
  if (debug.hasOrientationOverride()) {
    store.update({ compass: COMPASS.OK });
    return;
  }
  if (permission === 'denied') {
    store.update({ compass: COMPASS.DENIED });
    return;
  }
  if (permission === 'unsupported' || !orientation.isSupported()) {
    store.update({ compass: COMPASS.UNSUPPORTED });
    return;
  }

  const result = await orientation.start();
  if (result.ok) {
    store.update({ compass: COMPASS.OK });
  } else if (result.reason === 'relative-only') {
    store.update({ compass: COMPASS.RELATIVE_ONLY });
  } else if (result.reason === 'unsupported') {
    store.update({ compass: COMPASS.UNSUPPORTED });
  } else {
    store.update({ compass: COMPASS.NO_DATA });
  }
}

async function locate() {
  if (debug.hasPositionOverride()) {
    store.update({ locating: false, triedLocation: true });
    return;
  }

  store.update({ locating: true });
  const result = await requestPosition();
  const geoPermission = await permissionState();

  if (result.ok) {
    orientation.setPosition(result.position);
    store.update({
      position: result.position,
      locating: false,
      triedLocation: true,
      geoFailure: null,
      geoPermission,
    });
    return;
  }

  // Не получилось. Прежде чем показывать экран неудачи, вспомним, что
  // человек уже открывал приложение раньше: сохранённые координаты
  // лучше, чем ничего.
  const saved = loadSaved();
  if (saved) {
    orientation.setPosition(saved);
    store.update({
      position: saved,
      locating: false,
      triedLocation: true,
      geoFailure: result.reason,
      geoPermission,
    });
    return;
  }

  store.update({
    locating: false,
    triedLocation: true,
    geoFailure: result.reason,
    geoPermission,
  });
}

function pickCity(city) {
  const position = positionFromCity(city);
  orientation.setPosition(position);
  store.update({
    position,
    pickingCity: false,
    locating: false,
    triedLocation: true,
    started: true,
    geoFailure: null,
  });
  update();
}

function openCityPicker() {
  cityQuery = '';
  ui.el.citySearch.value = '';
  ui.renderCities('', pickCity);
  store.update({ pickingCity: true });
}

/* ------------------------------------------------------------------ */
/* События интерфейса                                                  */
/* ------------------------------------------------------------------ */

function bindEvents() {
  ui.el.startButton.addEventListener('click', onStart);

  ui.el.nightToggle.addEventListener('click', () => {
    ui.setTheme(!ui.isNight());
    update();
  });

  document.getElementById('permissions-skip').addEventListener('click', openCityPicker);
  document.getElementById('locating-skip').addEventListener('click', openCityPicker);
  document.getElementById('choose-city').addEventListener('click', openCityPicker);
  document.getElementById('manual-change-city').addEventListener('click', openCityPicker);

  document.getElementById('retry-location').addEventListener('click', () => {
    store.update({ geoFailure: null, triedLocation: false });
    locate();
  });

  document.getElementById('banner-manual').addEventListener('click', () => {
    // Человек сам решил, что стрелке верить не стоит: уводим в инструкцию
    // под системный компас, но оставляем возможность вернуться.
    store.update({ forcedManual: true });
  });

  document.getElementById('manual-retry-sensors').addEventListener('click', async () => {
    orientation.resetQuality();
    store.update({
      compass: COMPASS.UNKNOWN,
      compassStable: true,
      forcedManual: false,
    });
    const permission = orientation.needsPermission()
      ? await orientation.requestPermission()
      : 'granted';
    await startSensors(permission);
  });

  // Датчик может заговорить позже, чем истёк сторожевой таймер: сенсор
  // просыпается медленно, диалог разрешений висит, вкладка была свёрнута.
  // Пришедшие данные — сами по себе доказательство, что компас работает,
  // поэтому возвращаемся к наведению без участия пользователя.
  orientation.subscribe((sensors) => {
    if (!sensors.absolute) return;
    if (store.context.compass !== COMPASS.OK) {
      store.update({ compass: COMPASS.OK });
    }
  });

  ui.el.citySearch.addEventListener('input', (e) => {
    cityQuery = e.target.value;
    ui.renderCities(cityQuery, pickCity);
  });

  debug.subscribe(() => {
    syncDebugPosition();
    if (debug.hasOrientationOverride() && store.context.compass !== COMPASS.OK) {
      store.update({ compass: COMPASS.OK });
    }
    update();
  });

  ui.el.arToggle.addEventListener('click', toggleAr);

  // Смена ориентации экрана меняет систему координат стрелки.
  window.screen?.orientation?.addEventListener?.('change', () => update());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Вкладка ушла в фон: гасим камеру. Иначе на телефоне продолжает
      // гореть индикатор записи, а батарея садится впустую.
      if (camera.active) {
        camera.stop();
        ui.setCameraActive(false);
      }
      return;
    }
    update();
  });

  // Уходя со страницы, освобождаем камеру явно — не полагаемся на то,
  // что браузер сделает это сам.
  window.addEventListener('pagehide', () => camera.stop());
}

/* ------------------------------------------------------------------ */
/* Запуск                                                              */
/* ------------------------------------------------------------------ */

function showActivityHint() {
  const date = now();
  if (isShowerActive(shower, date)) return;
  const hint = document.getElementById('start-hint');
  hint.textContent =
    `Сейчас поток «${shower.name}» вне периода активности, ` +
    `но приложение всё равно покажет, где его радиант находится на небе.`;
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // В режиме отладки кеш только мешает: правки в коде не видны до сброса.
  if (debug.enabled) return;
  // Регистрируем после загрузки, чтобы не соперничать за сеть с интерфейсом.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Кеширование — приятное дополнение, а не условие работы.
    });
  });
}

function init() {
  ui.initTheme();
  ui.applyShower(shower);
  store.update({ shower });
  bindEvents();
  showActivityHint();

  // Нет камеры или страница открыта не по HTTPS — кнопку не показываем
  // вовсе, чтобы не обещать того, чего не будет.
  ui.el.arToggle.hidden = !camera.isSupported();
  ui.setSkyActive(false);
  ui.setCameraActive(false);

  store.subscribe((state, ctx, changed) => {
    if (changed) render();
  });

  // Если координаты остались с прошлого раза, подхватываем их сразу:
  // это ускоряет старт и спасает, когда геолокация откажет.
  const saved = loadSaved();
  if (saved) orientation.setPosition(saved);

  // Отладочный запуск: если координаты или «компас» заданы в адресе,
  // сразу переходим в рабочее состояние, минуя кнопку и разрешения.
  const hasDebugPosition = syncDebugPosition();
  if (debug.hasOrientationOverride()) {
    store.update({ started: true, triedLocation: true, compass: COMPASS.OK });
  } else if (hasDebugPosition) {
    // Координаты подменены, а датчики настоящие — проверяем, отвечают ли они.
    startSensors(orientation.isSupported() ? 'granted' : 'unsupported');
  }

  update();
  startLoops();
  registerServiceWorker();
}

init();

// Пригодится в консоли при отладке на устройстве.
if (debug.enabled) {
  window.perseids = {
    store,
    orientation,
    camera,
    debug,
    shower,
    update,
    toggleAr,
    HEADING_SOURCE,
    /** Подбор поля зрения под конкретный телефон: perseids.setFov(70) */
    setFov(deg) {
      cameraFov = deg;
      update();
      return cameraFov;
    },
  };
}
