/* ============================================================
   CSDN 图片水印清理
   - 水印已经烧录进图片像素，按右下角固定区域做背景补全/模糊/裁切
   - 所有处理在本机 Canvas 完成，不上传图片
   ============================================================ */
(() => {
  'use strict';

  const CSDN_HOST = /(^|\.)(csdnimg\.cn|csdn\.net)$/i;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isCsdnImage(src) {
    try {
      return CSDN_HOST.test(new URL(String(src || '')).hostname);
    } catch (error) {
      return false;
    }
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function median(values) {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  async function decodeBlob(blob) {
    if (window.createImageBitmap) {
      try {
        return await createImageBitmap(blob);
      } catch (error) {
        // 下面是兼容旧浏览器的 Image 解码路径。
      }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('无法生成处理后的图片'));
      }, type || 'image/png', 0.94);
    });
  }

  function regionFor(width, height) {
    // 以图片右下角为基准；横向多留一点空间，纵向覆盖完整水印字高。
    const boxWidth = Math.min(width, clamp(Math.round(width * 0.28), 110, 1000));
    const boxHeight = Math.min(height, clamp(Math.round(width * 0.03), 24, 100));
    return {
      x: width - boxWidth,
      y: height - boxHeight,
      width: boxWidth,
      height: boxHeight
    };
  }

  function sampleTopEdge(data, width, height, x0, y, xEnd) {
    const top = Math.max(0, y - 14);
    const bottom = Math.max(0, y - 3);
    const samples = [];
    for (let x = x0; x < xEnd; x += 1) {
      const colors = [];
      for (let sy = top; sy < bottom; sy += 2) {
        if (sy < 0 || sy >= height) continue;
        const offset = (sy * width + x) * 4;
        colors.push([data[offset], data[offset + 1], data[offset + 2]]);
      }
      samples.push(colors.length
        ? [0, 1, 2].map((channel) => median(colors.map((color) => color[channel])))
        : [255, 255, 255]);
    }
    return samples;
  }

  function sampleLeftEdge(data, width, height, x, y0) {
    const left = Math.max(0, x - 14);
    const right = Math.max(0, x - 3);
    const samples = [];
    for (let y = y0; y < height; y += 1) {
      const colors = [];
      for (let sx = left; sx < right; sx += 2) {
        const offset = (y * width + sx) * 4;
        colors.push([data[offset], data[offset + 1], data[offset + 2]]);
      }
      samples.push(colors.length
        ? [0, 1, 2].map((channel) => median(colors.map((color) => color[channel])))
        : [255, 255, 255]);
    }
    return samples;
  }

  function fillBackground(ctx, width, height, region) {
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const { x: x0, y: y0, width: boxWidth, height: boxHeight } = region;
    const topColors = sampleTopEdge(data, width, height, x0, y0, width);
    const leftColors = sampleLeftEdge(data, width, height, x0, y0);

    // 将左侧和上方的干净色彩做双线性延展，避免逐列复制造成竖向条纹。
    for (let y = y0; y < height; y += 1) {
      const left = leftColors[Math.min(leftColors.length - 1, y - y0)];
      for (let x = x0; x < width; x += 1) {
        const top = topColors[Math.min(topColors.length - 1, x - x0)];
        const mix = x === x0 ? 0 : (x - x0) / Math.max(1, boxWidth - 1);
        const offset = (y * width + x) * 4;
        data[offset] = Math.round(left[0] * (1 - mix) + top[0] * mix);
        data[offset + 1] = Math.round(left[1] * (1 - mix) + top[1] * mix);
        data[offset + 2] = Math.round(left[2] * (1 - mix) + top[2] * mix);
        data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function blurRegion(ctx, region) {
    const { x, y, width: w, height: h } = region;
    const block = Math.max(10, Math.round(h / 5));
    const small = document.createElement('canvas');
    small.width = Math.max(2, Math.ceil(w / block));
    small.height = Math.max(2, Math.ceil(h / block));
    const smallCtx = small.getContext('2d', { alpha: false });
    if (!smallCtx) throw new Error('浏览器无法创建马赛克画布');
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);

    // 马赛克块足够大，水印文字会被压成不可辨认的色块；中心区域完全覆盖。
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    ctx.restore();
  }

  async function process(blob, options = {}) {
    if (!blob || !String(blob.type || '').startsWith('image/')) {
      throw new Error('不是可处理的图片');
    }
    const supportsAlpha = !/^image\/(jpe?g|webp)$/i.test(blob.type || '');
    const bitmap = await decodeBlob(blob);
    const width = bitmap.width || bitmap.naturalWidth;
    const height = bitmap.height || bitmap.naturalHeight;
    if (!width || !height) throw new Error('图片尺寸读取失败');
    // 小图标通常没有 CSDN 水印，避免误擦图片边缘。
    if (width < 180 || height < 90) return blob;

    const mode = options.mode || 'fill';
    const region = regionFor(width, height);
    let targetWidth = width;
    let targetHeight = height;
    if (mode === 'crop') {
      targetHeight = height - region.height;
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: supportsAlpha });
    if (!ctx) throw new Error('浏览器无法创建图片画布');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (!supportsAlpha) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight, 0, 0, targetWidth, targetHeight);

    if (mode === 'crop') {
      bitmap.close?.();
      return canvasToBlob(canvas, blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    }
    if (mode === 'blur') {
      blurRegion(ctx, region);
    } else {
      fillBackground(ctx, targetWidth, targetHeight, region);
    }

    bitmap.close?.();
    const type = blob.type === 'image/jpeg' ? 'image/jpeg' : blob.type === 'image/webp' ? 'image/webp' : blob.type === 'image/gif' ? 'image/png' : blob.type;
    return canvasToBlob(canvas, type);
  }

  window.BlogWatermark = {
    isCsdnImage,
    process,
    regionFor
  };
})();
