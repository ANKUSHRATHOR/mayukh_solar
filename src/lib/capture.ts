// Image capture helpers: compression + simple blur heuristic.
import imageCompression from 'browser-image-compression';

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  const opts = {
    maxSizeMB: 0.5,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/jpeg' as const,
    initialQuality: 0.82,
  };
  try {
    const out = await imageCompression(file, opts);
    return new File([out], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Returns variance of Laplacian on a downscaled grayscale canvas.
// Higher = sharper. Below ~25 typically means very blurry.
export async function estimateBlur(file: File): Promise<number> {
  try {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    const W = 240;
    const ratio = W / img.width;
    const H = Math.max(1, Math.round(img.height * ratio));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
    // 3x3 Laplacian
    let sum = 0, sumSq = 0, n = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const v =
          -gray[i - W - 1] - gray[i - W] - gray[i - W + 1]
          - gray[i - 1] + 8 * gray[i] - gray[i + 1]
          - gray[i + W - 1] - gray[i + W] - gray[i + W + 1];
        sum += v; sumSq += v * v; n++;
      }
    }
    const mean = sum / n;
    URL.revokeObjectURL(img.src);
    return sumSq / n - mean * mean;
  } catch {
    return 999;
  }
}

export function uploadWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (pct: number) => void
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });
}
