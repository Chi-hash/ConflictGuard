//load environment variables first
import express from "express";
import dotenv from "dotenv"; 

dotenv.config(); //this loads the environment variables from the .env file into process.env

const app = express(); //this creates an instance of express

// tell express ro parse json bodies for the webhooks, middleware that is used to parse the incoming request body as JSON
app.use(express.json());
const PORT = process.env.PORT || 3000; //this sets the port to either the environment variable PORT or 3000

//root route
app.get("/", (req, res) => {
  res.send("ConflictGuard server is running");
});

//start the server
//listen to requests that comr from the defined port

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost: ${PORT}`);
});
