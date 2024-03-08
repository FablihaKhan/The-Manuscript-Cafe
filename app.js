const express = require('express');
const session = require('express-session');
const { Client } = require('pg');
const axios = require('axios');
const googleBooks = require('google-books-search');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use('/static', express.static('public'));
app.use('/uploads', express.static('uploads'));


app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
}));

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
app.use(bodyParser.urlencoded({ extended: true }));
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
    res.send({ success: true, message: 'Registration successful' });
  } catch (error) {
    if (error.code === '23505') { // Unique violation error code
      /*console.error('Error inserting data into the database:', error);*/
      res.status(400).send({ success: false, message: 'Registration failed: Author with the same email already exists' });
    } else {
      /*console.error('Error inserting data into the database:', error);*/
      res.status(500).send({ success: false, message: 'Internal Server Error' });
    }
  }
});


app.get('/author/login', (req, res) => {
  console.log("hello");
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

app.get('/author/edit', async (req, res) => {
  try {
    // Retrieve author information from the database based on some identifier like user ID or session data
    const authorId = req.session.authorId; // Assuming you have session data with author ID
    const query = `
      SELECT * FROM Author WHERE id = $1
    `;
    const result = await client.query(query, [authorId]);
    const author = result.rows[0];
    res.render('authorEdit', { author }); // Render the editProfile.ejs template with author data
  } catch (error) {
    console.error('Error retrieving author data:', error);
    res.status(500).send('Internal Server Error');
  }
});


app.post('/author/edit', async (req, res) => {
  const { first_name, last_name, email, contact_no, gender, interested_genre, password } = req.body;
  console.log({first_name, last_name, email, contact_no, gender, interested_genre, password });
  authorId = req.session.authorId;

  let updateFields = [];
  let queryParams = [authorId];
  
  if (first_name) {
    updateFields.push(`first_name = $${queryParams.push(first_name)}`);
  }
  if (last_name) {
    updateFields.push(`last_name = $${queryParams.push(last_name)}`);
  }
  if (email) {
    updateFields.push(`email = $${queryParams.push(email)}`);
  }
  // Add conditions for other fields here

  const updateQuery = `
    UPDATE Author 
    SET ${updateFields.join(', ')}
    WHERE id = $1
    RETURNING *
  `;
  
  try {
    const result = await client.query(updateQuery, queryParams);
    console.log('Updated data:', result.rows[0]);
    res.send({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send({ success: false, message: 'Failed to update profile' });
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


app.post('/author/book_status', async (req, res) => {
  try {
    const bookName = req.body.bookName;

    // Call the stored procedure to delete the request and associated records
    await client.query('CALL DeletePublishRequest($1)', [bookName]);
    

    res.redirect('/author/book_status'); // Redirect to the book status page after canceling the request
  } catch (error) {
    console.error('Error canceling request:', error);
    res.status(500).send('Error canceling request');
  }
});



app.get('/author/search', (req, res) => {
  res.render('author_book_search', { search_book: [],reviews:[] }); // Pass an empty array by default
});


app.post('/author/search', async (req, res) => {
  let reviews; // Declare reviews variable outside the try block

  try {
    const userProvidedBookTitle = req.body.bookTitle; // Assuming the book title is passed as 'bookTitle' in the request

    if (!userProvidedBookTitle) {
      return res.status(400).send('Book title parameter is missing.');
    }

    const query = `
      SELECT 
        B.book_title,
        (SELECT COUNT(*) 
          FROM Book_sales BS 
          JOIN Book B1 ON BS.book_id = B1.book_id 
          WHERE B1.book_title = $1) AS total_copies_sold,
        (SELECT P.author_gets * (SELECT COUNT(*) 
                                  FROM Book_sales BS 
                                  JOIN Book B1 ON BS.book_id = B1.book_id 
                                  WHERE B1.book_title = $1) 
          FROM Payment P 
          JOIN Book B1 ON P.book_id = B1.book_id 
          WHERE B1.book_title = $1) AS author_payment_amount
      FROM 
        Book B
      WHERE 
        B.book_title = $1
        GROUP BY B.book_title`;

    const review_query = `
      SELECT 
        R.review_id,
        R.rating,
        R.review
      FROM 
        Review R
        JOIN Book B ON R.book_id = B.book_id
      WHERE 
        B.book_title = $1`;

    const review_result = await client.query(review_query, [userProvidedBookTitle]);
    reviews = review_result.rows; // Assign the value inside the try block

    const result = await client.query(query, [userProvidedBookTitle]);
    const search_book = result.rows;

    res.render('author_book_search', { search_book, reviews });
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/review/delete', async (req, res) => {
  try {
      const reviewId = req.body.reviewId;

      await client.query('DELETE FROM Review WHERE review_id = $1', [reviewId]);

      res.redirect('/author/search'); // Redirect to the book status page after deleting the review
  } catch (error) {
      console.error('Error deleting review:', error);
      res.status(500).send('Error deleting review');
  }
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


app.get('/author/request_to_all_publisher/book_details', async (req, res) => {

  res.render('allPublisherBook');

});

app.post('/author/request_to_all_publisher/book_details', async (req, res) => {
  try {
    const { bookName, genre, pdfLink } = req.body;
    let authorId = req.session.authorId;

    // Call the stored procedure to send publish requests to all publishers
    await client.query('CALL Send_Publish_Request_To_All_Publishers($1, $2, $3, $4)', [
      authorId, // Replace with the appropriate author ID
      bookName,
      genre,
      pdfLink
    ]);

    // Placeholder logic: just log the data for demonstration
    console.log('Book Name:', bookName);
    console.log('Genre:', genre);
    console.log('PDF Link:', pdfLink);

    res.status(200).send('Request submitted successfully');
  } catch (error) {
    console.error('Error handling form submission:', error);
    res.status(500).send('Internal Server Error');
  }
});


/*app.post('/author/request_to_all_publisher/book_details', async (req, res) => {
  try {
    const { bookName, genre, pdfLink } = req.body;
    let authorId = req.session.authorId;

    // Find the maximum request_id
    const result = await client.query('SELECT MAX(request_id) AS max_request_id FROM Publish_Request');
    const maxRequestId = result.rows[0].max_request_id;

    // Call the stored procedure to send publish requests to all publishers
    await client.query('CALL Send_Publish_Request_To_All_Publishers($1, $2, $3, $4, $5)', [
      authorId, // Replace with the appropriate author ID
      bookName,
      genre,
      pdfLink,
      maxRequestId
    ]);

    // Placeholder logic: just log the data for demonstration
    console.log('Book Name:', bookName);
    console.log('Genre:', genre);
    console.log('PDF Link:', pdfLink);

    res.status(200).send('Request submitted successfully');
  } catch (error) {
    console.error('Error handling form submission:', error);
    res.status(500).send('Internal Server Error');
  }
});*/


app.get('/publisher/login', (req, res) => {
  res.render('publisherLogin');
});




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

  const query2 = 
  `SELECT a.id, a.first_name, a.last_name
  FROM Author a
  JOIN Book b ON a.id = b.author_id
  JOIN Review r ON b.book_id = r.book_id
  WHERE a.id IN (
  SELECT author_id
  FROM (
    SELECT author_id, AVG(rating) AS avg_rating
    FROM Author a
    JOIN Book b ON a.id = b.author_id
    JOIN Review r ON b.book_id = r.book_id
    GROUP BY author_id
    ORDER BY avg_rating DESC
    LIMIT 3
) AS top_avg_ratings
)
GROUP BY a.id, a.first_name, a.last_name`;

  try {
    const publisherResult = await client.query(publisherQuery, [email]);

    if (publisherResult.rows.length === 0) {
      // Publisher with the provided email does not exist
      res.status(401).send('Invalid email or password');
      return;
    }

    const publisher = publisherResult.rows[0];
    req.session.stored_publisher_Id = publisher.publisher_id;
    

    if (publisher.password === password) {
      // Passwords match, login successful
      const mergedResult = await client.query(mergedQuery, [publisher.publisher_id]);
      const pendingResult = await client.query(pendingQuery, [publisher.publisher_id]);
      const result2 = await client.query(query2);

      const authorRequests = mergedResult.rows;
      const pendingBooks = pendingResult.rows.length > 0 ? pendingResult.rows[0].requested_book_count : 0;
      const top_rated_author = result2.rows;

      // Pass the retrieved data to the 'showRequest' EJS template
      res.render('showRequest', { publisher, authorRequests, pendingBooks,top_rated_author });
    } else {
      // Passwords don't match
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Error retrieving user from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/publisher/approve', (req, res) => {
  res.render('approve');
});

app.post('/publisher/approve', (req, res) => {
  const requestId = req.body.request_id;
  let publisherId = req.session.stored_publisher_Id;

  // Insert a new row into Approved_books table
  const insertQuery = 'INSERT INTO Approved_books (publisher_id, request_id) VALUES ($1, $2)';
  /*const insert_to_online_books_Query = 'INSERT INTO online_book (author_code, book_title, genre, pdf_url) VALUES (4, 'Thrill Seeker', 'Thriller', 'thrill_seeker.pdf')';*/
  const insertValues = [publisherId, requestId];

  // Update the status to 'Approved' in Publish_Requested_books table
  const updateQuery = 'UPDATE Publish_Requested_books SET status = $1 WHERE request_id = $2';
  const updateValues = ['Approved', requestId];

  // Execute the database queries
  client.query(insertQuery, insertValues)
    .then(() => {
      return   client.query(updateQuery, updateValues);
    })
    .then(() => {
      res.redirect('/publisher/login'); // Redirect to the dashboard or appropriate page
    })
    .catch((error) => {
      console.error('Error approving request:', error);
      res.status(500).send('Internal Server Error');
    });
});

app.get('/publisher/reject', (req, res) => {
  res.render('reject');
});

app.post('/publisher/reject', (req, res) => {
  const requestId = req.body.request_id;
  let publisherId = req.session.stored_publisher_Id;
  /*const rejectionReason = req.body.rejection_reason;*/
  let rejectionReason= 'Need Better Script'; // Assuming the rejection reason is sent in the request body

  // Update the status to 'Rejected' in Publish_Requested_books table
  const updateQuery = 'UPDATE Publish_Requested_books SET status = $1 WHERE request_id = $2';
  const updateValues = ['Rejected', requestId];

  // Insert a new row into Rejected_books table
  const insertQuery = 'INSERT INTO Rejected_books (publisher_id, request_id, rejection_reason) VALUES ($1, $2, $3)';
  const insertValues = [publisherId, requestId, rejectionReason];

  // Execute the database queries
  client.query(updateQuery, updateValues)
    .then(() => {
      return client.query(insertQuery, insertValues);
    })
    .then(() => {
      res.redirect('/publisher/login'); // Redirect to the dashboard or appropriate page
    })
    .catch((error) => {
      console.error('Error rejecting request:', error);
      res.status(500).send('Internal Server Error');
    });
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

     

    const result = await client.query(query, [userProvidedGenre]);
    const genre_search_book = result.rows;


    // Pass the query result to the view for rendering
    res.render('requestSearch', { genre_search_book});
  } catch (error) {
    console.error('Error executing query:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/publisher/send_edit', (req, res) => {
  // Execute the SQL query
  const query = `
  SELECT ab.approve_id,ab.request_id, prb.book_name, prb.genre, prb.pdf_link, ab.approval_date
  FROM Approved_books ab
  JOIN Publish_Requested_books prb ON ab.request_id = prb.request_id
  WHERE ab.publisher_id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM Editor_Books eb
    WHERE eb.approve_id = ab.approve_id
      AND eb.request_id = ab.request_id
  );
  `;
  // Assuming you are using a database library like 'pg' for PostgreSQL
  client.query(query)
    .then(result => {
      // Pass the query result as data to the template
      res.render('send_edit', { books: result.rows });
    })
    .catch(error => {
      // Handle any errors that occurred during the query
      console.error('Error executing SQL query:', error);
      res.status(500).send('Internal Server Error');
    });
});


app.post('/publisher/edit', (req, res) => {
  const approveId = req.body.approve_id;
  const requestId = req.body.request_id;

  // Call the SendEditRequest procedure
  const callProcedure = async () => {
    try {
      await client.query('CALL SendEditRequest($1, $2)', [requestId, approveId]);

    } catch (error) {
      console.error('Error executing procedure:', error);
    }
  };

  callProcedure();

  // Send a response or redirect to another page
  res.send('Book editing in progress...');
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










////////////////Fablihaaaaa



app.get('/subscribe', (req, res) => {
  console.log("hiii");
  res.render('sub_form');
});

app.get('/online_books', async (req, res) => {
  try {
    // Fetch books from the database
    const query = 'SELECT * FROM online_book';
    const result = await client.query(query);
    const books = result.rows;

    // Render 'online' template with book data
    res.render('online', { books });
  } catch (error) {
    console.error('Error fetching books from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/add_book', async (req, res) => {
  const { bookTitle, genre, pdfUrl } = req.body;
  const authorCode = req.session.authorCode; // Assuming you're using session for authentication

  const query = 'INSERT INTO author_books (author_code, book_title, genre, pdf_url) VALUES ($1, $2, $3, $4)';
  try {
    await client.query(query, [authorCode, bookTitle, genre, pdfUrl]);
    res.redirect('/author/dashboard');
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/login_reader', (req, res) => {
  res.render('login_online_reader');
});
app.get('/sub_or_login', (req, res) => {
  res.render('sub_or_login');
});
app.get('/online_author_login', (req, res) => {
  res.render('online_author_login');
});

app.post('/online/author/login', async (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT * FROM online_author WHERE email = $1';

  try {
    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      console.log('User not found:', email);
      res.status(401).send('Invalid email or password');
      return;
    }

    const author = result.rows[0];

    if (author.password === password) {
      // Passwords match, login successful
      req.session.authorCode = author.author_code; // Store author code in the session
      try {
        // Assuming you're using session for authentication
        const authorCode = req.session.authorCode;
    
        const query = `
          SELECT ob.book_id, ob.book_title, ob.genre, ob.pdf_url
          FROM online_book ob
          JOIN online_author oa ON ob.author_code = oa.author_code
          WHERE oa.author_code = $1;
        `;
    
        const result = await client.query(query, [authorCode]);
        const books = result.rows;
    
        res.render('online_books_author', { books });
      } catch (error) {
        console.error('Error fetching author books:', error);
        res.status(500).send('Internal Server Error');
      }
    } else {
      // Passwords don't match
      console.log('Password mismatch for user:', email);
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).send('Internal Server Error');
  }
});
app.post('/login_reader', async (req, res) => {
  const { email, password } = req.body;

  const userQuery = 'SELECT * FROM online_reader WHERE email = $1';
  const booksQuery = 'SELECT * FROM online_book';

  try {
    const userResult = await client.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      res.status(401).send('Invalid email or password');
      return;
    }

    const user = userResult.rows[0];

    if (user.password === password) {
      // Passwords match, calculate remaining time
      const remainingTime = calculateRemainingSubscriptionTime(user.subscription_end_date);

      // Fetch books from the database
      const booksResult = await client.query(booksQuery);
      const books = booksResult.rows;

      // Render the 'online' template with user, remainingTime, and books
      res.render('online', { user, remainingTime, books });
    } else {
      // Passwords don't match
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    console.error('Error retrieving user or books from the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/online/reader/search', (req, res) => {
  res.render('reader_search', {
    booksByTitle: [],
    booksByGenre: []
  });
});

app.post('/online/reader/search', async (req, res) => {
  const { genre, bookTitle } = req.body;

  // Assuming you're using a database library like pg-promise
  const bookByTitleQuery = 'SELECT * FROM online_book WHERE book_title = $1';
  const bookByGenreQuery = 'SELECT * FROM online_book WHERE genre = $1';

  // Assuming you have a database connection pool initialized as 'db'
  try {
    // Search by book title
    const result = await client.query(bookByTitleQuery, [bookTitle]);
    const booksByTitle = result.rows;

    const result2 = await client.query(bookByGenreQuery, [genre]);
    const booksByGenre = result2.rows;

   

    // Render the search results
    res.render('reader_search', {
      booksByTitle,
      booksByGenre,
    });
  } catch (error) {
    console.error('Error searching for books:', error);
    res.render('error');
  }
});


app.get('/online/author/register', (req, res) => {
  res.render('online_register');
});

app.post('/online/author/register', async (req, res) => {
  let { name, email, contact, gender } = req.body;
  console.log({ name, email, contact, gender });

  const query = `INSERT INTO authors (first_name, gender, email, contact_no) VALUES ($1, $2, $3, $4) RETURNING *;`

  try {
    const result = await client.query(query, [name, gender, email, contact]);
    console.log('Inserted data:', result.rows[0]);
    res.send('Registration successful. Data logged in the console.');
  } catch (error) {
    console.error('Error inserting data into the database:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/subscribe', async (req, res) => {
  const { userName, contactNumber, email, password, subscriptionDuration, paymentMethod } = req.body;

  // Calculate subscription end date
  const subscriptionEndDate = calculateSubscriptionEndDate(subscriptionDuration);

  // Insert data into online_reader table
  const readerQuery = 'INSERT INTO online_reader (user_name, contact_no, email, password, subscription_end_date) VALUES ($1, $2, $3, $4, $5) RETURNING user_id';

  try {
    const readerResult = await client.query(readerQuery, [userName, contactNumber, email, password, subscriptionEndDate]);
    const userId = readerResult.rows[0].user_id;

    // Insert data into online_subscription table
    const subscriptionQuery = 'INSERT INTO online_subscription (user_id, payment, payment_method) VALUES ($1, $2, $3)';
    const paymentAmount = calculatePaymentAmount(subscriptionDuration);

    await client.query(subscriptionQuery, [userId, paymentAmount, paymentMethod]);

    res.send('Subscription successful.');
  } catch (error) {
    console.error('Error processing subscription:', error);
    res.status(500).send('Internal Server Error');
  }
});


// Function to calculate subscription end date
function calculateSubscriptionEndDate(subscriptionDuration) {
  const currentDate = new Date();
  const endDate = new Date(currentDate.getTime() + subscriptionDuration * 30 * 24 * 60 * 60 * 1000); // Assuming subscription duration is in months
  return endDate.toISOString(); // Store as timestamp in the database
}

// Function to calculate remaining subscription time
function calculateRemainingSubscriptionTime(subscriptionEndDate) {
  return new Date(subscriptionEndDate).toLocaleDateString(); // You can format the date as needed
}

function calculatePaymentAmount(subscriptionDuration) {
  // Example logic: $10 per month
  const monthlyRate = 10;
  return monthlyRate * subscriptionDuration;
}

/*app.get('/login', (req, res) => {
  res.render('login');
});


app.post('/login', async (req, res) => {
  let { name, email, password, role } = req.body;
  console.log({ name, email, password, role });

  const query = `SELECT * FROM Author WHERE email = $1;`

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
});*/
