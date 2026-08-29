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

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('DB Error:', err));

// Models
const User = mongoose.model('User', new mongoose.Schema({ 
    id: String, email: { type: String, unique: true }, password: { type: String, required: true }, 
    name: String, role: String, deviceId: String 
}));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// Video Upload Logic
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `proctoring_${Date.now()}.mp4`)
});
const upload = multer({ storage });

// API Endpoints
app.get('/', (req, res) => res.send('<h1>Secure Quiz Backend Live</h1>'));

app.post('/auth/login', async (req, res) => {
    const { email, password, deviceId } = req.body;
    const user = await User.findOne({ email, password });
    if (user) {
        if (user.deviceId && user.deviceId !== deviceId) {
            return res.status(403).json({ message: "Security Block: Account linked to another phone." });
        }
        res.json(user);
    } else res.status(401).json({ message: "Invalid credentials" });
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
    await Attempt.deleteMany({ teacherId: uid }); // Thorough delete
    res.status(204).send();
});

app.get('/groups', async (req, res) => res.json(await Group.find({ teacherId: req.query.teacherId })));
app.post('/groups', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
    res.json(await Group.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true }));
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

app.get('/questions', async (req, res) => res.json(await Question.find({ groupId: req.query.groupId })));
app.post('/questions', async (req, res) => {
    const data = req.body;
    if (!data.id) data.id = uuidv4();
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

app.post('/proctoring/upload', upload.single('video'), (req, res) => {
    const host = req.get('host');
    // Force HTTPS for Render cloud
    const url = `https://${host}/uploads/${req.file.filename}`;
    res.json({ url });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
