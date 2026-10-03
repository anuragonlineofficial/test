import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { Resend } from 'resend';

dotenv.config();
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));

// Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
  })
});
const db = admin.firestore();

// Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// ============ HELPERS ============
async function verifyToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = await admin.auth().verifyIdToken(token); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

async function sendEmail(subject, html) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'noreply@anureetprivatelimited.shop',
      to: process.env.ADMIN_EMAIL,
      subject, html
    });
  } catch (e) { console.error('Email:', e.message); }
}

async function sendTelegram(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' })
    });
  } catch (e) { console.error('TG:', e.message); }
}

// ============ CASHFREE ============
const CF_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

async function cashfreeOrder(orderId, amount, uid, email, phone, returnUrl) {
  const res = await fetch(`${CF_BASE}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-version': '2023-08-01',
      'x-client-id': process.env.CASHFREE_APP_ID,
      'x-client-secret': process.env.CASHFREE_SECRET_KEY
    },
    body: JSON.stringify({
      order_id: orderId, order_amount: amount, order_currency: 'INR',
      customer_details: { customer_id: uid, customer_email: email, customer_phone: phone },
      order_meta: { return_url: returnUrl }
    })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Cashfree failed');
  return json;
}

// ============ ROUTES ============

// Create order
app.post('/api/payment/create-order', express.json(), verifyToken, async (req, res) => {
  try {
    const { applicationId, amount } = req.body;
    if (!applicationId || !amount) return res.status(400).json({ error: 'Missing fields' });

    const appRef = db.collection('applications').doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) return res.status(404).json({ error: 'Not found' });
    const appData = appSnap.data();
    if (appData.userId !== req.user.uid) return res.status(403).json({ error: 'Forbidden' });

    // Verify fee server-side
    const svcSnap = await db.collection('services').doc(appData.serviceId).get();
    const expected = Number(svcSnap.data()?.fee || 0);
    if (expected !== Number(amount)) return res.status(400).json({ error: 'Amount mismatch' });

    const orderId = 'ANR_' + Date.now() + '_' + applicationId.slice(0, 6);
    const retUrl = `${process.env.FRONTEND_URL}/dashboard.html?order_id={order_id}`;

    const order = await cashfreeOrder(orderId, expected, req.user.uid, req.user.email || 'c@x.com', '9999999999', retUrl);

    await appRef.update({ cashfreeOrderId: orderId, paymentStatus: 'Submitted', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    res.json({ payment_session_id: order.payment_session_id, order_id: orderId, env: process.env.CASHFREE_ENV });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Webhook
app.post('/api/payment/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const sig = req.headers['x-webhook-signature'];
    const ts = req.headers['x-webhook-timestamp'];
    const expected = crypto.createHmac('sha256', process.env.CASHFREE_SECRET_KEY)
      .update(ts + req.body.toString()).digest('base64');
    if (expected !== sig) return res.status(400).send('Bad signature');

    const payload = JSON.parse(req.body.toString());
    const orderId = payload?.data?.order?.order_id;
    const status = payload?.data?.payment?.payment_status;

    if (orderId && status === 'SUCCESS') {
      const snap = await db.collection('applications').where('cashfreeOrderId', '==', orderId).get();
      for (const doc of snap.docs) {
        await doc.ref.update({
          paymentStatus: 'Paid', status: 'Pending',
          paymentRef: payload?.data?.payment?.cf_payment_id || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).send('Error'); }
});

// Notifications
app.use(express.json({ limit: '2mb' }));

app.post('/api/notify/registration', async (req, res) => {
  const { name, email, mobile } = req.body;
  await sendEmail(`New VLE: ${name}`, `<h2>New VLE Registration</h2><p>Name: ${name}</p><p>Email: ${email}</p><p>Mobile: ${mobile}</p>`);
  await sendTelegram(`🎉 New VLE\n👤 ${name}\n📧 ${email}\n📱 ${mobile}`);
  res.json({ ok: true });
});

app.post('/api/notify/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  await sendEmail(`Contact: ${subject}`, `<p>From: ${name} (${email})</p><p>${message}</p>`);
  await sendTelegram(`✉️ Contact\n👤 ${name}\n📌 ${subject}`);
  res.json({ ok: true });
});

app.post('/api/notify/status', async (req, res) => {
  const { applicationId, status } = req.body;
  await sendTelegram(`📋 App ${applicationId}\nStatus: ${status}`);
  res.json({ ok: true });
});

app.post('/api/notify/test-telegram', async (_, res) => {
  await sendTelegram('✅ Test from Anureet backend');
  res.json({ ok: true });
});

app.get('/', (_, res) => res.json({ ok: true, name: 'Anureet Backend' }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend on ${PORT}`));
