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

const app = express();
app.set('trust proxy', 1);
app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));

app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors());
app.use('/public', express.static(path.join(__dirname,'public')));
app.use(cookieParser());
app.use(express.urlencoded({extended:true, limit:'10mb'}));
app.use(express.json({ verify: verifySignature, limit:'10mb' }));
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

/* LINE webhook */
app.post("/webhook", async (req, res) => {
  try {
    console.log("LINE webhook body:", JSON.stringify(req.body, null, 2));

    const events = req.body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const text = event.message.text.trim();

        let replyText = "";

        if (text === "ลงทะเบียน") {
          replyText =
            "ลงทะเบียนนิสิต\n\nกรุณาส่งข้อมูลตามรูปแบบนี้:\nลงทะเบียนนิสิต รหัสนิสิต ชื่อ-สกุล เบอร์โทร อีเมล";
        } else if (text.startsWith("ขอลิงค์")) {
          replyText = "รับคำขอสร้าง QR Code แล้ว กรุณาระบุรหัสวิชา เช่น ขอลิงค์ MUS101";
        } else if (text.startsWith("ส่งงาน")) {
          replyText = "รับข้อมูลการส่งงานแล้ว";
        } else if (text.startsWith("ลา")) {
          replyText = "รับข้อมูลการลาแล้ว";
        } else {
          replyText =
            "ระบบ LINE Music Class Manager\n\nคำสั่งที่ใช้ได้:\nลงทะเบียน\nขอลิงค์ MUS101\nส่งงาน MUS101 ลิงก์ YouTube\nลา MUS101 ลาป่วย เหตุผล";
        }

        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [
              {
                type: "text",
                text: replyText
              }
            ]
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook error:", error.response?.data || error.message);
    res.status(200).json({ ok: false });
  }
});

/* ถ้าต้องการใช้ route เดิม /line ด้วย */
app.use('/line', require('./routes/lineWebhook'));

app.use('/checkin', require('./routes/checkin'));
app.use('/import', require('./routes/import'));
app.use('/reports', require('./routes/reports'));

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