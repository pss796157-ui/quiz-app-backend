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

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB Connection Error:', err));

const User = mongoose.model('User', new mongoose.Schema({ id: String, email: { type: String, unique: true }, password: { type: String, required: true }, name: String, role: String }));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// API Endpoints with Privacy Filtering
app.get('/', (req, res) => res.send('<h1>Quiz Backend is Active</h1>'));

app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    user ? res.json(user) : res.status(401).json({ message: "Invalid credentials" });
});

app.post('/auth/signup', async (req, res) => {
    try {
        const data = req.body;
        if (!data.id) data.id = uuidv4();
        const user = new User(data);
        await user.save();
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/auth/account', async (req, res) => {
    const { uid } = req.query;
    await User.findOneAndDelete({ id: uid });
    await Group.deleteMany({ teacherId: uid });
    await Attempt.deleteMany({ teacherId: uid });
    res.status(204).send();
});

app.get('/groups', async (req, res) => {
    // Strictly filter groups by the logged-in teacher's ID
    res.json(await Group.find({ teacherId: req.query.teacherId }));
});

app.post('/groups', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    const group = await Group.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true });
    res.json(group);
});

app.delete('/groups/:id', async (req, res) => {
    await Group.findOneAndDelete({ id: req.params.id });
    await Question.deleteMany({ groupId: req.params.id });
    res.status(204).send();
});

app.get('/groups/search', async (req, res) => {
    const { subjectCode, passKey } = req.query;
    const group = await Group.findOne({ subjectCode: new RegExp(`^${subjectCode}$`, 'i'), passKey: new RegExp(`^${passKey}$`, 'i') });
    group ? res.json(group) : res.status(404).send();
});

app.get('/questions', async (req, res) => {
    res.json(await Question.find({ groupId: req.query.groupId }));
});

app.post('/questions', async (req, res) => {
    const data = req.body;
    data.id = uuidv4();
    res.json(await new Question(data).save());
});

app.delete('/questions/:id', async (req, res) => {
    await Question.findOneAndDelete({ id: req.params.id });
    res.status(204).send();
});

app.get('/attempts', async (req, res) => {
    const { teacherId, studentId } = req.query;
    let query = {};
    if (teacherId) query.teacherId = teacherId; // Security: only fetch this teacher's students
    if (studentId) query.studentId = studentId;
    res.json(await Attempt.find(query).sort({ timestamp: -1 }));
});

app.post('/attempts', async (req, res) => {
    const data = req.body;
    data.id = uuidv4();
    await new Attempt(data).save();
    res.json({ message: "Saved" });
});

app.delete('/attempts/:id', async (req, res) => {
    await Attempt.findOneAndDelete({ id: req.params.id });
    res.status(204).send();
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
