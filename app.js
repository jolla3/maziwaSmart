// entry files
const express = require('express')
const mongoose = require('mongoose')
const cors= require('cors')
require('dotenv').config()

// middleware
const app = express()
app.use(express.json())
app.use(cors())


// login/register routes
const userAuth=require('./routes/authRouter')
app.use('/api/userAuth',userAuth)



// mongoose.connection to the db
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('connected to MongoDb'))
.catch(err => console.log("MongoDB connection error",err))


const Port= 5000
app.listen(Port,()=>{
    console.log(`server is runing on port ${Port}`)
})
