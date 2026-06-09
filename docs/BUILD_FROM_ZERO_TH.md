# ลำดับ Build โปรเจกต์ LINE Music Class Manager ตั้งแต่ต้น

## 1) เตรียมเครื่อง
ติดตั้ง Node.js 20+, Git และ VS Code

```bash
node -v
npm -v
git -v
```

## 2) สร้าง Firebase Project
1. เข้า Firebase Console
2. Create Project
3. เปิด Firestore Database แบบ Production Mode
4. ไปที่ Project settings > Service accounts
5. Generate new private key
6. นำค่า project_id, client_email, private_key ไปใส่ Environment Variables บน Render

หมายเหตุ: โปรเจกต์นี้ไม่ใช้ storage.rules ตามที่ต้องการ

## 3) Deploy Firestore Rules
ติดตั้ง Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

ถ้าใช้ไฟล์ในโปรเจกต์นี้แล้ว ให้ใช้:

```bash
firebase deploy --only firestore:rules
```

## 4) สร้าง LINE Official Account และ Messaging API
1. เข้า LINE Developers
2. สร้าง Provider
3. สร้าง Messaging API Channel
4. เอา Channel access token และ Channel secret ไปใส่ Render
5. Webhook URL หลัง deploy:

```text
https://YOUR_RENDER_URL/line/webhook
```

เปิด Use webhook = Enabled

## 5) สร้าง LINE Login Channel
1. สร้าง LINE Login Channel
2. Callback URL:

```text
https://YOUR_RENDER_URL/auth/line/callback
```

3. เอา Channel ID / Channel Secret ไปใส่ Render

## 6) ทดสอบ Local
คัดลอกไฟล์ env

```bash
cp .env.example .env
npm install
npm run seed:admin
npm run dev
```

เปิด:

```text
http://localhost:3000
```

## 7) Push ขึ้น GitHub
```bash
git init
git add .
git commit -m "initial line music class manager"
git branch -M main
git remote add origin https://github.com/YOUR_USER/line-music-class-manager.git
git push -u origin main
```

## 8) Deploy บน Render แบบประหยัดเงิน
1. New > Web Service
2. Connect GitHub repo
3. เลือก Free plan
4. Build Command:

```bash
npm install
```

5. Start Command:

```bash
npm start
```

6. เพิ่ม Environment Variables ตาม .env.example

## 9) Seed Admin บน Render
เปิด Shell ของ Render แล้วรัน:

```bash
npm run seed:admin
```

หรือรัน local กับ Firebase project เดียวกันก็ได้

## 10) ค่า Environment Variables สำคัญ
```env
NODE_ENV=production
WEB_BASE_URL=https://YOUR_RENDER_URL
SESSION_SECRET=สุ่มยาวๆ
JWT_SECRET=สุ่มยาวๆ
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_LOGIN_CALLBACK_URL=https://YOUR_RENDER_URL/auth/line/callback
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ตั้งเอง
```

## 11) รูปแบบ Excel Import นิสิต
ไฟล์ .xlsx แถวแรกเป็น header เช่น:

| studentId | fullName | email | phone | major | year | mainInstrument |

หรือภาษาไทย:

| รหัสนิสิต | ชื่อ-สกุล | อีเมล | เบอร์โทรศัพท์ | วิชาเอก | ชั้นปี | เครื่องดนตรีหลัก |

## 12) LINE Command หลัก
- ลงทะเบียน ชื่อ-สกุล
- ลงทะเบียนอาจารย์ ชื่อ-สกุล
- ลงทะเบียนเจ้าหน้าที่ ชื่อ-สกุล
- ขอลิงค์ MUS101
- ส่งงาน MUS101 https://youtube.com/xxx
- ลา MUS101 ลาป่วย เป็นไข้
- ข้อมูลของฉัน
- สรุปวันนี้ MUS101

## 13) จุดประหยัดเงิน
- ใช้ Render Free เริ่มต้น
- ใช้ Firebase Spark เริ่มต้น
- ยังไม่ใช้ Firebase Storage
- เก็บ YouTube URL แทนการอัปโหลดวิดีโอ
- Export Excel สร้างแบบ on-demand ไม่เก็บไฟล์
