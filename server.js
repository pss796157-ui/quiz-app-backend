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

mongoose.connect(process.env.MONGODB_URI).then(() => console.log('DB Live')).catch(e => console.error(e));

const User = mongoose.model('User', new mongoose.Schema({ id: String, email: { type: String, unique: true }, password: { type: String, required: true }, name: String, role: String }));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// 🚩 MASTER RESET
app.get('/dev/factory-reset', async (req, res) => {
    await User.deleteMany({});
    await Group.deleteMany({});
    await Question.deleteMany({});
    await Attempt.deleteMany({});
    res.json({ message: "Success: All database records have been deleted." });
});

// 🗑️ DELETE ROUTES
app.delete('/auth/account', async (req, res) => {
    const uid = req.query.uid;
    await User.findOneAndDelete({ id: uid });
    await Group.deleteMany({ teacherId: uid });
    await Attempt.deleteMany({ $or: [{ teacherId: uid }, { studentId: uid }] });
    res.status(204).send();
});

app.delete('/groups/:id', async (req, res) => {
    await Group.findOneAndDelete({ id: req.params.id });
    await Question.deleteMany({ groupId: req.params.id });
    res.status(204).send();
});

app.delete('/attempts/:id', async (req, res) => {
    await Attempt.findOneAndDelete({ id: req.params.id });
    res.status(204).send();
});

// LOGIN / SIGNUP / OTHERS (Same as before)
app.get('/', (req, res) => res.send('Server Active'));
app.post('/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, password });
    user ? res.json(user) : res.status(401).send();
});
app.post('/auth/signup', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    res.json(await new User(data).save());
});
app.get('/groups', async (req, res) => res.json(await Group.find({ teacherId: req.query.teacherId })));
app.post('/groups', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    res.json(await Group.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true }));
});
app.get('/groups/search', async (req, res) => {
    const { subjectCode, passKey } = req.query;
    const group = await Group.findOne({ subjectCode: new RegExp(`^${subjectCode}$`, 'i'), passKey: new RegExp(`^${passKey}$`, 'i') });
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
    data.id = uuidv4();
    await new Attempt(data).save();
    res.json({ message: "Saved" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Live on ${PORT}`));

