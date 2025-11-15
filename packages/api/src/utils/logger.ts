import path from 'path';
import { fileURLToPath } from 'url';

import winston from 'winston';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { combine, timestamp, printf, colorize, json } = winston.format;

// 定义日志级别
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// 开发环境下的日志格式
const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, ...metadata }) => {
    let meta = '';
    if (metadata && Object.keys(metadata).length > 0) {
      // 如果元数据是错误对象，特殊处理
      if (metadata.stack) {
        meta = `\n${metadata.stack}`;
      } else {
        try {
          meta = JSON.stringify(metadata, null, 2);
        } catch {
          meta = '[Unserializable metadata]';
        }
      }
    }
    return `${ts} [${level}]: ${message} ${meta}`;
  })
);

// 生产环境下的日志格式
const prodFormat = combine(timestamp(), json());

const isProduction = process.env.NODE_ENV === 'production';

// 创建日志根目录
const logDir = path.join(__dirname, '../../logs');

const transports: winston.transport[] = [
  // 开发环境下输出到控制台
  new winston.transports.Console({
    level: 'debug',
    format: isProduction ? prodFormat : devFormat,
  }),
];

// 生产环境下额外输出到文件
if (isProduction) {
  transports.push(
    new winston.transports.File({
      level: 'info',
      filename: path.join(logDir, 'combined.log'),
      format: prodFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  transports.push(
    new winston.transports.File({
      level: 'error',
      filename: path.join(logDir, 'error.log'),
      format: prodFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

const logger = winston.createLogger({
  level: isProduction ? 'info' : 'debug',
  levels,
  format: isProduction ? prodFormat : devFormat,
  transports,
  exitOnError: false, // 在未捕获的异常上不退出
});

export default logger;
