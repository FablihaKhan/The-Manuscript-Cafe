const express = require('express');
const { Client } = require('pg');
const app = express();
const PORT = 3000;

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432,
});

// Connect to the PostgreSQL database when the application starts
client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL');
  })
  .catch((err) => {
    console.error('Error connecting to PostgreSQL:', err);
  });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use('/static', express.static('node_modules/bootstrap/dist'));

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/author/register', (req, res) => {
  res.render('register');
});

app.post('/author/register', async (req, res) => {
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

app.get('/login', (req, res) => {
  res.render('login');
});


app.post('/login', async (req, res) => {
  let { name, email, password, role } = req.body;
  console.log({ name, email, password, role });

  const query = `SELECT * FROM Author WHERE email = $1`;

  try {
    const result = await client.query(query, [email]);
    console.log(result.rows[0]);

    if (result.rows.length === 0) {
      // User with the provided email does not exist
      res.status(401).send('Invalid email or password');
      return;
    }

    const user = result.rows[0];

    // Compare the provided password with the password in the database
    if (user.password === password) {
      // Passwords match, login successful
      res.render('authorDashboard', {user });

    } else {
      // Passwords don't match
      res.status(401).send('Invalid email or password');

    }
  } catch (error) {
    console.error('Error retrieving user from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

/*app.get('/author/dashboard', (req, res) => {
  res.render('authorDashboard');
});*/



// Handle shutdown gracefully by closing the database connection
process.on('SIGINT', () => {
  client.end()
    .then(() => {
      console.log('PostgreSQL client disconnected');
      process.exit();
    })
    .catch((err) => {
      console.error('Error disconnecting from PostgreSQL:', err);
      process.exit(1);
    });
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

    const result = await client.query('SELECT * FROM author');
    const author = result.rows;

    res.render('demo', { author });
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


