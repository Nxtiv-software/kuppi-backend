import express, { Request, Response, NextFunction } from "express";
const cors = require("cors")
import "dotenv/config";
import { connectDB } from "./config/db";
import userRouter from "./routes/user";
import signUpRouter from "./routes/signup";
import loginRouter from "./routes/login";
import router from "./routes/polls";
import refreshRouter from "./routes/refreshToken";
import sessionsRouter from "./routes/sessions";
import webHookrouter from "./routes/clerkWebhook";
import clerkSyncRouter from "./routes/clerkSync";
import adminRouter from "./routes/admin";

const app = express();

// Dynamic CORS configuration to allow any localhost port
app.use(cors({
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, Postman, or same-origin)
    if (!origin) return callback(null, true);
    
    // Allow any localhost or 127.0.0.1 with any port
    if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }
    
    // Block other origins
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
}));
app.options('*', cors());

// Clerk webhook route BEFORE express.json() - needs raw body for signature verification
app.use('/clerk', webHookrouter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  // Reduced logging for frequent API calls
  const now = Date.now();
  const logKey = `request_log_${req.path}`;
  const lastLog = (global as any)[logKey] || 0;
  
  // Only log each endpoint every 2 minutes, or always log non-GET requests
  if (req.method !== 'GET' || now - lastLog > 120000) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log("Request body:", JSON.stringify(req.body, null, 2));
    }
    (global as any)[logKey] = now;
  }
  next();
});

connectDB();

app.use('/auth', signUpRouter);
app.use('/auth', refreshRouter);
app.use('/login', loginRouter);
app.use('/polls', router);
app.use('/sessions', sessionsRouter);
app.use('/api/user', userRouter);
app.use('/api/clerk-sync', clerkSyncRouter);
app.use('/api/admin', adminRouter);

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'Poll Management API',
    version: '1.0.0',
    description: 'API for managing educational polls and sessions',
    endpoints: {
      auth: '/auth',
      login: '/login',
      polls: '/polls',
      admin: '/api/admin',
      user: '/api/user',
      // clerk: '/clerk', // Commented out until implemented
      health: '/health'
    }
  });
});

app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: ['/auth', '/login', '/polls', '/sessions', '/health', '/api']
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Global error handler:', err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: Object.values(err.errors).map((e: any) => e.message)
    });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid ID format' });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({ success: false, message: 'Duplicate field value' });
  }
  
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 8000;
console.log('Starting server on port:', PORT);
const server = app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT. Graceful shutdown...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});