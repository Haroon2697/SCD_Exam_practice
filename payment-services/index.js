const express = require('express');
const axios = require('axios');
require('dotenv').config();
const mongoose = require('mongoose');
const app = express();
const port = 3003;

app.use(express.json());

// MongoDB connection with retry mechanism
const connectMongo = async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Payment Service connected to MongoDB');
      return;
    } catch (err) {
      retries++;
      console.error(`MongoDB connection attempt ${retries} failed:`, err);
      if (retries === maxRetries) {
        console.error('Max retries reached. Will continue to retry...');
        // Instead of exiting, we'll keep retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
        retries = 0; // Reset retries to keep trying
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }
};

// Initialize MongoDB connection
connectMongo();

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
  connectMongo();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

// Move schema definition before route handlers
const paymentSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  orderId: Number,
  amount: Number,
  status: String,
});

const Payment = mongoose.model('Payment', paymentSchema);

// Fix template literal syntax and URL variable name
app.post('/payments', async (req, res) => {
  const { orderId, amount } = req.body;
  if (!orderId || !amount) {
    return res.status(400).json({ error: 'Order ID and amount required' });
  }

  try {
    // Verify order with Order Service
    const orderResponse = await axios.get(`${process.env.ORDER_SERVICES_URI}/orders/${orderId}`);
    const order = orderResponse.data;

    if (order.total !== amount) {
      return res.status(400).json({ error: 'Payment amount does not match order total' });
    }

    const paymentCount = await Payment.countDocuments();
    const payment = new Payment({ id: paymentCount + 1, orderId, amount, status: 'completed' });
    await payment.save();

    // Fix template literal syntax and URL variable name
    await axios.patch(`${process.env.ORDER_SERVICES_URI}/orders/${orderId}`, { status: 'paid' });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('Received shutdown signal. Starting graceful shutdown...');
  
  try {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
    
    // Close the server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Store server instance
const server = app.listen(port, () => {
  console.log(`Payment Service running on port ${port}`);
});