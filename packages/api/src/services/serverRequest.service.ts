// 服务器申请临时存储(未来迁移到数据库)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUESTS_FILE = path.join(__dirname, '../../data/server-requests.json');

interface ServerRequest {
  id: string;
  name: string;
  description?: string;
  reason: string;
  requesterId: string;
  requesterName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewNote?: string;
  serverId?: string;
  createdAt: string;
  updatedAt: string;
}

// 确保数据目录存在
const ensureDataDir = () => {
  const dataDir = path.dirname(REQUESTS_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(REQUESTS_FILE)) {
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify([], null, 2));
  }
};

const readRequests = (): ServerRequest[] => {
  ensureDataDir();
  const data = fs.readFileSync(REQUESTS_FILE, 'utf-8');
  return JSON.parse(data);
};

const writeRequests = (requests: ServerRequest[]) => {
  ensureDataDir();
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2));
};

export const serverRequestService = {
  /**
   * 创建服务器申请
   */
  create(
    requesterId: string,
    requesterName: string,
    name: string,
    description: string | undefined,
    reason: string
  ): ServerRequest {
    const requests = readRequests();
    const newRequest: ServerRequest = {
      id: nanoid(),
      name,
      description,
      reason,
      requesterId,
      requesterName,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    requests.push(newRequest);
    writeRequests(requests);
    return newRequest;
  },

  /**
   * 获取所有申请
   */
  getAll(): ServerRequest[] {
    return readRequests();
  },

  /**
   * 获取待审批的申请
   */
  getPending(): ServerRequest[] {
    return readRequests().filter((r) => r.status === 'PENDING');
  },

  /**
   * 获取用户的申请
   */
  getByUser(userId: string): ServerRequest[] {
    return readRequests().filter((r) => r.requesterId === userId);
  },

  /**
   * 审批申请
   */
  review(
    requestId: string,
    reviewerId: string,
    approved: boolean,
    reviewNote?: string,
    serverId?: string
  ): ServerRequest | null {
    const requests = readRequests();
    const request = requests.find((r) => r.id === requestId);
    if (!request) return null;

    request.status = approved ? 'APPROVED' : 'REJECTED';
    request.reviewedBy = reviewerId;
    request.reviewNote = reviewNote;
    request.serverId = serverId;
    request.updatedAt = new Date().toISOString();

    writeRequests(requests);
    return request;
  },

  /**
   * 删除申请
   */
  delete(requestId: string): boolean {
    const requests = readRequests();
    const index = requests.findIndex((r) => r.id === requestId);
    if (index === -1) return false;

    requests.splice(index, 1);
    writeRequests(requests);
    return true;
  },
};
