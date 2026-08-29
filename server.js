require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health Check Route
app.get('/', (req, res) => {
    res.send('<h1>Quiz App Backend is Live!</h1>');
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('Could not connect to MongoDB:', err));

// Schemas & Models
const userSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4 },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: String,
    role: String
});
const User = mongoose.model('User', userSchema);

const groupSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4 },
    name: String,
    teacherId: String,
    subjectCode: String,
    passKey: String,
    timeLimit: Number
});
const Group = mongoose.model('Group', groupSchema);

const questionSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4 },
    text: String,
    optionA: String,
    optionB: String,
    optionC: String,
    optionD: String,
    correctOption: String,
    groupId: String
});
const Question = mongoose.model('Question', questionSchema);

const attemptSchema = new mongoose.Schema({
    id: { type: String, default: uuidv4 },
    studentId: String,
    studentName: String,
    teacherId: String,
    groupId: String,
    subjectName: String,
    score: Number,
    totalQuestions: Number,
    videoPath: String,
    timestamp: { type: Number, default: Date.now }
});
const Attempt = mongoose.model('Attempt', attemptSchema);

// Video Upload Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `proctoring_${Date.now()}.mp4`);
    }
});
const upload = multer({ storage });

// --- API Endpoints ---

// Login
app.post('/auth/login', async (req, res) => {
    console.log('Login Attempt:', req.body.email);
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email, password });
        if (user) {
            console.log('Login Success:', email);
            res.json(user);
        } else {
            console.log('Login Failed: Invalid credentials for', email);
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (e) {
        console.error('Login Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Signup
app.post('/auth/signup', async (req, res) => {
    console.log('Signup Attempt:', req.body.email);
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in Environment Variables');
        }
        const userData = req.body;
        const existing = await User.findOne({ email: userData.email });
        if (existing) {
            console.log('Signup Failed: User already exists');
            return res.status(409).json({ message: "User exists" });
        }

        const user = new User(userData);
        await user.save();
        console.log('Signup Success:', user.email);
        res.json(user);
    } catch (e) {
        console.error('Signup Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Groups
app.get('/groups', async (req, res) => {
    try {
        const groups = await Group.find({ teacherId: req.query.teacherId });
        res.json(groups);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/groups', async (req, res) => {
    try {
        const groupData = req.body;
        if (groupData.id && groupData.id.length > 5) {
            // Update existing
            const updated = await Group.findOneAndUpdate({ id: groupData.id }, groupData, { new: true });
            return res.json(updated);
        }
        // Create new
        const group = new Group(groupData);
        if (!group.id) group.id = uuidv4();
        await group.save();
        res.json(group);
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/groups/:id', async (req, res) => {
    try {
        await Group.findOneAndDelete({ id: req.params.id });
        // Also delete questions associated with this group
        await Question.deleteMany({ groupId: req.params.id });
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/groups/search', async (req, res) => {
    try {
        const { subjectCode, passKey } = req.query;
        const group = await Group.findOne({
            subjectCode: new RegExp(`^${subjectCode}$`, 'i'),
            passKey: new RegExp(`^${passKey}$`, 'i')
        });
        if (group) res.json(group);
        else res.status(404).json({ message: "Not found" });
    } catch (e) { res.status(500).send(e.message); }
});

// Questions
app.get('/questions', async (req, res) => {
    try {
        const questions = await Question.find({ groupId: req.query.groupId });
        res.json(questions);
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/questions', async (req, res) => {
    try {
        const q = new Question(req.body);
        await q.save();
        res.json(q);
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/questions/:id', async (req, res) => {
    try {
        await Question.findOneAndDelete({ id: req.params.id });
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

// Attempts
app.post('/attempts', async (req, res) => {
    try {
        const attempt = new Attempt(req.body);
        await attempt.save();
        res.json({ message: "Saved" });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/attempts', async (req, res) => {
    try {
        const { teacherId, studentId } = req.query;
        let query = {};
        if (teacherId) query.teacherId = teacherId;
        if (studentId) query.studentId = studentId;
        const attempts = await Attempt.find(query).sort({ timestamp: -1 });
        res.json(attempts);
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/attempts/:id', async (req, res) => {
    try {
        await Attempt.findOneAndDelete({ id: req.params.id });
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

app.delete('/auth/account', async (req, res) => {
    try {
        const { uid } = req.query;
        await User.findOneAndDelete({ id: uid });
        // Optional: Delete user's groups, attempts etc.
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

// Video Upload
app.post('/proctoring/upload', upload.single('video'), (req, res) => {
    // Cloud URL will be handled by Render domain
    const host = req.get('host');
    const url = `${req.protocol}://${host}/uploads/${req.file.filename}`;
    res.json({ url });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

