require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3001;

const serviceAccount = {
  type: process.env.FIREBASE_type,
  project_id: process.env.FIREBASE_project_id,
  private_key_id: process.env.FIREBASE_private_key_id,
  private_key: process.env.FIREBASE_private_key.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_client_email,
  client_id: process.env.FIREBASE_client_id,
  auth_uri: process.env.FIREBASE_auth_uri,
  token_uri: process.env.FIREBASE_token_uri,
  auth_provider_x509_cert_url: process.env.FIREBASE_auth_provider_x509_cert_url,
  client_x509_cert_url: process.env.FIREBASE_client_x509_cert_url,
  universe_domain: process.env.FIREBASE_universe_domain,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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

//Verify jwt
const verifyJWT = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log(decoded);
    req.tokenEmail = decoded?.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

async function run() {
  try {
    await client.connect();
    const db = client.db("bazarDb");
    const usersCollections = db.collection("users");
    const productsCollections = db.collection("products");

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

    //Add all products
    app.post("/products", verifyJWT, async (req, res) => {
      const productData = req.body;
      if (typeof productData.created_at === "string") {
        productData.created_at = new Date(productData.created_at);
      }
      productData.status = "pending";
      const result = await productsCollections.insertOne(productData);
      res.send(result);
    });

    //Get all Products for All Product page
    app.get("/products/all", async (req, res) => {
      const { start, end, sort } = req.query;
      const query = {};
      if (start && end) {
        const startDate = new Date(start);
        const endDate = new Date(end);
        query.created_at = {
          $gte: startDate,
          $lte: endDate,
        };
      }

      const sortOption = {};
      if (sort === "asc") sortOption.pricePerUnit = 1;
      else if (sort === "desc") sortOption.pricePerUnit = -1;

      const result = await productsCollections.find(query).sort(sortOption).toArray();

      res.send(result);
    });

    //get 6 product deferent market for home page
    app.get("/products", async (req, res) => {
      const today = new Date();
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(today.getDate() - 2);

      const query = {
        status: "approved",
        created_at: {
          $gte: threeDaysAgo,
          $lte: today,
        },
      };
      const result = await productsCollections.find(query).limit(6).toArray();
      res.send(result);
    });

    //Get specific product for product Details
    app.get("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollections.findOne(query);
      res.send(result);
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
