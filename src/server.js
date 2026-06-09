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
        const lineUserId = event.source.userId;

        let replyText = "";

        if (text === "ลงทะเบียน") {
          replyText =
            "กรุณาส่งข้อมูลตามรูปแบบนี้:\n\n" +
            "ลงทะเบียน\n" +
            "รหัสนิสิต: 66000001\n" +
            "ชื่อ-สกุล: สมชาย ใจดี\n" +
            "เบอร์โทร: 0812345678\n" +
            "อีเมล: somchai@example.com\n" +
            "วิชาเอก: ดนตรีสากล\n" +
            "ชั้นปี: 1\n" +
            "เครื่องดนตรีหลัก: Guitar\n" +
            "สถานที่ทำงาน: ร้าน ABC\n" +
            "ชั่วโมงทำงานต่อสัปดาห์: 20\n" +
            "รายได้โดยประมาณ: 5000";

        } else if (text.startsWith("ลงทะเบียน")) {
          const studentId = text.match(/รหัสนิสิต:\s*(.*)/)?.[1]?.trim();
          const fullName = text.match(/ชื่อ-สกุล:\s*(.*)/)?.[1]?.trim();
          const phone = text.match(/เบอร์โทร:\s*(.*)/)?.[1]?.trim();
          const email = text.match(/อีเมล:\s*(.*)/)?.[1]?.trim();
          const major = text.match(/วิชาเอก:\s*(.*)/)?.[1]?.trim();
          const year = text.match(/ชั้นปี:\s*(.*)/)?.[1]?.trim();
          const mainInstrument = text.match(/เครื่องดนตรีหลัก:\s*(.*)/)?.[1]?.trim();
          const workPlace = text.match(/สถานที่ทำงาน:\s*(.*)/)?.[1]?.trim() || "";
          const workHoursPerWeek = text.match(/ชั่วโมงทำงานต่อสัปดาห์:\s*(.*)/)?.[1]?.trim() || "";
          const income = text.match(/รายได้โดยประมาณ:\s*(.*)/)?.[1]?.trim() || "";

          if (!studentId || !fullName || !phone || !email) {
            replyText =
              "ข้อมูลไม่ครบ กรุณาส่งแบบนี้:\n\n" +
              "ลงทะเบียน\n" +
              "รหัสนิสิต: 66000001\n" +
              "ชื่อ-สกุล: สมชาย ใจดี\n" +
              "เบอร์โทร: 0812345678\n" +
              "อีเมล: somchai@example.com\n" +
              "วิชาเอก: ดนตรีสากล\n" +
              "ชั้นปี: 1\n" +
              "เครื่องดนตรีหลัก: Guitar";
          } else {
            await db.collection("users").doc(studentId).set({
              userId: studentId,
              role: "student",
              studentId,
              name: fullName,
              phone,
              email,
              lineUserId,
              status: "pending",
              createdAt: new Date().toISOString()
            }, { merge: true });

            await db.collection("students").doc(studentId).set({
              studentId,
              fullName,
              phone,
              email,
              major,
              year,
              mainInstrument,
              workPlace,
              workHoursPerWeek,
              income,
              lineUserId,
              createdAt: new Date().toISOString()
            }, { merge: true });

            replyText =
              "ลงทะเบียนสำเร็จแล้ว\n" +
              "สถานะ: รอ Admin อนุมัติ\n\n" +
              `รหัสนิสิต: ${studentId}\n` +
              `ชื่อ: ${fullName}`;
          }

        } else if (text.startsWith("ขอลิงค์")) {
          replyText = "รับคำขอสร้าง QR Code แล้ว กรุณาระบุรหัสวิชา เช่น ขอลิงค์ MUS101";

        } else if (text.startsWith("ส่งงาน")) {
          replyText = "รับข้อมูลการส่งงานแล้ว";

        } else if (text.startsWith("ลา")) {
          replyText = "รับข้อมูลการลาแล้ว";

        } else {
          replyText =
            "ระบบ LINE Music Class Manager\n\n" +
            "คำสั่งที่ใช้ได้:\n" +
            "ลงทะเบียน\n" +
            "ขอลิงค์ MUS101\n" +
            "ส่งงาน MUS101 ลิงก์ YouTube\n" +
            "ลา MUS101 ลาป่วย เหตุผล";
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