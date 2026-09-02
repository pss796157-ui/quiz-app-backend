require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection with extra safety
mongoose.connect(process.env.MONGODB_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
}).then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err.message));

// User Schema with Unique Email check
const userSchema = new mongoose.Schema({
    id: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: String,
    role: String
});
const User = mongoose.model('User', userSchema);

const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// --- API ROUTES ---

app.get('/', (req, res) => res.send('Server is Live!'));

// Fixed Signup with 409 error handling for duplicate emails
app.post('/auth/signup', async (req, res) => {
    console.log('Signup Attempt:', req.body.email);
    try {
        const { email, password, name, role } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('Signup Failed: User exists');
            return res.status(409).json({ error: "Email already registered" });
        }

        const newUser = new User({
            id: uuidv4(),
            email,
            password,
            name,
            role
        });

        await newUser.save();
        console.log('Signup Success:', email);
        res.json(newUser);
    } catch (e) {
        console.error('Signup Error:', e.message);
        res.status(500).json({ error: "Internal Server Error. Please check MongoDB logs." });
    }
});

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email, password });
        if (user) res.json(user);
        else res.status(401).json({ error: "Invalid credentials" });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/groups', async (req, res) => res.json(await Group.find({ teacherId: req.query.teacherId })));
app.post('/groups', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    res.json(await Group.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true }));
});

app.get('/groups/search', async (req, res) => {
    const { subjectCode, passKey } = req.query;
    const group = await Group.findOne({ 
        subjectCode: new RegExp(`^${subjectCode}$`, 'i'), 
        passKey: new RegExp(`^${passKey}$`, 'i') 
    });
    group ? res.json(group) : res.status(404).send();
});

app.get('/questions', async (req, res) => res.json(await Question.find({ groupId: req.query.groupId })));
app.post('/questions', async (req, res) => {
    const data = req.body;
    data.id = uuidv4();
    res.json(await new Question(data).save());
});

app.get('/attempts', async (req, res) => {
    const { teacherId, studentId } = req.query;
    let q = {};
    if (teacherId) q.teacherId = teacherId;
    if (studentId) q.studentId = studentId;
    res.json(await Attempt.find(q).sort({ timestamp: -1 }));
});

app.post('/attempts', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    await new Attempt(data).save();
    res.json({ message: "Saved" });
});

app.delete('/auth/account', async (req, res) => {
    const uid = req.query.uid;
    await User.findOneAndDelete({ id: uid });
    await Group.deleteMany({ teacherId: uid });
    await Attempt.deleteMany({ $or: [{ teacherId: uid }, { studentId: uid }] });
    res.status(204).send();
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));









