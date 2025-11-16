
import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router: Router = Router();
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const CHUNK_DIR = path.resolve(__dirname, '../../uploads/chunks');

// 确保分片临时目录存在
if (!fs.existsSync(CHUNK_DIR)) fs.mkdirSync(CHUNK_DIR, { recursive: true });

const chunkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, CHUNK_DIR);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});

const uploadChunk = multer({
  storage: chunkStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 单片最大 20MB
});

// 上传分片接口
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
    // 分片已保存到 CHUNK_DIR，命名规则 fileId_chunkIndex
    const chunkName = `${fileId}_${chunkIndex}`;
    fs.renameSync(file.path, path.join(CHUNK_DIR, chunkName));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: '分片保存失败' });
  }
});

// 合并分片接口
router.post('/merge-chunks', authMiddleware, async (req, res) => {
  try {
    const { fileId, filename, totalChunks } = req.body;
    if (!fileId || !filename || !totalChunks) {
      return res.status(400).json({ success: false, error: '参数缺失' });
    }
    const finalPath = path.join(UPLOAD_DIR, `media-${fileId}-${Date.now()}${path.extname(filename)}`);
    const writeStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(CHUNK_DIR, `${fileId}_${i}`);
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({ success: false, error: `分片 ${i} 缺失` });
      }
      const data = fs.readFileSync(chunkPath);
      writeStream.write(data);
      fs.unlinkSync(chunkPath);
    }
    writeStream.end();
    return res.json({ success: true, url: `/uploads/${path.basename(finalPath)}` });
  } catch (err) {
    return res.status(500).json({ success: false, error: '分片合并失败' });
  }
});

export default router;
