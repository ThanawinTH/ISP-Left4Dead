const path = require('path');
const express = require('express');
const session = require('express-session');
const routes = require('./src/routes');

const app = express();

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' },
}));

app.use('/api', routes);
app.use(express.static(path.resolve(__dirname, '/frontend')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(3000, () => console.log('KU Classroom API on http://localhost:3000'));
