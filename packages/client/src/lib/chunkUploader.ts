export interface ChunkUploadOptions {
  file: File;
  chunkSize?: number; // 建议 10MB - 20MB
  concurrency?: number; // 并发数，建议 3-5
  onProgress?: (percent: number) => void;
}

const RAW_BASE = import.meta.env.VITE_API_URL ?? '';
const API_BASE = RAW_BASE ? RAW_BASE.replace(/\/?api\/?$/i, '').replace(/\/$/, '') : '';
const UPLOAD_CHUNK_ENDPOINT = API_BASE ? `${API_BASE}/api/upload-chunk` : '/api/upload-chunk';
const MERGE_CHUNKS_ENDPOINT = API_BASE ? `${API_BASE}/api/merge-chunks` : '/api/merge-chunks';

export function uploadFileInChunks(options: ChunkUploadOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const { file, chunkSize = 10 * 1024 * 1024, concurrency = 3, onProgress } = options;
    
    const executeUpload = async () => {
      const totalChunks = Math.ceil(file.size / chunkSize);
      const safeName = encodeURIComponent(file.name);
      const fileId = `${safeName}-${file.size}-${file.lastModified}`;
      
      // 记录已完成的分片数
      let completedChunks = 0;
      // 记录是否有错误发生
      let hasError = false;

      // 上传单个分片的函数
      const uploadSingleChunk = async (index: number) => {
        if (hasError) return; // 如果已经报错，后续不再请求

        const start = index * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        const chunk = file.slice(start, end);
        
        const formData = new FormData();
        formData.append('chunk', chunk, file.name);
        formData.append('fileId', fileId);
        formData.append('chunkIndex', String(index));
        formData.append('totalChunks', String(totalChunks));

        const token = localStorage.getItem('token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        try {
          // 设置重试机制，防止网络抖动导致失败
          let retries = 3;
          while (retries > 0) {
            try {
              const res = await fetch(UPLOAD_CHUNK_ENDPOINT, {
                method: 'POST',
                body: formData,
                headers,
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              break; // 成功则跳出重试循环
            } catch (e) {
              retries--;
              if (retries === 0) throw e;
              await new Promise(r => setTimeout(r, 1000)); // 失败等待1秒重试
            }
          }

          completedChunks++;
          if (onProgress) {
            onProgress(Math.round((completedChunks / totalChunks) * 100));
          }
        } catch (err) {
          hasError = true;
          throw err;
        }
      };

      try {
        // --- 并发控制逻辑 ---
        const queue = Array.from({ length: totalChunks }, (_, i) => i);
        const workers = Array.from({ length: Math.min(concurrency, totalChunks) }, async () => {
          while (queue.length > 0 && !hasError) {
            const chunkIndex = queue.shift();
            if (chunkIndex !== undefined) {
              await uploadSingleChunk(chunkIndex);
            }
          }
        });

        // 等待所有并发任务完成
        await Promise.all(workers);

        if (hasError) throw new Error('部分分片上传失败');

        // --- 合并请求 ---
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
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    executeUpload().catch(error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}