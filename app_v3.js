import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import session from "express-session";

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Use CORS middleware
app.use(cors({
    credentials: true,
    origin: 'https://unveilgenius.netlify.app',
}));

// Session setup
const sessionOptions = {
    secret: "any string",
    resave: false,
    saveUninitialized: false,
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

// Function to send an initial message to the OpenAI API
async function sendInitialMessage(req) {
    const initialMessage = "As Richard Feynman, the famous physicist, you are currently guiding a tour at a science museum for middle and high school students.";
    try {
        const chatCompletion = await client.chat.completions.create({
            messages: [{ role: "system", content: initialMessage }],
            model: "gpt-3.5-turbo",
        });

        // Store the initial context in the session
        req.session.conversationContext = [{ role: "system", content: initialMessage }];
        req.session.conversationContext.push({
            role: "assistant",
            content: "Hello! Which exhibit would you like to start with?",
        });

        return chatCompletion;
    } catch (error) {
        console.error('Error sending initial message:', error);
        throw error; // Propagate the error to handle it in the calling function
    }
}

// Define your routes here
app.post('/api/assistant/thread/message', async (req, res) => {
    try {
        const { content } = req.body;
        const sessionId = req.sessionID;
        console.log(`Received message for session ${sessionId}: ${content}`);

        // Initialize or retrieve conversation context
        let conversationContext = req.session.conversationContext || [];

        // Check if the conversation context is empty and send initial message
        if (conversationContext.length === 0) {
            await sendInitialMessage(req);
            conversationContext = req.session.conversationContext;
        }

        // Append user message to the context
        conversationContext.push({ role: "user", content });

        // Send the message using OpenAI's chat.completions.create method
        const chatCompletion = await client.chat.completions.create({
            messages: conversationContext,
            model: "gpt-3.5-turbo",
        });

        // Append assistant's response to the context
        const assistantMessage = chatCompletion.choices[0].message;
        conversationContext.push({ role: "assistant", content: assistantMessage.content });

        // Store updated context back in session
        req.session.conversationContext = conversationContext;

        res.json({ choices: [{ message: assistantMessage }] });
    } catch (error) {
        console.error('Error handling message:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
