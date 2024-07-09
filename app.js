import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import session from "express-session";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Use CORS middleware
app.use(
    cors({
        credentials: true,
        // origin: process.env.FRONTEND_URL
        origin: 'https://unveilgenius.netlify.app',
    })
);

// Session setup
const sessionOptions = {
    secret: "any string",
    resave: false,
    saveUninitialized: false,
    cookie: {}
};
if (process.env.NODE_ENV !== "development") {
    sessionOptions.proxy = true;
    sessionOptions.cookie = {
        sameSite: "none",
        secure: true,
    };
}
app.use(session(sessionOptions));

// Use JSON parsing middleware
app.use(express.json());

// Initialize OpenAI client
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Path to store conversation data
// const conversationDataPath = path.join(__dirname, 'conversationData.json');
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const conversationDataPath = path.join(__dirname, 'conversationData.json');

// Load conversation data from file
function loadConversationData() {
    if (!fs.existsSync(conversationDataPath)) {
        return {};
    }
    const data = fs.readFileSync(conversationDataPath);
    return JSON.parse(data);
}

// Save converstaion data to file
function saveConversationData(data) {
    fs.writeFileSync(conversationDataPath, JSON.stringify(data, null, 2));
}

// Function to send an initial message to the OpenAI API
async function sendInitialMessage(sessionId) {
    const initialMessage = "As Richard Feynman, the famous physicist, you are currently guiding a tour at a science museum for middle and high school students. Start the conversation by asking them which exhbit they are at.";
    const chatCompletion = await client.chat.completions.create({
        messages: [{ role: "system", content: initialMessage }],
        model: "gpt-3.5-turbo",
        // model: "gpt-4o",
    });

    // Store the initial context in the data
    const conversationData = loadConversationData();
    conversationData[sessionId] = [{ role: "system", content: initialMessage }];
    saveConversationData(conversationData);

    return chatCompletion;
}

// Define your routes here
app.post('/api/assistant/thread/message', async (req, res) => {
    try {
        const { content } = req.body;
        const sessionId = req.sessionID;
        console.log(`Received message for session ${sessionId}: ${content}`);

        // Load conversation data
        const conversationData = loadConversationData();

        // Initialize conversation if it doesn't exist
        if (!conversationData[sessionId]) {
            await sendInitialMessage(sessionId);
        }

        // Append user message to the context
        conversationData[sessionId].push({ role: "user", content });

        // Send the message using OpenAI's chat.completions.create method
        const chatCompletion = await client.chat.completions.create({
            messages: conversationData[sessionId],
            model: "gpt-3.5-turbo",
            // model: "gpt-4o",
        });

        // Append assistant's response to the context
        const assistantMessage = chatCompletion.choices[0].message;
        conversationData[sessionId].push(assistantMessage);

        // Save conversation data
        saveConversationData(conversationData);

        res.json({ choices: [{ message: assistantMessage }] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});