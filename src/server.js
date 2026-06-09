require('dotenv').config();
const axios = require('axios');
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { verifySignature } = require('./services/lineService');
const { db } = require('./config/firebase');
const app = express();
app.set('trust proxy', 1);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));

app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors());
app.use('/public', express.static(path.join(__dirname,'public')));
app.use(cookieParser());
app.use(express.urlencoded({extended:true, limit:'10mb'}));
app.use(express.json({ limit:'10mb' }));
app.use(methodOverride('_method'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(flash());
app.use((req,res,next)=>{
  res.locals.success=req.flash('success');
  res.locals.error=req.flash('error');
  next();
});

app.get('/',(req,res)=>res.redirect('/dashboard'));

app.use('/auth', require('./routes/auth'));
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/admin/actions', require('./routes/adminActions'));
app.use('/admin', require('./routes/crud'));

app.use('/', require('./routes/lineWebhook'));

app.use('/checkin', require('./routes/checkin'));
app.use('/import', require('./routes/import'));
app.use('/reports', require('./routes/reports'));
app.use('/booking', require('./routes/booking'));


app.get('/session-test', (req, res) => {
  res.json({
    session: req.session,
    user: req.session.user || null
  });
});

/* 404 ต้องอยู่ท้ายสุดเสมอ */
app.use((req,res)=>res.status(404).render('pages/error',{
  title:'404',
  message:'ไม่พบหน้า',
  user:req.session.user
}));

const port=process.env.PORT || 3000;

app.listen(port,()=>console.log(`LINE Music Class Manager running on ${port}`));