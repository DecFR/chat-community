import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises'; // 🟢 新增：引入流式管道工具
import { fileURLToPath } from 'url';

import { Router } from 'express';
import multer from 'multer';

import { authMiddleware } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = Router();
// 兼容不同的目录结构，确保路径正确
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const CHUNK_DIR = path.resolve(__dirname, '../../uploads/chunks');

// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR, { recursive: true });

const chunkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, CHUNK_DIR);
  },
  filename: (_req, file, cb) => {
    // 使用原始文件名暂存，后续会重命名
    cb(null, file.originalname);
  },
});

// 单片限制 (建议稍微放宽一点，比如 50MB，防止客户端切片稍大导致报错)
const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// 1. 上传分片接口
router.post('/upload-chunk', authMiddleware, uploadChunk.single('chunk'), async (req, res) => {
  try {
    const file = req.file as Express.Multer.File | undefined;
    const { fileId, chunkIndex, totalChunks } = req.body;

    if (!fileId || chunkIndex === undefined || !totalChunks) {
      return res.status(400).json({ success: false, error: '参数缺失' });
    }
    if (!file) {
      return res.status(400).json({ success: false, error: '文件缺失' });
    }

    // 重命名分片：fileId_chunkIndex
    const chunkName = `${fileId}_${chunkIndex}`;
    const targetPath = path.join(CHUNK_DIR, chunkName);

    // 移动/重命名文件 (renameSync 比 copy 快且节省空间)
    fs.renameSync(file.path, targetPath);

    return res.json({ success: true });
  } catch (error) {
    console.error('Upload chunk error:', error);
    return res.status(500).json({ success: false, error: '分片保存失败' });
  }
});

// 2. 合并分片接口 (核心修复部分)
// 读取环境变量，如果没有则默认 3GB
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '3221225472');

router.post('/merge-chunks', authMiddleware, async (req, res) => {
  // 定义 writeStream 在外层，方便 try/catch 中关闭
  let writeStream: fs.WriteStream | null = null;

  try {
    const { fileId, filename, totalChunks } = req.body;
    if (!fileId || !filename || !totalChunks) {
      return res.status(400).json({ success: false, error: '参数缺失' });
    }

    // 1. 预检查：计算总大小 & 检查分片完整性
    let totalSize = 0;
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(CHUNK_DIR, `${fileId}_${i}`);
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({ success: false, error: `分片缺失: 第 ${i + 1} 片` });
      }
      const stat = fs.statSync(chunkPath);
      totalSize += stat.size;
    }

    if (totalSize > MAX_FILE_SIZE) {
      // 清理分片 (可选，避免占用空间)
      // for (let i = 0; i < totalChunks; i++) fs.unlinkSync(path.join(CHUNK_DIR, `${fileId}_${i}`));
      return res.status(400).json({
        success: false,
        error: `文件大小 (${(totalSize / 1024 / 1024).toFixed(2)}MB) 超过限制`,
      });
    }

    // 2. 准备写入流
    const uniqueFilename = `media-${fileId}-${Date.now()}${path.extname(filename)}`;
    const finalPath = path.join(UPLOAD_DIR, uniqueFilename);
    writeStream = fs.createWriteStream(finalPath);

    // 3. 🟢 核心修复：使用 Stream Pipeline 逐个合并
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(CHUNK_DIR, `${fileId}_${i}`);

      // 创建可读流
      const readStream = fs.createReadStream(chunkPath);

      // 使用 pipeline 管道传输：自动处理背压(Backpressure)，防止内存溢出
      // end: false 表示写完一个分片后，不要关闭写入流，因为还要写下一个
      await pipeline(readStream, writeStream, { end: false });

      // 写完一个删一个，释放磁盘空间
      fs.unlinkSync(chunkPath);
    }

    // 4. 全部写完，关闭流
    writeStream.end();

    return res.json({ success: true, url: `/uploads/${uniqueFilename}` });
  } catch (error) {
    console.error('Merge chunks error:', error);
    // 如果出错，确保流被关闭，防止文件锁死
    if (writeStream) writeStream.destroy();
    return res
      .status(500)
      .json({ success: false, error: '分片合并失败: ' + (error as Error).message });
  }
});

export default router;
