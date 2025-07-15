require("dotenv").config();
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
  if (!token) return res.status(401).send({ message: "Unauthorized Access" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
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
    const watchListCollections = db.collection("watchLists");
    const ordersCollections = db.collection("orders");
    const reviewsCollections = db.collection("reviews");
    const advertisementCollections = db.collection("advertisements");

    //Stripe Payment Api
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: parseInt(amount * 100), // Stripe uses cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    //Orders post Api
    app.post("/orders", verifyJWT, async (req, res) => {
      const orderData = req.body;
      const result = await ordersCollections.insertOne(orderData);
      res.send(result);
    });

    // GET all orders of a specific user by email
    app.get("/myOrders/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      try {
        const userOrders = await ordersCollections.find({ buyerEmail: email }).sort({ date: -1 }).toArray();

        res.send(userOrders);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch orders." });
      }
    });

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

    //Get all user for Admin
    app.get("/users", async (req, res) => {
      const result = await usersCollections.find().sort({created_at:-1}).toArray();
      res.send(result)
    })

    //Update Role for Admin
    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const {newRole} = req.body;
      const query = { _id: new ObjectId(id) };
      const updateRole = {
        $set:{role:newRole}
      }
      const result = await usersCollections.updateOne(query, updateRole);
      res.send(result)
    })

    //getting user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollections.findOne(query);
      res.send(result);
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

    //Unique Product Finding
    app.get("/unique_itemName", verifyJWT, async (req, res) => {
      try {
        const result = await productsCollections
          .aggregate([
            {
              $group: {
                _id: "$itemName",
              },
            },
            {
              $project: {
                _id: 0,
                itemName: "$_id",
              },
            },
          ])
          .toArray();
        res.send(result);
      } catch (error) {
        res.send({ message: error.message });
      }
    });

    //Get My Products for vender
    app.get("/my_products/:email", async (req, res) => {
      const email = req.params.email;
      const result = await productsCollections.find({ vendor_email: email }).toArray();
      res.send(result);
    });

    //Delete My Products
    app.delete("/products/:id", async (req, res) => {
      const id = req.params.id;
      const result = await productsCollections.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    //Update My product
    app.put("/product/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          vendor_email: updatedData?.vendor_email,
          vendor_name: updatedData?.vendor_name,
          market: updatedData?.market,
          marketDescription: updatedData?.marketDescription,
          itemName: updatedData?.itemName,
          itemDescription: updatedData?.itemDescription,
          prices: updatedData?.prices,
          created_at: updatedData?.created_at,
          pricePerUnit: Number(updatedData?.pricePerUnit),
          ...(updatedData.product_image && { product_image: updatedData.product_image }),
        },
      };
      const result = await productsCollections.updateOne(query, updatedDoc);
      res.send(result);
    });

    //Get prices for price trending
    app.get("/product_by_itemName/:name", async (req, res) => {
      const name = req.params.name;
      const product = await productsCollections.findOne({ itemName: name });
      res.send(product);
    });

    //WatchList post APi
    app.post("/watchList", verifyJWT, async (req, res) => {
      const watchListData = req.body;
      const query = {
        userEmail: watchListData?.userEmail,
        productId: watchListData?.productId,
      };
      const isExist = await watchListCollections.findOne(query);
      if (isExist) {
        return res.send({ message: "This item already in watchList" });
      }
      const result = await watchListCollections.insertOne(watchListData);
      res.send(result);
    });

    //watch list get APi
    app.get("/my_watchList/:email", verifyJWT, async (req, res) => {
      const { email } = req.params;
      const query = { userEmail: email };
      const result = await watchListCollections.find(query).toArray();
      res.send(result);
    });

    //delete Watchlist api
    app.delete("/watchList/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      try {
        const result = await watchListCollections.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
          return res.status(404).send({ message: "Watchlist item not found" });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    });

    //Reviews post Api
    app.post("/reviews", verifyJWT, async (req, res) => {
      const reviewData = req.body;
      const query = {
        productId: reviewData?.productId,
        userEmail: reviewData?.userEmail,
      };
      const isExist = await reviewsCollections.findOne(query);
      if (isExist) {
        return res.send({ message: "You have already reviewed this product." });
      }
      const result = await reviewsCollections.insertOne(reviewData);
      res.send(result);
    });

    //Review get Api
    app.get("/reviews/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = {
        productId: id,
      };
      const result = await reviewsCollections.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    });

    // Add New Advertisement
    app.post("/advertisements", async (req, res) => {
      const ad = req.body;
      try {
        const result = await advertisementCollections.insertOne(ad);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add advertisement" });
      }
    });

    // GET /my-advertisements/:email
    app.get("/myAdvertisements/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const ads = await advertisementCollections.find({ vendor_email: email }).toArray();
        res.send(ads);
      } catch (err) {
        res.status(500).send({ message: "Failed to fetch advertisements", error: err.message });
      }
    });

    //Advertise Update API
    app.patch("/myAdvertisements/:id", async (req, res) => {
      const id = req.params.id;
      const updatedAd = req.body;

      try {
        const result = await advertisementCollections.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title: updatedAd.title,
              description: updatedAd.description,
              image: updatedAd.image,
              updated_at: new Date(),
            },
          }
        );

        res.send(result);
      } catch (error) {
        console.error("Error updating advertisement:", error);
        res.status(500).send({ message: "Failed to update advertisement" });
      }
    });

    //Advertise delete API
    app.delete("/myAdvertisements/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await db.collection("advertisements").deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
          res.send({ success: true, message: "Advertisement deleted successfully" });
        } else {
          res.status(404).send({ success: false, message: "Advertisement not found" });
        }
      } catch (err) {
        res.status(500).send({ message: "Failed to delete advertisement", error: err.message });
      }
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
