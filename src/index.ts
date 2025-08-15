import express, { Request, Response, NextFunction } from "express";
const cors = require("cors")
import "dotenv/config";
import { connectDB } from "./config/db";
import userRouter from "./routes/user";
import signUpRouter from "./routes/signup";
import loginRouter from "./routes/login";
import router from "./routes/polls";
import refreshRouter from "./routes/refreshToken";
// import webHookrouter from "./routes/clerkWebhook"; // Commented out until implemented

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
}));
app.options('*', cors());

// app.use('/clerk', webHookrouter); // Commented out until implemented

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log("Request body:", JSON.stringify(req.body, null, 2));
  }
  next();
});

connectDB();

app.use('/auth', signUpRouter);
app.use('/auth', refreshRouter);
app.use('/login', loginRouter);
app.use('/polls', router);
app.use('/api/user', userRouter);

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
      // clerk: '/clerk', // Commented out until implemented
      health: '/health'
    }
  });
});

app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: ['/auth', '/login', '/polls', '/health', '/api'] // Removed '/clerk'
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
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});