// 分片上传工具，支持大文件断点续传
export interface ChunkUploadOptions {
  file: File;
  chunkSize?: number; // 默认 5MB
  onProgress?: (percent: number) => void;
}

const RAW_BASE = import.meta.env.VITE_API_URL ?? '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/?api\/?$/i, '').replace(/\/$/, '') : '';
const UPLOAD_CHUNK_ENDPOINT = API_BASE ? `${API_BASE}/api/upload-chunk` : '/api/upload-chunk';
const MERGE_CHUNKS_ENDPOINT = API_BASE ? `${API_BASE}/api/merge-chunks` : '/api/merge-chunks';

export function uploadFileInChunks(options: ChunkUploadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const { file, chunkSize = 5 * 1024 * 1024, onProgress } = options;
    
    // 在 Promise 内部定义异步函数来执行逻辑，避免 no-async-promise-executor 报错
    const executeUpload = async () => {
      const totalChunks = Math.ceil(file.size / chunkSize);
      // 对文件名进行编码，防止特殊字符导致后端解析错误
      const safeName = encodeURIComponent(file.name);
      const fileId = `${safeName}-${file.size}-${file.lastModified}`;

      try {
        // 1. 循环上传每个分片
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(file.size, start + chunkSize);
          const chunk = file.slice(start, end);
          
          const formData = new FormData();
          formData.append('chunk', chunk, file.name);
          formData.append('fileId', fileId);
          formData.append('chunkIndex', String(i));
          formData.append('totalChunks', String(totalChunks));

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
            throw new Error(`分片上传失败 (${res.status}): ${text}`);
          }

          if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        // 2. 所有分片上传完毕，请求后端合并
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
          throw new Error(`合并文件失败 (${mergeRes.status}): ${text}`);
        }

        const result = await mergeRes.json();
        if (result.success && result.url) {
          resolve(result.url);
        } else {
          throw new Error(result.message || '合并后未返回 URL');
        }
      } catch (err) {
        // 捕获所有错误并 Reject Promise
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // 执行异步逻辑
    executeUpload().catch(error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}