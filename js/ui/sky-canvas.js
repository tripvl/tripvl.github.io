/** Canvas-отрисовка уже спроецированной сцены небесного купола. */

const overlaps = (a, b, padding = 6) =>
  a.x < b.x + b.width + padding &&
  a.x + a.width + padding > b.x &&
  a.y < b.y + b.height + padding &&
  a.y + a.height + padding > b.y;

function palette(night) {
  return night
    ? {
        backgroundTop: '#080102',
        backgroundBottom: '#160405',
        ground: 'rgba(52, 8, 8, 0.72)',
        horizon: 'rgba(168, 58, 37, 0.78)',
        line: 'rgba(142, 43, 37, 0.46)',
        lineHot: 'rgba(201, 58, 48, 0.95)',
        star: 'rgba(184, 64, 56, 0.78)',
        starHot: '#d75046',
        label: 'rgba(184, 64, 56, 0.72)',
        labelHot: '#d75046',
        meteor: '#c94f44',
        meteorTransparent: 'rgba(201, 79, 68, 0)',
      }
    : {
        backgroundTop: '#07070a',
        backgroundBottom: '#101017',
        ground: 'rgba(7, 7, 10, 0.8)',
        horizon: 'rgba(125, 122, 137, 0.48)',
        line: 'rgba(90, 94, 108, 0.34)',
        lineHot: 'rgba(110, 170, 165, 0.72)',
        star: 'rgba(200, 197, 208, 0.55)',
        starHot: '#9cbab7',
        label: 'rgba(160, 157, 171, 0.58)',
        labelHot: '#88b6b2',
        meteor: '#9bc5c0',
        meteorTransparent: 'rgba(155, 197, 192, 0)',
      };
}

function prepareCanvas(canvas, widthValue, heightValue) {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(widthValue));
  const height = Math.max(1, Math.round(heightValue));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function fillSkyBackground(ctx, width, height, colors) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, colors.backgroundTop);
  sky.addColorStop(1, colors.backgroundBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
}

export function drawSkyScene(
  canvas,
  scene,
  {
    cameraActive = false,
    night = false,
    meteorBurst = null,
    emphasizeHighlight = false,
  } = {},
) {
  if (!canvas || !scene) return;
  const { ctx, width, height } = prepareCanvas(canvas, scene.width, scene.height);
  const colors = palette(night);

  if (!cameraActive) {
    fillSkyBackground(ctx, width, height, colors);
  }

  if (scene.ground.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(scene.ground[0].x, scene.ground[0].y);
    for (const point of scene.ground.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fillStyle = colors.ground;
    ctx.fill();
  }

  const drawLines = (highlight) => {
    ctx.beginPath();
    for (const line of scene.lines) {
      if (line.highlight !== highlight) continue;
      ctx.moveTo(line.from.x, line.from.y);
      ctx.lineTo(line.to.x, line.to.y);
    }
    ctx.strokeStyle = highlight ? colors.lineHot : colors.line;
    ctx.lineWidth = highlight ? (emphasizeHighlight ? 2.8 : 2) : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  drawLines(false);
  drawLines(true);

  for (const star of scene.stars) {
    const radius = Math.max(0.8, Math.min(3.4, 2.7 - star.mag * 0.34));
    ctx.beginPath();
    const highlightBoost = emphasizeHighlight ? 1.05 : 0.65;
    ctx.arc(star.x, star.y, star.highlight ? radius + highlightBoost : radius, 0, Math.PI * 2);
    ctx.fillStyle = star.highlight ? colors.starHot : colors.star;
    ctx.fill();
  }

  ctx.beginPath();
  for (const line of scene.horizon) {
    ctx.moveTo(line.from.x, line.from.y);
    ctx.lineTo(line.to.x, line.to.y);
  }
  ctx.strokeStyle = colors.horizon;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = colors.horizon;
  for (const point of scene.cardinals) ctx.fillText(point.label, point.x, point.y - 14);

  const occupied = [];
  const orderedLabels = [...scene.labels].sort(
    (a, b) => Number(b.highlight) - Number(a.highlight),
  );
  for (const label of orderedLabels) {
    ctx.font = label.highlight
      ? `${emphasizeHighlight ? '600 16px' : '500 15px'} -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      : '400 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const metrics = ctx.measureText(label.text);
    const box = {
      x: label.x - metrics.width / 2,
      y: label.y - 9,
      width: metrics.width,
      height: label.highlight ? 18 : 15,
    };
    if (!label.highlight && occupied.some((other) => overlaps(box, other))) continue;
    occupied.push(box);
    ctx.fillStyle = label.highlight ? colors.labelHot : colors.label;
    ctx.shadowColor = cameraActive ? 'rgba(0, 0, 0, 0.95)' : 'transparent';
    ctx.shadowBlur = cameraActive ? 3 : 0;
    ctx.fillText(label.text, label.x, label.y);
  }
  ctx.shadowBlur = 0;

  if (meteorBurst?.active) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const meteor of meteorBurst.meteors) {
      const gradient = ctx.createLinearGradient(
        meteor.from.x,
        meteor.from.y,
        meteor.to.x,
        meteor.to.y,
      );
      gradient.addColorStop(0, colors.meteorTransparent);
      gradient.addColorStop(0.68, colors.meteor);
      gradient.addColorStop(1, colors.meteor);
      ctx.globalAlpha = meteor.alpha * (cameraActive ? 0.72 : 0.88);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = meteor.width;
      ctx.beginPath();
      ctx.moveTo(meteor.from.x, meteor.from.y);
      ctx.lineTo(meteor.to.x, meteor.to.y);
      ctx.stroke();

      ctx.fillStyle = colors.meteor;
      ctx.beginPath();
      ctx.arc(meteor.to.x, meteor.to.y, meteor.width * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Плоский компас для положения камерой вниз. Фон всегда непрозрачный:
 * активная камера остаётся запущенной, но человек видит только компас.
 */
export function drawDownCompass(
  canvas,
  { width: widthValue, height: heightValue, heading, targetAz, aligned, night = false },
) {
  if (!canvas || !Number.isFinite(heading) || !Number.isFinite(targetAz)) return;
  const { ctx, width, height } = prepareCanvas(canvas, widthValue, heightValue);
  const colors = palette(night);
  fillSkyBackground(ctx, width, height, colors);

  const center = { x: width / 2, y: height * 0.43 };
  const radius = Math.min(width * 0.37, height * 0.22, 164);
  const relative = (az) => ((az - heading + 540) % 360) - 180;
  const point = (az, distance) => {
    const angle = relative(az) * (Math.PI / 180);
    return {
      x: center.x + Math.sin(angle) * distance,
      y: center.y - Math.cos(angle) * distance,
      angle,
    };
  };

  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = colors.horizon;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  for (let az = 0; az < 360; az += 10) {
    const major = az % 30 === 0;
    const outer = point(az, radius);
    const inner = point(az, radius - (major ? 13 : 7));
    ctx.beginPath();
    ctx.moveTo(inner.x, inner.y);
    ctx.lineTo(outer.x, outer.y);
    ctx.strokeStyle = major ? colors.label : colors.line;
    ctx.lineWidth = major ? 1.4 : 1;
    ctx.stroke();
  }

  const cardinals = [
    [0, 'С'],
    [90, 'В'],
    [180, 'Ю'],
    [270, 'З'],
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  for (const [az, label] of cardinals) {
    const p = point(az, radius - 28);
    ctx.fillStyle = az === 0 ? colors.lineHot : colors.label;
    ctx.fillText(label, p.x, p.y);
  }

  const target = point(targetAz, radius - 38);
  const tail = point(targetAz + 180, 24);
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(target.x, target.y);
  ctx.strokeStyle = aligned ? colors.starHot : colors.lineHot;
  ctx.lineWidth = aligned ? 5 : 4;
  ctx.stroke();

  const headLength = 18;
  const wing = 8;
  const ux = Math.sin(target.angle);
  const uy = -Math.cos(target.angle);
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(target.x, target.y);
  ctx.lineTo(target.x - ux * headLength + px * wing, target.y - uy * headLength + py * wing);
  ctx.lineTo(target.x - ux * headLength - px * wing, target.y - uy * headLength - py * wing);
  ctx.closePath();
  ctx.fillStyle = aligned ? colors.starHot : colors.lineHot;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(center.x, center.y, aligned ? 11 : 7, 0, Math.PI * 2);
  ctx.fillStyle = aligned ? colors.starHot : colors.backgroundTop;
  ctx.fill();
  ctx.strokeStyle = colors.lineHot;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillStyle = colors.label;
  ctx.fillText('К РАДИАНТУ', center.x, center.y + radius + 28);
}
