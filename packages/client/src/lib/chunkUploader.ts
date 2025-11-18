// 分片上传工具，支持大文件断点续传
export interface ChunkUploadOptions {
  file: File;
  chunkSize?: number; // 默认 5MB
  onProgress?: (percent: number) => void;
  onError?: (err: Error) => void;
  onComplete?: (url: string) => void;
}

const RAW_BASE = import.meta.env.VITE_API_URL ?? '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/?api\/?$/i, '').replace(/\/$/, '') : '';
const UPLOAD_CHUNK_ENDPOINT = API_BASE ? `${API_BASE}/api/upload-chunk` : '/api/upload-chunk';
const MERGE_CHUNKS_ENDPOINT = API_BASE ? `${API_BASE}/api/merge-chunks` : '/api/merge-chunks';

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
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(UPLOAD_CHUNK_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers,
      });

      if (!res.ok) {
        const text = await res.text();
        const err = new Error(`Chunk upload failed: ${res.status} ${text}`);
        if (onError) onError(err);
        return;
      }

      if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
    } catch (err) {
      if (onError) onError(err as Error);
      return;
    }
  }
  // 分片全部上传后，通知后端合并
  try {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const mergeRes = await fetch(MERGE_CHUNKS_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fileId, filename: file.name, totalChunks }),
    });

    if (!mergeRes.ok) {
      const text = await mergeRes.text();
      const err = new Error(`Merge failed: ${mergeRes.status} ${text}`);
      if (onError) onError(err);
      return;
    }

    const result = await mergeRes.json();
    if (result.success && onComplete) onComplete(result.url);
  } catch (err) {
    if (onError) onError(err as Error);
  }
}
