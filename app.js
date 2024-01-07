/*const express = require('express');
const app = express();
const { Client } = require('pg');
const PORT = 3000;

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432,
});


app.set('view engine','ejs')
app.use(express.urlencoded({extended:true}));

app.get('/', async (req, res) => {
    await client.connect();
    console.log('Connected to PostgreSQL');
    res.render('index');
});


app.get('/users/register', async (req, res) => {
    res.render('register');
});

app.post('/users/register', async (req, res) => {
  let { name, email, contact, gender } = req.body;
  console.log({ name, email, contact, gender });

  // You can also send a response back to the client
  res.send('Registration successful. Data logged in the console.');
  
  const query = `INSERT INTO authors (first_name, gender, email, contact) VALUES ($1, $2, $3, $4) RETURNING *`;

  try {
    const result = await client.query(query, [name, gender, email, contact]);
    console.log('Registration successful. Data logged in the console.');
    console.log('Inserted data:', result.rows[0]);
    res.send('Registration successful. Data logged in the console.');
  } catch (error) {
    console.error('Error inserting data into the database:', error);
    res.status(500).send('Internal Server Error');
  }

});

app.get('/users/login', async (req, res) => {
  res.render('login');
});


client.end();
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});*/

//new version

const express = require('express');
const app = express();
const { Client } = require('pg');
const PORT = 3000;

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432,
});

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  await client.connect();
  console.log('Connected to PostgreSQL');
  res.render('index');
});

app.get('/users/register', async (req, res) => {
  res.render('register');
});

app.post('/users/register', async (req, res) => {
  let { name, email, contact, gender } = req.body;
  console.log({ name, email, contact, gender });

  const query = `INSERT INTO authors (first_name, gender, email, contact_no) VALUES ($1, $2, $3, $4) RETURNING *`;

  try {
    const result = await client.query(query, [name, gender, email, contact]);
    console.log('Inserted data:', result.rows[0]);
    res.send('Registration successful. Data logged in the console.');
  } catch (error) {
    console.error('Error inserting data into the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/users/login', async (req, res) => {
  res.render('login');
});

// Only close the client when the server is shutting down
process.on('SIGINT', async () => {
  await client.end();
  console.log('PostgreSQL client disconnected');
  process.exit();
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});



/*app.get('/about', async (req, res) => {
  res.sendFile('./views/2.html',{root:__dirname});
});*/


// list of author name
/*const express = require('express');
const { Client } = require('pg');

const app = express();
const port = 3000;

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432,
});

app.set('view engine', 'ejs');

app.get('/', async (req, res) => {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const result = await client.query('SELECT * FROM authors');
    const authors = result.rows;

    res.render('demo', { authors });
  } catch (err) {
    console.error('Error connecting to PostgreSQL or executing query:', err);
    res.status(500).send('Internal Server Error');
  } finally {
    await client.end();
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});*/


