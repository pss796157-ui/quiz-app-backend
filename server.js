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
    .then(() => console.log('✅ Database Connected and Ready'))
    .catch(err => console.error('❌ DB Error:', err));

// Models
const User = mongoose.model('User', new mongoose.Schema({ id: String, email: { type: String, unique: true }, password: { type: String, required: true }, name: String, role: String }));
const Group = mongoose.model('Group', new mongoose.Schema({ id: String, name: String, teacherId: String, subjectCode: String, passKey: String, timeLimit: Number }));
const Question = mongoose.model('Question', new mongoose.Schema({ id: String, text: String, optionA: String, optionB: String, optionC: String, optionD: String, correctOption: String, groupId: String }));
const Attempt = mongoose.model('Attempt', new mongoose.Schema({ id: String, studentId: String, studentName: String, teacherId: String, groupId: String, subjectName: String, score: Number, totalQuestions: Number, videoPath: String, timestamp: { type: Number, default: Date.now } }));

// --- 🗑️ SMART DELETE SYSTEM ---

// Delete Account (Teacher/Student)
app.delete('/auth/account', async (req, res) => {
    try {
        const uid = req.query.uid;
        if (!uid) return res.status(400).send("User ID is missing");
        
        await User.findOneAndDelete({ id: uid });
        await Group.deleteMany({ teacherId: uid });
        await Attempt.deleteMany({ $or: [{ teacherId: uid }, { studentId: uid }] });
        
        console.log(`Deleted user: ${uid}`);
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

// Delete Group (Teacher Only)
app.delete('/groups/:id', async (req, res) => {
    try {
        const gid = req.params.id;
        await Group.findOneAndDelete({ id: gid });
        await Question.deleteMany({ groupId: gid });
        await Attempt.deleteMany({ groupId: gid });
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

// Delete Result/Attempt (Both can delete their respective view)
app.delete('/attempts/:id', async (req, res) => {
    try {
        const aid = req.params.id;
        // Search by both custom ID and MongoDB _id
        const filter = { $or: [{ id: aid }, { _id: mongoose.Types.ObjectId.isValid(aid) ? aid : null }] };
        await Attempt.findOneAndDelete(filter);
        res.status(204).send();
    } catch (e) { res.status(500).send(e.message); }
});

// --- 🎥 PROCTORING UPLOAD FIX ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `video_${Date.now()}_${uuidv4().substring(0, 5)}.mp4`)
});
const upload = multer({ storage });

app.post('/proctoring/upload', upload.single('video'), (req, res) => {
    try {
        if (!req.file) return res.status(400).send("No video file received");
        const host = req.get('host');
        const protocol = host.includes('onrender.com') ? 'https' : 'http';
        const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
        res.json({ url: fileUrl });
    } catch (e) { res.status(500).send(e.message); }
});

// --- OTHERS ---
app.get('/', (req, res) => res.send('Quiz App Backend is Live'));
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
    if (!data.id) data.id = uuidv4();
    await new Attempt(data).save();
    res.json({ message: "Saved" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on ${PORT}`));

