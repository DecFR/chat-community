// 分片上传工具，支持大文件断点续传
export interface ChunkUploadOptions {
  file: File;
  chunkSize?: number; // 默认 5MB
  onProgress?: (percent: number) => void;
  onError?: (err: Error) => void;
  onComplete?: (url: string) => void;
}

export async function uploadFileInChunks(options: ChunkUploadOptions) {
  const { file, chunkSize = 5 * 1024 * 1024, onProgress, onError, onComplete } = options;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const fileId = `${file.name}-${file.size}-${file.lastModified}`;

  // 上传每个分片
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    const formData = new FormData();
    formData.append('chunk', chunk, file.name);
    formData.append('fileId', fileId);
    formData.append('chunkIndex', String(i));
    formData.append('totalChunks', String(totalChunks));
    try {
      await fetch('/api/upload-chunk', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
    } catch (err) {
      if (onError) onError(err as Error);
      return;
    }
  }
  // 分片全部上传后，通知后端合并
  try {
    const mergeRes = await fetch('/api/merge-chunks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, filename: file.name, totalChunks }),
    });
    const result = await mergeRes.json();
    if (result.success && onComplete) onComplete(result.url);
  } catch (err) {
    if (onError) onError(err as Error);
  }
}
