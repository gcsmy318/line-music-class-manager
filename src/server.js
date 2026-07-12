require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const {
  verifySignature
} = require('./services/lineService');

const {
  startAttendanceSummaryJob
} = require('./jobs/attendanceSummaryJob');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(cors());

app.use(
  '/public',
  express.static(path.join(__dirname, 'public'))
);

app.use(cookieParser());

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb'
  })
);

/**
 * สำคัญ:
 * verifySignature จะเก็บ req.rawBody
 * สำหรับตรวจ x-line-signature จาก LINE
 */
app.use(
  express.json({
    limit: '10mb',
    verify: verifySignature
  })
);

app.use(methodOverride('_method'));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'dev-secret',

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.NODE_ENV ===
        'production'
    }
  })
);

app.use(flash());

app.use((req, res, next) => {
  res.locals.success =
    req.flash('success');

  res.locals.error =
    req.flash('error');

  res.locals.user =
    req.session.user || null;

  next();
});

app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

/**
 * Authentication
 */
app.use(
  '/auth',
  require('./routes/auth')
);

app.use(
  '/',
  require('./routes/auth')
);

/**
 * Dashboard และ Admin
 */
app.use(
  '/dashboard',
  require('./routes/dashboard')
);

app.use(
  '/admin/actions',
  require('./routes/adminActions')
);

app.use(
  '/admin/register-json',
  require('./routes/registerJson')
);

app.use(
  '/admin/bookings',
  require('./routes/adminBookings')
);

app.use(
  '/admin',
  require('./routes/adminHome')
);

app.use(
  '/admin',
  require('./routes/crud')
);

/**
 * Student และ Teacher
 */
app.use(
  '/student',
  require('./routes/student')
);

app.use(
  '/teacher',
  require('./routes/teacher')
);

/**
 * ห้องซ้อม
 */
app.use(
  '/room-confirm',
  require('./routes/roomConfirm')
);

app.use(
  '/room-reports',
  require('./routes/roomReports')
);

app.use(
  '/booking',
  require('./routes/booking')
);

/**
 * เช็กชื่อและรายงาน
 */
app.use(
  '/checkin',
  require('./routes/checkin')
);

app.use(
  '/import',
  require('./routes/import')
);

app.use(
  '/reports',
  require('./routes/reports')
);

app.use(
  '/room-usage',
  require('./routes/roomUsage')
);

/**
 * LINE Webhook
 *
 * route ข้างในเป็น /webhook
 * URL จริงจึงเป็น /webhook
 */
app.use(
  '/',
  require('./routes/lineWebhook')
);

/**
 * ตรวจสอบ session
 * ควรปิดหรือลบใน production
 */
app.get('/session-test', (req, res) => {
  res.json({
    session: req.session,
    user:
      req.session.user || null
  });
});

/**
 * 404
 */
app.use((req, res) => {
  res.status(404).render(
    'pages/error',
    {
      title: '404',
      message: 'ไม่พบหน้า',
      user:
        req.session.user || null
    }
  );
});

const port =
  process.env.PORT || 3000;

app.listen(port, () => {
  console.log(
    `LINE Music Class Manager running on ${port}`
  );

  /**
   * เริ่มระบบส่งสรุปเวลา 20:00 น.
   *
   * เรียกเพียงครั้งเดียวหลัง server เริ่มทำงาน
   */
  startAttendanceSummaryJob();
});