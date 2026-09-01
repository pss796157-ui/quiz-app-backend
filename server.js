require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Database Schemas
const User = mongoose.model('User', new mongoose.Schema({ id: String, email: { type: String, unique: true }, password: { type: String, required: true }, name: String, role: String }));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// --- DELETE LOGIC ---

// 1. Permanent Account Delete (Teacher/Student)
app.delete('/auth/account', async (req, res) => {
    try {
        const { uid } = req.query;
        console.log(`Deleting Account: ${uid}`);
        await User.findOneAndDelete({ id: uid });
        await Group.deleteMany({ teacherId: uid });
        await Attempt.deleteMany({ $or: [{ teacherId: uid }, { studentId: uid }] });
        res.status(200).json({ message: "Account and all associated data deleted." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Delete Group (Passkey) & Questions
app.delete('/groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Deleting Group: ${id}`);
        await Group.findOneAndDelete({ id: id });
        await Question.deleteMany({ groupId: id });
        await Attempt.deleteMany({ groupId: id });
        res.status(200).json({ message: "Group deleted." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. Delete Student Marks (Attempt)
app.delete('/attempts/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`Deleting Result: ${id}`);
        const attempt = await Attempt.findOne({ id: id });
        // File deletion logic if needed (uploads folder cleanup)
        await Attempt.findOneAndDelete({ id: id });
        res.status(200).json({ message: "Result deleted." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. Delete Question
app.delete('/questions/:id', async (req, res) => {
    try {
        await Question.findOneAndDelete({ id: req.params.id });
        res.status(200).json({ message: "Question deleted." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- FACTORY RESET (Delete All) ---
app.get('/dev/wipe-all', async (req, res) => {
    await User.deleteMany({});
    await Group.deleteMany({});
    await Question.deleteMany({});
    await Attempt.deleteMany({});
    res.json({ message: "FACTORY RESET: All data wiped." });
});

// --- LOGIN/SIGNUP & OTHERS ---
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    user ? res.json(user) : res.status(401).json({ error: "Wrong credentials" });
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
    group ? res.json(group) : res.status(404).json({ error: "Invalid Code" });
});

app.get('/questions', async (req, res) => res.json(await Question.find({ groupId: req.query.groupId })));
app.post('/questions', async (req, res) => {
    const data = req.body;
    data.id = uuidv4();
    res.json(await new Question(data).save());
});

app.get('/attempts', async (req, res) => {
    const { teacherId, studentId } = req.query;
    let query = {};
    if (teacherId) query.teacherId = teacherId;
    if (studentId) query.studentId = studentId;
    res.json(await Attempt.find(query).sort({ timestamp: -1 }));
});

app.post('/attempts', async (req, res) => {
    const data = req.body;
    data.id = uuidv4();
    await new Attempt(data).save();
    res.json({ message: "Saved" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

