const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure middleware
app.use(bodyParser.json({ limit: '50mb' })); // Increase limit for base64 images
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Trust proxy for Render (uses reverse proxy)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Configure session
app.use(session({
  secret: process.env.SESSION_SECRET || 'kroger-grocery-assistant-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    sameSite: 'lax'
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