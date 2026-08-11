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
      };
}

export function drawSkyScene(canvas, scene, { cameraActive = false, night = false } = {}) {
  if (!canvas || !scene) return;
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(scene.width));
  const height = Math.max(1, Math.round(scene.height));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  const ctx = canvas.getContext('2d');
  const colors = palette(night);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (!cameraActive) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, colors.backgroundTop);
    sky.addColorStop(1, colors.backgroundBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);
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
    ctx.lineWidth = highlight ? 2 : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  drawLines(false);
  drawLines(true);

  for (const star of scene.stars) {
    const radius = Math.max(0.8, Math.min(3.4, 2.7 - star.mag * 0.34));
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.highlight ? radius + 0.65 : radius, 0, Math.PI * 2);
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
      ? '500 15px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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
}
