require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 3001;

//middlewares
app.use(cors());
app.use(express.json());

//MongoDb connection
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db("bazarDb");
    const usersCollections = db.collection("users");

    //save or update user
    app.post("/users", async (req, res) => {
      const userData = req.body;
      userData.role = "user";
      userData.created_at = new Date();
      userData.last_loggedIn = new Date();

      const query = { email: userData?.email };
      const alreadyExist = await usersCollections.findOne(query);

      if (!!alreadyExist) {
        const result = await usersCollections.updateOne(query, { $set: { last_loggedIn: new Date() } });
        return res.send(result);
      }
      const result = await usersCollections.insertOne(userData);
      res.status(201).send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server running at ${port}`);
});
