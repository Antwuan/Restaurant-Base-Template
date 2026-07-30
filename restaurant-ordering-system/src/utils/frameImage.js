/**
 * Bake zoom/pan framing into a JPEG blob URL (web).
 * zoom: 1 = cover the frame; higher = more zoom in
 * offsetX/Y: -1..1 pan within available overflow
 */
export function loadHtmlImage(uri) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image framing is only available on web.'));
      return;
    }
    const img = new Image();
    // Needed so canvas can export remote storage URLs without tainting.
    if (/^https?:\/\//i.test(uri)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for framing.'));
    img.src = uri;
  });
}

export function computeCoverDraw({
  imageWidth,
  imageHeight,
  frameWidth,
  frameHeight,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
}) {
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const scale = coverScale * Math.max(1, zoom);
  const drawW = imageWidth * scale;
  const drawH = imageHeight * scale;
  const maxPanX = Math.max(0, (drawW - frameWidth) / 2);
  const maxPanY = Math.max(0, (drawH - frameHeight) / 2);
  const dx = (frameWidth - drawW) / 2 + clamp(offsetX, -1, 1) * maxPanX;
  const dy = (frameHeight - drawH) / 2 + clamp(offsetY, -1, 1) * maxPanY;
  return { drawW, drawH, dx, dy, scale };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * @returns {Promise<string>} object URL for a JPEG blob
 */
export async function renderFramedImageToObjectUrl({
  sourceUri,
  aspectRatio = 1,
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
  outputWidth = 1400,
}) {
  const img = await loadHtmlImage(sourceUri);
  const outputHeight = Math.max(1, Math.round(outputWidth / aspectRatio));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas for image framing.');

  const { drawW, drawH, dx, dy } = computeCoverDraw({
    imageWidth: img.naturalWidth || img.width,
    imageHeight: img.naturalHeight || img.height,
    frameWidth: outputWidth,
    frameHeight: outputHeight,
    zoom,
    offsetX,
    offsetY,
  });

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, outputWidth, outputHeight);
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not export framed image.'))),
      'image/jpeg',
      0.92,
    );
  });

  return URL.createObjectURL(blob);
}
