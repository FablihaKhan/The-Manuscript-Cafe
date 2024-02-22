const express = require('express');
const session = require('express-session');
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
app.use(session({
  secret: 'your-secret-key', // Change this to a secure random string
  resave: false,
  saveUninitialized: true
}));

app.get('/', (req, res) => {
  res.render('index');
});




/*app.get('/statistics', async (req, res) => {
  try {
    // Query to fetch the publisher name and approval rate for each publisher
    const query = `
      SELECT
        P.name AS publisher_name,
        GetApprovalRate(P.publisher_id) AS approval_rate
      FROM
        Publisher P
      WHERE
        GetApprovalRate(P.publisher_id) > 0;
    `;

    // Execute the query to fetch publisher statistics
    const publisherStats = await client.query(query);

    // Call the GetTopGenres function to fetch top genres
    const topGenresQuery = 'SELECT * FROM GetTopGenres(5)';
    const topGenresResult = await client.query(topGenresQuery); // Execute the query

    // Extract the rows from the query results
    const approvalRates = publisherStats.rows;
    const genres = topGenresResult.rows; // Access the rows property of the query result
   

    // Render the 'statistics' view with the approval rates and top genres
    res.render('statistics', { result: approvalRates, genres });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Internal Server Error');
  }
});*/

app.get('/statistics', async (req, res) => {
  try {
    // Call the FinancialStatistics procedure
    const query1 = 'CALL FinancialStatistics($1, $2, $3)';
    const values = [null, null, null]; // Placeholder values for the output parameters
    const result = await client.query(query1, values);

    // Use the values as needed
    const total_cost = result.rows[0].total_cost;
    const revenue = result.rows[0].total_revenue;
    const profit_margin = result.rows[0].profit_margin;

    console.log('Total Cost:', total_cost);
    console.log('Total Revenue:', revenue);
    console.log('Profit Margin:', profit_margin);

    const query = `
      SELECT
        P.name AS publisher_name,
        GetApprovalRate(P.publisher_id) AS approval_rate
      FROM
        Publisher P
      WHERE
        GetApprovalRate(P.publisher_id) > 0;
    `;

    // Execute the query to fetch publisher statistics
    const publisherStats = await client.query(query);

    // Call the GetTopGenres function to fetch top genres
    const topGenresQuery = 'SELECT * FROM GetTopGenres(5)';
    const topGenresResult = await client.query(topGenresQuery); // Execute the query

    // Extract the rows from the query results
    const approvalRates = publisherStats.rows;
    const genres = topGenresResult.rows; // Access the rows property of the query result

    // Render the 'statistics' view with the approval rates, top genres, and financial statistics
    res.render('statistics', { result: approvalRates, genres, total_cost, revenue, profit_margin });
  } catch (err) {
    console.error('Error executing query:', err);
    res.status(500).send('Internal Server Error');
  }
});





app.get('/author/register', (req, res) => {
  res.render('register');
});


app.post('/author/register', async (req, res) => {
  let { first_name, last_name, email, contact_no, gender, interested_genre, password } = req.body;
  console.log({ first_name, last_name, email, contact_no, gender, interested_genre, password });

  const query = `
    INSERT INTO Author (first_name, last_name, gender, email, contact_no, interested_genre, password)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  try {
    const result = await client.query(query, [first_name, last_name, gender, email, contact_no, interested_genre, password]);
    console.log('Inserted data:', result.rows[0]);
    res.send('Registration successful. Data logged in the console.');
  } catch (error) {
    console.error('Error inserting data into the database:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/author/login', (req, res) => {
  res.render('login');
});


app.post('/author/login', async (req, res) => {
  let { name, email, password, role } = req.body;
  /*console.log({ name, email, password, role });*/

  const query = `SELECT * FROM Author WHERE email = $1`;

  try {
    const result = await client.query(query, [email]);
    /*console.log(result.rows[0]);*/

    if (result.rows.length === 0) {
      // User with the provided email does not exist
      res.status(401).send('Invalid email or password');
      return;
    }

    const user = result.rows[0];
    req.session.authorId = user.id;

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

app.get('/author/book_status', (req, res) => {
  const authorId = req.session.authorId; // Assuming authorId is stored in the session

  // Execute the first SQL query to fetch data for pending books
  const pendingQuery = `
    SELECT pb.name AS publisher_name,
           prb.book_name
    FROM Publish_Request pr
    JOIN Author ar ON pr.author_id = ar.id
    JOIN Publisher pb ON pr.publisher_id = pb.publisher_id
    JOIN Publish_Requested_books prb ON pr.request_id = prb.request_id
    WHERE pr.request_id IN (SELECT request_id FROM Publish_Requested_books WHERE status = 'Pending')
      AND ar.id = $1;`;

  // Execute the second SQL query to fetch data for approved books
  const approvedQuery = `
    SELECT pb.name AS publisher_name,
           prb.book_name
    FROM Publish_Request pr
    JOIN Author ar ON pr.author_id = ar.id
    JOIN Publisher pb ON pr.publisher_id = pb.publisher_id
    JOIN Publish_Requested_books prb ON pr.request_id = prb.request_id
    WHERE pr.request_id IN (SELECT request_id FROM Approved_books)
      AND ar.id = $1;`;

  // Execute the third SQL query to fetch data for rejected books
  const rejectedQuery = `
    SELECT pb.name AS publisher_name,
           prb.book_name,
           rb.rejection_reason
    FROM Publish_Request pr
    JOIN Author ar ON pr.author_id = ar.id
    JOIN Publisher pb ON pr.publisher_id = pb.publisher_id
    JOIN Publish_Requested_books prb ON pr.request_id = prb.request_id
    JOIN Rejected_books rb ON pr.request_id = rb.request_id
    WHERE ar.id = $1;`;

  let pendingBooks, approvedBooks, rejectedBooks;

  // Execute the first query
  client.query(pendingQuery, [authorId], (err1, pendingResults) => {
    if (err1) {
      console.error('Error executing pending books query:', err1);
      return res.status(500).send('Internal Server Error');
    }
    pendingBooks = pendingResults.rows;

    // Execute the second query
    client.query(approvedQuery, [authorId], (err2, approvedResults) => {
      if (err2) {
        console.error('Error executing approved books query:', err2);
        return res.status(500).send('Internal Server Error');
      }
      approvedBooks = approvedResults.rows;

      // Execute the third query
      client.query(rejectedQuery, [authorId], (err3, rejectedResults) => {
        if (err3) {
          console.error('Error executing rejected books query:', err3);
          return res.status(500).send('Internal Server Error');
        }
        rejectedBooks = rejectedResults.rows;

        // Pass all fetched data to the template for rendering
        res.render('book_status', { pendingBooks, approvedBooks, rejectedBooks });
      });
    });
  });
});





app.get('/author/request', async (req, res) => {
  let authorId = req.session.authorId;

  try {
    const query = 'SELECT * FROM Publisher';
    const result = await client.query(query);

    const rows = result.rows;
    
    
    res.render('requestPublisher', { rows, authorId });
  } catch (error) {
    console.error('Error retrieving data from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/author/request', async (req, res) => {
  try {
    const { authorId, publisherId } = req.body;

    const insertQuery = 'INSERT INTO Publish_Request (Author_id, Publisher_id) VALUES ($1, $2) RETURNING Request_id';
    const values = [authorId, publisherId];

    const result = await client.query(insertQuery, values);

    if (result.rows.length > 0) {
      req.session.storedRequestId = result.rows[0].request_id;
      
      res.status(200).send('Request submitted successfully');
    } else {
      // Insert failed
      res.status(500).send('Failed to submit request');
    }
  } catch (error) {
    console.error('Error submitting request:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/author/request/book_details', async (req, res) => {

  res.render('requestedBook');

});

app.post('/author/request/book_details', async (req, res) => {
  try {
    let storedRequestId = req.session.storedRequestId; 
    const { bookName, genre, pdfLink } = req.body;

    // Insert the form data into the Publish_Requested_books table
    const insertQuery = 'INSERT INTO Publish_Requested_books (request_id, book_name, genre, pdf_link, request_date, status) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)';
    const values = [storedRequestId, bookName, genre, pdfLink, 'Pending'];

    await  client.query(insertQuery, values);

    // Placeholder logic: just log the data for demonstration
    console.log('Book Name:', bookName);
    console.log('Genre:', genre);
    console.log('PDF Link:', pdfLink);
    
  } catch (error) {
    console.error('Error handling form submission:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/publisher/login', (req, res) => {
  res.render('publisherLogin');
});


/*app.post('/publisher/login', async (req, res) => {
  let { email, password } = req.body;

  const publisherQuery = `SELECT * FROM Publisher WHERE email = $1`;
  const authorRequestsQuery = `SELECT * 
                              FROM Publish_Request PR JOIN Author A ON PR.author_id = A.id WHERE PR.publisher_id = $1`;
  const requestedBooksQuery = `SELECT * 
                              FROM Publish_Request PR JOIN Publish_Requested_books PRB ON PR.request_id = PRB.request_id 
                              WHERE PR.publisher_id = $1`;
  const pendingQuery = `SELECT COUNT(rb.request_id) AS requested_book_count
    FROM Publisher p
    JOIN Publish_Request pr ON p.publisher_id = pr.publisher_id
    JOIN Publish_Requested_books rb ON pr.request_id = rb.request_id
    WHERE rb.status = 'Pending'
    GROUP BY p.publisher_id`;

  try {
    const publisherResult = await client.query(publisherQuery, [email]);

    if (publisherResult.rows.length === 0) {
      // Publisher with the provided email does not exist
      res.status(401).send('Invalid email or password');
      return;
    }

    const publisher = publisherResult.rows[0];

    if (publisher.password === password) {
      // Passwords match, login successful
      const authorRequestsResult = await client.query(authorRequestsQuery, [publisher.publisher_id]);
      const requestedBooksResult = await client.query(requestedBooksQuery, [publisher.publisher_id]);
      const pendingResult = await client.query(pendingQuery);

      const authorRequests = authorRequestsResult.rows;
      const requestedBooks = requestedBooksResult.rows;
      const pendingBooks = pendingResult.rows.length > 0 ? pendingResult.rows[0].requested_book_count : 0;

      // Pass the retrieved data to the 'showRequest' EJS template
      res.render('showRequest', { publisher, authorRequests, requestedBooks,pendingBooks});
    } else {
      // Passwords don't match
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Error retrieving user from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});*/

app.post('/publisher/login', async (req, res) => {
  let { email, password } = req.body;

  const publisherQuery = `SELECT * FROM Publisher WHERE email = $1`;
  const mergedQuery = `
    SELECT PR.*,
           PRB.*,A.*
    FROM Publish_Request PR
    JOIN Author A ON PR.author_id = A.id
    JOIN Publish_Requested_books PRB ON PR.request_id = PRB.request_id
    WHERE PR.publisher_id = $1;
  `;
  const pendingQuery = `
    SELECT COUNT(rb.request_id) AS requested_book_count
    FROM Publisher p
    JOIN Publish_Request pr ON p.publisher_id = pr.publisher_id
    JOIN Publish_Requested_books rb ON pr.request_id = rb.request_id
    WHERE rb.status = 'Pending' AND p.publisher_id = $1
    GROUP BY p.publisher_id
  `;

  try {
    const publisherResult = await client.query(publisherQuery, [email]);

    if (publisherResult.rows.length === 0) {
      // Publisher with the provided email does not exist
      res.status(401).send('Invalid email or password');
      return;
    }

    const publisher = publisherResult.rows[0];

    if (publisher.password === password) {
      // Passwords match, login successful
      const mergedResult = await client.query(mergedQuery, [publisher.publisher_id]);
      const pendingResult = await client.query(pendingQuery, [publisher.publisher_id]);

      const authorRequests = mergedResult.rows;
      const pendingBooks = pendingResult.rows.length > 0 ? pendingResult.rows[0].requested_book_count : 0;

      // Pass the retrieved data to the 'showRequest' EJS template
      res.render('showRequest', { publisher, authorRequests, pendingBooks });
    } else {
      // Passwords don't match
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Error retrieving user from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.get('/publisher/request/search', (req, res) => {
  res.render('requestSearch', { genre_search_book: [] }); // Pass an empty array by default
});

app.post('/publisher/request/search', async (req, res) => {
  try {
    const userProvidedGenre = req.body.genre;

    if (!userProvidedGenre) {
      return res.status(400).send('Genre parameter is missing.');
    }

    const query = `
      SELECT *
      FROM Publish_Requested_books
      WHERE request_id IN (
          SELECT request_id
          FROM Publish_Requested_books
          WHERE genre = $1
      )`;
    
      const excludeGenrequery = `SELECT first_name, last_name
      FROM Author
      WHERE id IN (
          SELECT author_id
          FROM Publish_Request
      )
      AND id NOT IN (
          SELECT author_id
          FROM Publish_Request
          WHERE request_id IN (
              SELECT request_id
              FROM Publish_Requested_books
              WHERE genre = $1
          )
      )`;

      const particularAuthorquery = `SELECT book_name, genre
      FROM Publish_Requested_books
      WHERE status = 'Pending'
      AND request_id IN (
          SELECT request_id
          FROM Publish_Request
          WHERE author_id IN (
              SELECT id
              FROM Author
              WHERE first_name IN ($3, $4)
          )
      )`;

    const result = await client.query(query, [userProvidedGenre]);
    const genre_search_book = result.rows;

    // Pass the query result to the view for rendering
    res.render('requestSearch', { genre_search_book });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).send('Internal Server Error');
  }
});


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


