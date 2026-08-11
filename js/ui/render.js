/**
 * Отрисовка. Здесь нет ни расчётов, ни решений о состоянии —
 * только перенос уже готовых значений в DOM.
 */

import {
  SCREEN_FOR_STATE,
  locationFailureText,
  locationFailureTitle,
  compassFailureText,
} from './state.js';
import { compassPoint } from '../core/astro.js';
import {
  manualDirectionText,
  altitudeText,
  observingSpot,
} from '../core/guidance.js';
import { searchCities, citiesInDeviceTimeZone } from '../config/cities.js';

const THEME_KEY = 'perseids.theme';

const $ = (id) => document.getElementById(id);

/** Геометрия схемы высоты: центр дуги и радиус в координатах SVG. */
const ALT_ORIGIN = { x: 20, y: 106, r: 86 };

export function createRenderer() {
  const el = {
    screens: Array.from(document.querySelectorAll('.screen')),
    brand: $('brand'),
    nightToggle: $('night-toggle'),

    startTitle: $('start-title'),
    startButton: $('start-button'),

    permissionsText: $('permissions-text'),

    arLayer: $('ar-layer'),
    arVideo: $('ar-video'),
    skyCanvas: $('sky-canvas'),
    arMarker: $('ar-marker'),
    arMarkerLabel: $('ar-marker-label'),
    arToggle: $('ar-toggle'),
    arNotice: $('ar-notice'),

    aimArrow: $('aim-arrow'),
    aimPrimary: $('aim-primary'),
    aimSecondary: $('aim-secondary'),
    compassBanner: $('compass-banner'),
    targetCard: $('target-card'),
    targetCardTitle: $('target-card-title'),

    manualTitle: $('manual-title'),
    manualPlace: $('manual-place'),
    manualDirection: $('manual-direction'),
    manualAltitude: $('manual-altitude'),
    manualSteps: $('manual-steps'),
    manualObserving: $('manual-observing'),
    altTarget: $('alt-target'),
    altDot: $('alt-dot'),

    noLocationTitle: $('no-location-title'),
    noLocationText: $('no-location-text'),

    citySearch: $('city-search'),
    cityList: $('city-list'),
    cityEmpty: $('city-empty'),
    citiesHint: $('cities-hint'),

    debug: $('debug'),
    debugValues: $('debug-values'),
  };

  let lastScreen = null;

  return {
    el,

    /** Показывает нужный раздел, прячет остальные. */
    showState(state) {
      const screenId = SCREEN_FOR_STATE[state];
      if (screenId === lastScreen) return;
      lastScreen = screenId;
      for (const section of el.screens) {
        section.hidden = section.id !== screenId;
        if (!section.hidden) section.scrollTop = 0;
      }
      // При смене экрана уводим фокус в начало — иначе он остаётся
      // на кнопке скрытого раздела и скринридер теряется.
      if (screenId !== 'screen-cities') {
        window.scrollTo(0, 0);
      }
    },

    /** Название потока подставляется из конфигурации, а не зашито в разметку. */
    applyShower(shower) {
      el.brand.textContent = shower.name;
      el.startTitle.textContent = shower.name;
      el.startButton.textContent = `Открыть карту ${shower.nameGenitive}`;
      el.targetCardTitle.textContent = `Радиант ${shower.nameGenitive} найден`;
      el.arMarkerLabel.textContent = shower.name;
      document.title = `${shower.name} — где смотреть`;
      const step = el.manualSteps.querySelector('li:nth-child(4)');
      if (step) step.textContent = `Это район радианта ${shower.nameGenitive}.`;
      for (const p of document.querySelectorAll('.explainer p')) {
        p.textContent =
          `Радиант — область неба, из которой визуально расходятся ` +
          `траектории ${shower.nameGenitive}. Сами метеоры могут появляться ` +
          `в разных частях неба.`;
      }
    },

    renderPermissions(text) {
      el.permissionsText.textContent = text;
    },

    /** Стрелка, метка радианта и компактная карточка успеха поверх Canvas. */
    renderSkyGuidance({ navigation, scene, target, aligned, stable }) {
      const markerVisible = Boolean(target.alt >= 0 && scene?.target?.onScreen);
      el.arMarker.hidden = !markerVisible;
      if (markerVisible) {
        el.arMarker.style.transform =
          `translate(${scene.target.x.toFixed(1)}px, ${scene.target.y.toFixed(1)}px)`;
      }
      el.arMarker.classList.toggle('ar__marker--found', aligned);

      el.aimArrow.hidden = navigation.hidden;
      el.aimArrow.classList.toggle('aim-arrow--below', navigation.mode.startsWith('below'));
      if (!navigation.hidden) {
        el.aimArrow.style.transform =
          `translate(${navigation.x.toFixed(1)}px, ${navigation.y.toFixed(1)}px) ` +
          `rotate(${navigation.angle.toFixed(1)}deg)`;
      }

      el.targetCard.hidden = !aligned;
      const status = el.aimPrimary.closest('.sky-status');
      status.hidden = aligned;
      if (target.alt < 0) {
        el.aimPrimary.textContent = 'Радиант под горизонтом';
        el.aimSecondary.textContent = 'Он поднимется позже';
      } else if (navigation.mode === 'inside') {
        el.aimPrimary.textContent = 'Веди телефон по стрелке';
        el.aimSecondary.textContent = 'Радиант уже виден на карте';
      } else {
        el.aimPrimary.textContent = 'Поворачивай телефон';
        el.aimSecondary.textContent = 'Стрелка приведёт к радианту';
      }

      el.compassBanner.hidden = stable;
      el.skyCanvas.setAttribute(
        'aria-label',
        `Карта неба: в кадре ${scene?.visibleConstellations || 0} созвездий.`,
      );
    },

    setSkyActive(active) {
      el.arLayer.hidden = !active;
      document.body.classList.toggle('sky-active', active);
      if (!active) {
        el.arMarker.hidden = true;
        el.aimArrow.hidden = true;
        el.targetCard.hidden = true;
      }
    },

    /** Камера меняет только фон карты. */
    setCameraActive(active) {
      document.body.classList.toggle('camera-active', active);
      el.arToggle.textContent = active ? 'Тёмное небо' : 'Включить камеру';
      el.arToggle.setAttribute('aria-pressed', String(active));
    },

    /** Короткое пояснение под кнопкой, если камера не включилась. */
    setArNotice(text) {
      el.arNotice.textContent = text || '';
      el.arNotice.hidden = !text;
    },

    /**
     * Ручная инструкция: направление, высота и схема.
     * Все числа приходят из расчёта — в разметке их нет.
     */
    renderManual(target, position, compassState) {
      el.manualDirection.textContent = manualDirectionText(target.az);
      el.manualAltitude.textContent = altitudeText(target.alt);

      const place = position.city
        ? `Расчёт для города ${position.city}.`
        : 'Расчёт для ваших координат.';
      el.manualPlace.textContent = `${place} ${compassFailureText(compassState)}`;

      // Луч и точка на схеме высоты.
      const alt = Math.max(0, Math.min(90, target.alt));
      const rad = (alt * Math.PI) / 180;
      const x = ALT_ORIGIN.x + ALT_ORIGIN.r * Math.cos(rad);
      const y = ALT_ORIGIN.y - ALT_ORIGIN.r * Math.sin(rad);
      el.altTarget.setAttribute('x2', x.toFixed(1));
      el.altTarget.setAttribute('y2', y.toFixed(1));
      el.altDot.setAttribute('cx', x.toFixed(1));
      el.altDot.setAttribute('cy', y.toFixed(1));

      // Куда именно отвести взгляд. Человеку без стрелки трудно на глаз
      // отмерить «40–60° в сторону», поэтому называем готовое направление.
      const spot = observingSpot(target);
      el.manualObserving.textContent =
        `Для наблюдения смотри примерно на азимут ${Math.round(spot.az)}° ` +
        `и высоту ${Math.round(spot.alt)}° — это и есть те самые 40–60° ` +
        `в сторону от радианта.`;

      // Если радиант ниже горизонта, честно об этом говорим: направление
      // всё равно полезно — радиант поднимется через час-другой.
      const belowHorizon = target.alt < 0;
      el.manualTitle.textContent = belowHorizon
        ? 'Радиант пока под горизонтом'
        : 'Открой приложение «Компас»';
    },

    renderNoLocation(failure) {
      el.noLocationTitle.textContent = locationFailureTitle(failure);
      el.noLocationText.textContent = locationFailureText(failure);
    },

    /** Список городов. Кнопки пересоздаются целиком — список короткий. */
    renderCities(query, onPick) {
      const list = searchCities(query);
      el.cityList.textContent = '';

      const nearby = citiesInDeviceTimeZone();
      el.citiesHint.textContent =
        !query && nearby.length
          ? 'Сверху — города вашего часового пояса.'
          : 'Подойдёт ближайший крупный город.';

      let markedGroup = false;
      for (const city of list) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'city-button';

        const name = document.createElement('span');
        name.textContent = city.name;
        button.append(name);

        // Метку ставим один раз, на первый город группы: так видно, где
        // «свой» часовой пояс заканчивается, и список не рябит повторами.
        if (!query && !markedGroup && city.tz === nearby[0]?.tz) {
          markedGroup = true;
          const tz = document.createElement('span');
          tz.className = 'city-button__tz';
          tz.textContent = 'ваш часовой пояс';
          button.append(tz);
        }

        button.addEventListener('click', () => onPick(city));
        li.append(button);
        el.cityList.append(li);
      }

      el.cityEmpty.hidden = list.length > 0;
    },

    /** Ночной режим: тема хранится между запусками. */
    initTheme() {
      const saved = localStorage.getItem(THEME_KEY);
      this.setTheme(saved === 'night');
    },

    setTheme(night) {
      document.documentElement.dataset.theme = night ? 'night' : 'dark';
      el.nightToggle.setAttribute('aria-pressed', String(night));
      el.nightToggle.textContent = night ? 'Обычный режим' : 'Ночной режим';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', night ? '#060102' : '#07070a');
      try {
        localStorage.setItem(THEME_KEY, night ? 'night' : 'dark');
      } catch {
        /* приватный режим — тема просто не запомнится */
      }
    },

    isNight() {
      return document.documentElement.dataset.theme === 'night';
    },

    renderDebug(text) {
      el.debugValues.textContent = text;
    },
  };
}
