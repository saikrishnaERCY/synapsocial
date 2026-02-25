require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { startYoutubeAutoReplyJob } = require('./jobs/youtubeAutoReply');
const passport = require('./config/passport');

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://synapsocial.vercel.app',
    /\.vercel\.app$/
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// ✅ FIXED: session works in both local + production
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.JWT_SECRET || 'synapsocial_secret_fallback',
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/instagram', require('./routes/instagram'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/trends', require('./routes/trends'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/platforms/youtube', require('./routes/youtube'));


// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'SynapSocial API is live 🚀' });
});

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log('✅ MongoDB connected');
  startYoutubeAutoReplyJob();
});

console.log("OPENROUTER KEY:", process.env.OPENROUTER_API_KEY?.slice(0, 20) + '...');
console.log("SERP KEY:", process.env.SERP_API_KEY?.slice(0, 10) + '...');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));