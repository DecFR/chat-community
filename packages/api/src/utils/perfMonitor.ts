import os from 'os';

import { notifyAdmins } from './adminNotify';

let lastNotify = 0;
const NOTIFY_INTERVAL = 10 * 60 * 1000; // 10分钟内只通知一次

export async function monitorPerformance() {
  const cpuLoad = os.loadavg()[0]; // 1分钟平均负载
  const cpuCores = os.cpus().length;
  const memUsage = (os.totalmem() - os.freemem()) / os.totalmem();

  let warn = '';
  if (cpuLoad > cpuCores * 0.9) {
    warn += `CPU负载过高：${cpuLoad.toFixed(2)} / ${cpuCores}\n`;
  }
  if (memUsage > 0.9) {
    warn += `内存占用过高：${(memUsage * 100).toFixed(1)}%\n`;
  }
  // 可扩展更多指标

  if (warn && Date.now() - lastNotify > NOTIFY_INTERVAL) {
    await notifyAdmins(`【系统性能预警】\n${warn}`);
    lastNotify = Date.now();
  }
}

// 定时监控
export function startPerfMonitor() {
  setInterval(() => {
    monitorPerformance().catch(() => {});
  }, 60 * 1000); // 每分钟检查一次
}
