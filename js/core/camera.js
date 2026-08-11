/**
 * Видеопоток с задней камеры для AR-режима.
 *
 * Поток нужен только как фон: кадр никуда не отправляется, не записывается
 * и не покидает устройство. Как только режим выключается или вкладка
 * уходит в фон, камера освобождается — иначе на телефоне продолжает
 * гореть индикатор, а батарея садится впустую.
 *
 * Ночью камера смартфона показывает почти чёрный кадр: звёзд она не увидит.
 * Смысл режима не в том, чтобы разглядеть небо, а в том, чтобы метка
 * радианта стояла поверх реального горизонта, домов и деревьев — так
 * направление считывается мгновенно и без мысленного пересчёта градусов.
 */

/** Что просим у браузера. Разрешение выше нужного только греет телефон. */
const CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

export const CAMERA_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  DENIED: 'denied',
  MISSING: 'missing',
  BUSY: 'busy',
  UNSUPPORTED: 'unsupported',
  FAILED: 'failed',
};

export function createCamera() {
  let stream = null;
  let videoEl = null;
  let status = CAMERA_STATUS.IDLE;

  return {
    get status() {
      return status;
    },

    get active() {
      return status === CAMERA_STATUS.ACTIVE;
    },

    isSupported() {
      return Boolean(
        typeof navigator !== 'undefined' &&
          navigator.mediaDevices?.getUserMedia &&
          window.isSecureContext,
      );
    },

    /**
     * Включает камеру и подключает поток к элементу video.
     * Вызывать только из обработчика жеста пользователя.
     *
     * @returns {Promise<{ok:boolean, status:string}>}
     */
    async start(element) {
      if (!this.isSupported()) {
        status = CAMERA_STATUS.UNSUPPORTED;
        return { ok: false, status };
      }
      if (status === CAMERA_STATUS.ACTIVE) return { ok: true, status };

      status = CAMERA_STATUS.STARTING;
      videoEl = element;

      try {
        stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      } catch (err) {
        // Причину различаем, чтобы подобрать человеческий текст,
        // но само сообщение браузера пользователю не показываем никогда.
        switch (err?.name) {
          case 'NotAllowedError':
          case 'SecurityError':
            status = CAMERA_STATUS.DENIED;
            break;
          case 'NotFoundError':
          case 'OverconstrainedError':
            status = CAMERA_STATUS.MISSING;
            break;
          case 'NotReadableError':
          case 'AbortError':
            status = CAMERA_STATUS.BUSY;
            break;
          default:
            status = CAMERA_STATUS.FAILED;
        }
        return { ok: false, status };
      }

      videoEl.srcObject = stream;
      // playsInline обязателен: без него iOS открывает видео на весь экран
      // в системном плеере вместо того, чтобы показать его в вёрстке.
      videoEl.playsInline = true;
      videoEl.muted = true;

      try {
        await videoEl.play();
      } catch {
        // Автовоспроизведение могли запретить — поток при этом живой,
        // и первый же кадр обычно всё равно появляется.
      }

      // Ждём, пока станут известны размеры кадра: без них не посчитать
      // фокусное расстояние, а значит и не поставить метку.
      if (!videoEl.videoWidth) {
        await new Promise((resolve) => {
          const done = () => {
            videoEl.removeEventListener('loadedmetadata', done);
            resolve();
          };
          videoEl.addEventListener('loadedmetadata', done);
          setTimeout(done, 3000);
        });
      }

      status = CAMERA_STATUS.ACTIVE;
      return { ok: true, status };
    },

    stop() {
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        stream = null;
      }
      if (videoEl) {
        videoEl.srcObject = null;
      }
      status = CAMERA_STATUS.IDLE;
    },

    /** Размеры кадра — нужны проекции. */
    geometry() {
      if (!videoEl?.videoWidth) return null;
      return { videoWidth: videoEl.videoWidth, videoHeight: videoEl.videoHeight };
    },

    /** Что показать человеку, если камера не включилась. */
    failureText() {
      switch (status) {
        case CAMERA_STATUS.DENIED:
          return 'Доступ к камере не разрешён. Стрелка работает и без неё.';
        case CAMERA_STATUS.MISSING:
          return 'Задняя камера не найдена. Остаёмся со стрелкой.';
        case CAMERA_STATUS.BUSY:
          return 'Камеру занял другой сервис. Закройте его и попробуйте снова.';
        case CAMERA_STATUS.UNSUPPORTED:
          return 'Этот браузер не даёт доступ к камере. Стрелка работает и без неё.';
        default:
          return 'Камеру включить не получилось. Стрелка работает и без неё.';
      }
    },
  };
}
