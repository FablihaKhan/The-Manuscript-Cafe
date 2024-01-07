const { Client } = require('pg');

// Create a new PostgreSQL client
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432, 
});

async function connectAndQuery() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    
    const result = await client.query('SELECT * FROM authors');
    console.log('Query Result:', result.rows);
  } catch (err) {
    console.error('Error connecting to PostgreSQL or executing query:', err);
  } finally {
    
    await client.end();
  }
}

connectAndQuery();





// display data in website
/*
const express = require('express');
const app = express();
const PORT = 3000;

const { Client } = require('pg');

// Create a new PostgreSQL client
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'Maindb',
  password: '1234',
  port: 5432,
});

async function connectAndQuery() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const result = await client.query('SELECT * FROM authors');
    return result.rows;
  } catch (err) {
    console.error('Error connecting to PostgreSQL or executing query:', err);
    throw err; // Rethrow the error to be caught in the calling function
  } finally {
    await client.end();
  }
}

app.get('/', async (req, res) => {
  try {
    const employees = await connectAndQuery();

    // Render the data in a basic HTML table
    let html = '<h1>Authors</h1><table border="1"><tr><th>ID</th><th>Name</th></tr>';

    employees.forEach((author) => {
      html += `<tr><td>${author.id}</td><td>${author.first_name}</td></tr>`; // Replace with the appropriate column names
    });

    html += '</table>';

    res.setHeader('Content-Type', 'text/html');
    res.send(html); // Send the HTML to the client
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching data'); // Send an error response if there's a problem
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});








*/
