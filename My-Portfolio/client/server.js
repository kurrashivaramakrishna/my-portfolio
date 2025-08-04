const express = require('express');
const multer = require('multer');
const mysql = require('mysql2');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs'); // For password hashing
const jwt = require('jsonwebtoken'); // For creating and verifying tokens
const cors = require('cors'); 

const app = express();
const port = 3000;

app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/uploads',express.static('uploads'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Enable CORS for all origins (for development, restrict in production)
app.use(cors());
// Parse JSON request bodies
app.use(express.json());


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const users = [];
const JWT_SECRET = 'your_super_secret_jwt_key_12345';


// MySQL connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'mydb'
});



db.connect(err => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

db.connect(function(err) {
  if (err) throw err;
  console.log("Connected!");
//   let sql = "CREATE TABLE Recruiters (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(255) NOT NULL,email VARCHAR(255) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"
// let sql = "ALTER TABLE files ADD COLUMN user_id INT;"; 
let sql= "ALTER TABLE files MODIFY COLUMN data LONGBLOB;";

db.query(sql, function (err, result) {
    if (err) throw err;
    console.log(result);
  });
});

app.get('/pages/:page', (req, res) => {
  const page = req.params.page;

  // Only allow `.html` files, reject if anything else is requested
  if (path.extname(page)) {
    return res.status(404).send("Not found");
  }

  const filePath = path.join(__dirname, 'public', 'pages', `${page}.html`);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).send("Page not found");
    }
    res.sendFile(filePath);
  });
});




app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname,'public','index.html'));
});

app.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    const userId = req.body.userId;

    if (!file || !userId) return res.status(400).send("Please select a image file");

    // Check if user already has a profile picture
    const checkSql = "SELECT * FROM files WHERE user_id = ?";
    db.query(checkSql, [userId], (checkErr, checkResult) => {
        if (checkErr) {
            console.error("DB check error:", checkErr);
            return res.status(500).send("Error checking existing profile picture.");
        }

        if (checkResult.length > 0) {
            // User already has a profile picture - update it
            const updateSql = "UPDATE files SET name = ?, type = ?, data = ? WHERE user_id = ?";
            db.query(updateSql, [file.originalname, file.mimetype, file.buffer, userId], (updateErr, updateResult) => {
                if (updateErr) {
                    console.error("DB update error:", updateErr);
                    return res.status(500).send("Error updating profile picture.");
                }
                res.redirect('/index.html'); // or send a JSON response
            });
        } else {
            // No profile picture yet - insert a new one
            const insertSql = "INSERT INTO files (name, type, data, user_id) VALUES (?, ?, ?, ?)";
            db.query(insertSql, [file.originalname, file.mimetype, file.buffer, userId], (insertErr, insertResult) => {
                if (insertErr) {
                    console.error("DB insert error:", insertErr);
                    return res.status(500).send("Error uploading profile picture.");
                }
                res.redirect('/dashboard.html');
            });
        }
    });
});





app.post('/signup', async (req, res) => {
    const { name, email, password,confirm_Password } = req.body;

    // Basic input validation
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Check if user already exists
    const existingUser = users.find(user => user.email === email);
    if (existingUser) {
        return res.status(400).json({ message: 'User with that email already exists' });
    }

    try {
        // Hash password
        const salt = await bcrypt.genSalt(10); // Generate a salt
        const passwordHash = await bcrypt.hash(password, salt); // Hash the password with the salt

        // Create new user object
        const newUser = {
            id: users.length + 1, // Simple ID generation
            name,
            email,
            passwordHash ,// Store the hashed password
            
        };

        // Save user to our "database"
        users.push(newUser);

        console.log('New user registered:', newUser); // Log for debugging

        res.redirect('/pages/signin.html'); // Redirect to signin page after successful signup
        // Respond with success message
        // res.status(201).json({ message: 'User registered successfully!' });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
});


app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    // Basic input validation
    if (!email || !password) {
        return res.status(400).json({ message: 'Please enter all fields' });
    }

    // Find user by email
    const user = users.find(u => u.email === email);
    if (!user) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    try {
        // Compare provided password with stored hashed password
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // User is authenticated, create a JWT
        // The payload typically contains user information (e.g., user ID, email)
        // that you want to retrieve later without hitting the database.
        const payload = {
            user: {
                id: user.id,
                email: user.email
            }
        };

        // Sign the token
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '1h' }, // Token expires in 1 hour
            (err, token) => {
                if (err) throw err;
                res.redirect('/pages/upload.html'); // Redirect to dashboard after successful login
                // Send the token back to the client
                // res.json({ message: 'Logged in successfully!', token });
            }
        );

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});




app.get('/file/:id', (req, res) => {
    const id = req.params.id;
    const sql = "SELECT * FROM files WHERE user_id = ?";
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error("DB fetch error:", err);
            return res.status(500).send("Error retrieving file.");
        }
        if (result.length === 0) {
            return res.status(404).send("File not found");
        }

        res.setHeader('Content-Type', result[0].type);
        res.send(result[0].data);
    });
});



// app.use('/file', express.static(path.join(__dirname, 'uploads')));

// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, 'public/index.html'));
// });

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});


































































// app.post('/upload', upload.single('file'), (req, res) => {
//     const file = req.file;
//     if (!file) return res.status(400).send("No file uploaded");
//     // const sql = "select * from files;";
//     const sql = "INSERT INTO files (name, type, data) VALUES (?, ?, ?)";
//     db.query(sql, [file.originalname, file.mimetype, file.buffer], (err, result) => {
//         if (err) {
//             console.error("DB insert error:", err);
//             return res.status(500).send("Error uploading file.");
//         }
//         res.redirect('dashboard.html');
//     });
// });





// let pool;
// async function connectToDatabase() {
//     try {
//         pool = mysql.createPool(db);
//         console.log('Successfully connected to MySQL database!');
//     } catch (error) {
//         console.error('Failed to connect to MySQL database:', error);
//         // Exit the application if database connection fails
//         process.exit(1);
//     }
// }

// // Call the connection function when the server starts
// connectToDatabase();


// app.post('/update-file', upload.single('file'), async (req, res) => {
//     const file = req.file;
//     const fileId = 1; // Get the ID of the file to update from the request body

//     // Basic validation
//     if (!file) {
//         return res.status(400).json({ message: "No file uploaded." });
//     }
//     if (!fileId) {
//         return res.status(400).json({ message: "File ID is required for updating." });
//     }

//     let connection;
//     try {
//         connection = await pool.getConnection(); // Get a connection from the pool

//         // SQL query to update the file details
//         // We update name, type, and data for the given fileId
//         const sql = "UPDATE files SET name = ?, type = ?, data = ? WHERE id = 1";

//         // Execute the update query
//         const [result] = await connection.execute(
//             sql,
//             [file.originalname, file.mimetype, file.buffer, fileId]
//         );

//         // Check if any rows were affected (i.e., if the file with the given ID was found and updated)
//         if (result.affectedRows === 0) {
//             return res.status(404).json({ message: `File with ID ${fileId} not found.` });
//         }

//         console.log(`File with ID ${fileId} updated successfully.`);
//         // Instead of redirecting, it's often better to send a JSON response for API endpoints
//         res.json({ message: 'File updated successfully!', fileId: fileId });

//     } catch (error) {
//         console.error("DB update error:", error);
//         res.status(500).json({ message: "Error updating file.", error: error.message });
//     } finally {
//         if (connection) connection.release(); // Release the connection back to the pool
//     }
// });







// var express = require('express');
// var app = express();
// var path = require('path');
// var fs = require('fs');

// app.use(express.static(path.join(__dirname, 'public')));
// // app.use(express.json());
// // app.use(express.urlencoded({ extended: true }));

// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname,'public','login.html'));
// });
// app.listen(3000,()=>{
//   console.log("done")
// })




// app.get('/file', (req, res) => {
//     const id = req.params.id;
//     const sql = "SELECT * FROM files;";
//     db.query(sql, [id], (err, result) => {
//         if (err) {
//             console.error("DB fetch error:", err);
//             return res.status(500).send("Error retrieving file.");
//         }
//         if (result.length === 0) {
//             return res.status(404).send("File not found");
//         }

//         res.setHeader('Content-Type', result[0].type);
//         res.send(result[0].data);
//     });
// });




// db.connect(function(err) {
//   if (err) throw err;
//   console.log("Connected!");
//   let sql = "CREATE TABLE files (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255),type VARCHAR(100),data LONGBLOB)";
//   db.query(sql, function (err, result) {
//     if (err) throw err;
//     console.log("Table created");
//   });
// });

// Upload route
// app.post('/upload', upload.single('file'), (req, res) => {
//     const file = req.file;
//     const sql = "INSERT INTO files (1,shiva, profile, file) VALUES (?, ?, ?)";
//     db.query(sql, [file.originalname, file.mimetype, file.buffer], (err, result) => {
//         if (err) throw err;
//         res.send("File uploaded successfully.");
//     });
// });

// app.get('/insert-local-image', (req, res) => {
//     const filePath = 'C:/Users/Shiva/OneDrive/Desktop/my profile.jpg'; // full absolute path
//     const fileName = 'my profile.jpg'; // image name
//     const mimeType = 'image/jpeg';     // adjust if it's PNG or other format

//     try {
//         const imageData = fs.readFileSync(filePath); // Read file into buffer
//         const sql = "INSERT INTO files (name, type, data) VALUES (?, ?, ?)";

//         db.query(sql, [fileName, mimeType, imageData], (err, result) => {
//             if (err) {
//                 console.error("DB insert error:", err);
//                 return res.status(500).send("Error saving image to DB.");
//             }
//             res.send("Local image inserted successfully into database.");
//         });
//     } catch (err) {
//         console.error("File read error:", err);
//         res.status(500).send("Error reading local file.");
//     }
// });


// // Retrieve route
// app.get('/file/:id', (req, res) => {
//     const id = req.params.id;
//     const sql = "SELECT * FROM files WHERE id = ?";
//     db.query(sql, [id], (err, result) => {
//         if (err) throw err;
//         if (result.length > 0) {
//             res.contentType(result[0].type);
//             res.send(result[0].data);
//         } else {
//             res.status(404).send("File not found");
//         }
//     });
// });


// Folder structure assumed:
// - app.js (main entry)
// - /routes/auth.js (auth routes)
// - /routes/admin.js (admin panel)
// - /views (EJS templates)
// - /public (CSS, images)

// STEP 1: package.json dependencies
/*
"dependencies": {
  "bcrypt": "^5.1.0",
  "body-parser": "^1.20.2",
  "dotenv": "^16.0.3",
  "ejs": "^3.1.8",
  "express": "^4.18.2",
  "express-session": "^1.17.3",
  "mysql2": "^3.2.4",
  "multer": "^1.4.5"
}
*/

// STEP 2: app.js
// const express = require("express");
// const session = require("express-session");
// const path = require("path");
// const bodyParser = require("body-parser");
// const app = express();

// require("dotenv").config();

// app.set("view engine", "ejs");
// app.use(express.static("public"));
// app.use(bodyParser.urlencoded({ extended: false }));
// app.use(bodyParser.json());

// app.use(
//   session({
//     secret: "yourSecretKey",
//     resave: false,
//     saveUninitialized: true,
//   })
// );

// // ROUTES
// const authRoutes = require("./routes/auth");
// const adminRoutes = require("./routes/admin");
// app.use("/auth", authRoutes);
// app.use("/admin", adminRoutes);

// app.get("/", (req, res) => {
//   res.render("home", { isLoggedIn: req.session.isLoggedIn });
// });

// app.listen(3000, () => console.log("Server running on http://localhost:3000"));

// // STEP 3: /models/db.js
// const mysql = require("mysql2");

// const db = mysql.createConnection({
//   host: process.env.DB_HOST,
//   user: process.env.DB_USER,
//   password: process.env.DB_PASS,
//   database: process.env.DB_NAME,
// });

// module.exports = db;

// // STEP 4: /routes/auth.js
// const express = require("express");
// const bcrypt = require("bcrypt");
// const router = express.Router();
// const db = require("../models/db");

// router.get("/login", (req, res) => {
//   res.render("login", { error: null });
// });

// router.post("/login", (req, res) => {
//   const { username, password } = req.body;
//   db.query("SELECT * FROM admin WHERE username = ?", [username], async (err, results) => {
//     if (err) return res.send("DB error");
//     if (!results.length) return res.render("login", { error: "User not found" });

//     const match = await bcrypt.compare(password, results[0].password);
//     if (!match) return res.render("login", { error: "Incorrect password" });

//     req.session.isLoggedIn = true;
//     res.redirect("/admin");
//   });
// });

// router.get("/logout", (req, res) => {
//   req.session.destroy(() => {
//     res.redirect("/");
//   });
// });

// module.exports = router;
// // shiva.c968uaeyekjf.eu-north-1.rds.amazonaws.com

// // STEP 5: /routes/admin.js
// // const express = require("express");
// // const multer = require("multer");
// // const path = require("path");
// // const fs = require("fs");
// // const db = require("../models/db");
// // const router = express.Router();

// // const authCheck = (req, res, next) => {
// //   if (!req.session.isLoggedIn) return res.redirect("/auth/login");
// //   next();
// // };

// // const storage = multer.diskStorage({
// //   destination: (req, file, cb) => cb(null, "public/uploads"),
// //   filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
// // });
// // const upload = multer({ storage });

// // router.get("/", authCheck, (req, res) => {
// //   db.query("SELECT * FROM content", (err, results) => {
// //     res.render("admin", { wallpaper: results[0].wallpaper, blocks: results });
// //   });
// // });

// // router.post("/upload-wallpaper", authCheck, upload.single("wallpaper"), (req, res) => {
// //   const newPath = "/uploads/" + req.file.filename;
// //   db.query("UPDATE content SET wallpaper = ? WHERE id = 1", [newPath], () => {
// //     res.redirect("/admin");
// //   });
// // });

// // router.post("/add-block", authCheck, (req, res) => {
// //   const { content } = req.body;
// //   db.query("INSERT INTO content (html_block) VALUES (?)", [content], () => {
// //     res.redirect("/admin");
// //   });
// // });

// // router.post("/delete-block/:id", authCheck, (req, res) => {
// //   const { id } = req.params;
// //   db.query("DELETE FROM content WHERE id = ?", [id], () => {
// //     res.redirect("/admin");
// //   });
// // });

// // module.exports = router;

// // // STEP 6: /views/login.ejs
// // <form method="POST" action="/auth/login">
// //   <h2>Login</h2>
// //   <input type="text" name="username" placeholder="Username" required />
// //   <input type="password" name="password" placeholder="Password" required />
// //   <button type="submit">Login</button>
// //   <% if (error) { %><p style="color:red;"><%= error %></p><% } %>
// // </form>

// // // STEP 7: /views/admin.ejs
// // <h2>Admin Panel</h2>
// // <form action="/admin/upload-wallpaper" method="POST" enctype="multipart/form-data">
// //   <input type="file" name="wallpaper" required />
// //   <button type="submit">Upload Wallpaper</button>
// // </form>

// // <form method="POST" action="/admin/add-block">
// //   <textarea name="content" placeholder="HTML Block to add"></textarea>
// //   <button type="submit">Add Block</button>
// // </form>

// // <ul>
// //   <% blocks.forEach((block) => { %>
// //     <li>
// //       <%= block.html_block %>
// //       <form method="POST" action="/admin/delete-block/<%= block.id %>">
// //         <button type="submit">Delete</button>
// //       </form>
// //     </li>
// //   <% }) %>
// // </ul>

// // <a href="/auth/logout">Logout</a>

// // // STEP 8: /views/home.ejs
// // <!DOCTYPE html>
// // <html>
// //   <head>
// //     <link rel="stylesheet" href="/styles.css" />
// //   </head>
// //   <body style="background-image: url('<%= wallpaper %>');">
// //     <h1>Welcome to My Portfolio</h1>
// //     <% blocks.forEach((block) => { %>
// //       <div><%- block.html_block %></div>
// //     <% }) %>
// //     <% if (isLoggedIn) { %><a href="/admin">Admin</a><% } %>
// //   </body>
// // </html>

// // STEP 9: Database schema
// /*
// CREATE TABLE admin (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   username VARCHAR(100),
//   password VARCHAR(255)
// );

// CREATE TABLE content (
//   id INT AUTO_INCREMENT PRIMARY KEY,
//   wallpaper VARCHAR(255) DEFAULT '/uploads/default.jpg',
//   html_block TEXT
// );
// */

// // app.listen(3000, () => {
// //     console.log('Server is running on port 3000');
// // });


