import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import paymentRoutes from './routes/payment.js';
import notifyRoutes from './routes/notify.js';

dotenv.config();

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));

// Firebase Admin init
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}
export const db = admin.firestore();

// Auth middleware
export async function verifyToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// Routes
app.use('/api/payment', paymentRoutes);
app.use('/api/notify', notifyRoutes);

app.get('/', (_, res) => res.json({ status: 'Anureet Backend OK', time: new Date().toISOString() }));

// Cashfree webhook (raw body handled inline)
app.post('/api/payment/webhook', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    const timestamp = req.headers['x-webhook-timestamp'];
    const { verifyWebhook } = await import('./services/cashfree.js');
    const ok = await verifyWebhook(req.body, signature, timestamp);
    if (!ok) return res.status(400).send('Invalid signature');

    const payload = JSON.parse(req.body.toString());
    const orderId = payload?.data?.order?.order_id;
    const status = payload?.data?.payment?.payment_status;

    if (orderId && status === 'SUCCESS') {
      const snap = await db.collection('applications').where('cashfreeOrderId','==',orderId).get();
      for (const doc of snap.docs) {
        await doc.ref.update({
          paymentStatus: 'Paid',
          status: 'Pending',
          paymentRef: payload?.data?.payment?.cf_payment_id || '',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(500).send('Error');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Backend running on port ${PORT}`));
