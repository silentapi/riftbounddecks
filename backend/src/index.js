import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import logger from './config/logger.js';
import { getMasterRegistrationKey } from './config/masterKey.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import deckRoutes from './routes/decks.js';
import cardRoutes from './routes/cards.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ ERROR: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease ensure these are set in your .env file or environment.');
  console.error('For JWT_SECRET, generate a secure value with: openssl rand -hex 32');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// CORS configuration - allow requests from frontend URL or any local network IP
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      logger.info('CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    logger.info('CORS: Checking origin', { origin, FRONTEND_URL: process.env.FRONTEND_URL });
    
    // If FRONTEND_URL is set, use it (normalize by removing trailing slash and converting to lowercase)
    if (process.env.FRONTEND_URL) {
      const frontendUrl = process.env.FRONTEND_URL.trim().replace(/\/$/, '').toLowerCase();
      const originNormalized = origin.trim().replace(/\/$/, '').toLowerCase();
      
      logger.info('CORS: Comparing URLs', { 
        originNormalized, 
        frontendUrl, 
        match: originNormalized === frontendUrl,
        originLength: origin.length,
        frontendUrlLength: frontendUrl.length
      });
      
      if (originNormalized === frontendUrl) {
        logger.info('CORS: Allowed by FRONTEND_URL', { origin, frontendUrl });
        return callback(null, true);
      }
      
      // Also allow http version if FRONTEND_URL is https (for development/testing)
      if (frontendUrl.startsWith('https://')) {
        const httpVariant = frontendUrl.replace('https://', 'http://');
        if (originNormalized === httpVariant) {
          logger.info('CORS: Allowed by FRONTEND_URL (http variant)', { origin, frontendUrl, httpVariant });
          return callback(null, true);
        }
      }
      
      // Also allow https version if FRONTEND_URL is http (for production)
      if (frontendUrl.startsWith('http://') && !frontendUrl.startsWith('https://')) {
        const httpsVariant = frontendUrl.replace('http://', 'https://');
        if (originNormalized === httpsVariant) {
          logger.info('CORS: Allowed by FRONTEND_URL (https variant)', { origin, frontendUrl, httpsVariant });
          return callback(null, true);
        }
      }
    }
    
    // Allow localhost
    if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
      logger.info('CORS: Allowed localhost', { origin });
      return callback(null, true);
    }
    
    // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    // Pattern matches: http://192.168.x.x:5173, http://10.x.x.x:5173, http://172.16-31.x.x:5173
    const localNetworkPattern = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+):5173$/;
    if (localNetworkPattern.test(origin)) {
      logger.info('CORS: Allowed local network IP', { origin });
      return callback(null, true);
    }
    
    // Log blocked origins for debugging
    logger.warn('CORS blocked origin:', { 
      origin, 
      FRONTEND_URL: process.env.FRONTEND_URL,
      NODE_ENV: process.env.NODE_ENV 
    });
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Type'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Trust proxy - required when behind nginx reverse proxy
// This allows req.ip, req.protocol, etc. to work correctly
app.set('trust proxy', 1);

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware (must be before routes)
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/decks', deckRoutes);
app.use('/api/cards', cardRoutes);

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);


// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Start Express server - listen on all interfaces (0.0.0.0) to allow network access
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        host: '0.0.0.0',
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        accessibleAt: `http://localhost:${PORT} and http://<your-ip>:${PORT}`
      });
      
      // Log master registration key to console
      const masterKey = getMasterRegistrationKey();
      console.log('\n' + '='.repeat(60));
      console.log('🔑 MASTER REGISTRATION KEY (Generated on boot)');
      console.log('='.repeat(60));
      console.log(`Key: ${masterKey}`);
      console.log('Note: This key is valid for unlimited registrations');
      console.log('      It will change on the next server restart');
      console.log('='.repeat(60) + '\n');
      
      logger.info('Master registration key generated', {
        key: masterKey,
        note: 'Key is in-memory only and will change on restart'
      });
    });
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', {
    error: err.message,
    stack: err.stack
  });
  process.exit(1);
});

// Start the server
startServer();

export default app;

