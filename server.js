require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ DB Active'))
    .catch(e => console.error('❌ DB Error:', e));

const User = mongoose.model('User', new mongoose.Schema({ id: String, email: { type: String, unique: true }, password: { type: String, required: true }, name: String, role: String }));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// --- API ---
app.get('/', (req, res) => res.send('Backend Live'));

app.post('/attempts', async (req, res) => {
    try {
        const data = req.body;
        if (!data.id) data.id = uuidv4();
        if (!data.timestamp) data.timestamp = Date.now();
        await new Attempt(data).save();
        res.json({ message: "Saved" });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/attempts', async (req, res) => {
    const { teacherId, studentId } = req.query;
    let q = {};
    if (teacherId) q.teacherId = teacherId;
    if (studentId) q.studentId = studentId;
    res.json(await Attempt.find(q).sort({ timestamp: -1 }));
});

app.delete('/attempts/:id', async (req, res) => {
    await Attempt.findOneAndDelete({ id: req.params.id });
    res.status(204).send();
});

// Video Upload
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, `proct_${Date.now()}.mp4`)
});
const upload = multer({ storage });
app.post('/proctoring/upload', upload.single('video'), (req, res) => {
    const host = req.get('host');
    res.json({ url: `https://${host}/uploads/${req.file.filename}` });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Running on ${PORT}`));









