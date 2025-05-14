// Health check server for container monitoring
import express, { Request, Response } from 'express';
import { logger } from './utils/logger';

const PORT = process.env.PORT || 8080;
const app = express();

// Track subscriber count
let subscriberCount = 0;

// Create metrics for the health check endpoint
interface HealthMetrics {
  status: string;
  uptime: number;
  timestamp: string;
  version: string;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  subscribers?: number;
}

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  const metrics: HealthMetrics = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      rss: process.memoryUsage().rss / 1024 / 1024,
      heapTotal: process.memoryUsage().heapTotal / 1024 / 1024,
      heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
      external: process.memoryUsage().external / 1024 / 1024,
    }
  };
  
  logger.debug('Health check requested', { metrics });
  res.status(200).json(metrics);
});

// Add a route for monitoring subscribers
export function updateSubscriberCount(count: number): void {
  subscriberCount = count;
  logger.debug(`Updated subscriber count: ${count}`);
}

// Metrics route
app.get('/metrics', (_req: Request, res: Response) => {
  const metrics: HealthMetrics = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      rss: process.memoryUsage().rss / 1024 / 1024,
      heapTotal: process.memoryUsage().heapTotal / 1024 / 1024,
      heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
      external: process.memoryUsage().external / 1024 / 1024,
    },
    subscribers: subscriberCount
  };
  
  logger.debug('Metrics requested', { metrics });
  res.status(200).json(metrics);
});

// Start the health check server
export function startHealthCheckServer(): void {
  app.listen(PORT, () => {
    logger.info(`Health check server running on port ${PORT}`);
  });
}
