const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS for cross-origin requests (e.g., static frontend on Vercel)
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow if origin is in the allowed list
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,  // Required for cookies/sessions
}));

// Configure middleware
app.use(bodyParser.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for Render (uses reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Configure session
const isProduction = process.env.NODE_ENV === 'production';
const isCrossOrigin = allowedOrigins.length > 0;

app.use(session({
  secret: process.env.SESSION_SECRET || 'kroger-grocery-assistant-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,           // HTTPS only in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24,    // 24 hours
    sameSite: isCrossOrigin ? 'none' : 'lax',  // 'none' required for cross-origin cookies
  }
}));

// Make session available to all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Import routes
const authRoutes = require('./routes/auth');
const groceryRoutes = require('./routes/groceries');

// Health check endpoint (responds quickly for cold start detection)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Use routes
app.use('/auth', authRoutes);
app.use('/groceries', groceryRoutes);

// Home route
app.get('/', (req, res) => {
  if (!req.session.krogerToken) {
    return res.redirect('/auth/login');
  }
  res.redirect('/groceries/list');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});