import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import session from "express-session";
import helmet from 'helmet';
import axios from 'axios'; // For making HTTP requests

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();

// Use Helmet for setting security-related HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "frame-ancestors": ["'self'", "https://unveilgenius.netlify.app"],
        },
    },
}));

// Use CORS middleware
app.use(
    cors({
        credentials: true,
        origin: 'https://unveilgenius.netlify.app',
    })
);

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

// In-memory store for conversation contexts
const conversationContexts = {};

// Function to send an initial message to the OpenAI API
async function sendInitialMessage(threadId, exhibit) {
    try {
        const initialMessage = `As Richard Feynman, the famous physicist, you are currently guiding a tour at the ${exhibit} exhibit in a science museum for middle and high school students.`;
        const chatCompletion = await client.chat.completions.create({
            messages: [{ role: "system", content: initialMessage }],
            model: "gpt-4o-mini",
        });

        // Store the initial context in memory
        conversationContexts[threadId] = [{ role: "system", content: initialMessage }];

        console.log('Initial message sent to OpenAI:', chatCompletion);
    } catch (error) {
        console.error('Error sending initial message:', error);
    }
}

// ElevenLabs TTS Function
async function getSpeechFromText(text) {
    try {
        const response = await axios.post(
            'https://api.elevenlabs.io/v1/text-to-speech/CwhRBWXzGAHq8TQ4Fs17', // Replace with the correct endpoint
            { text }, // Payload
            {
                headers: {
                    'Content-Type': 'application/json',
                    'xi-api-key': process.env.ELEVENLABS_API_KEY,
                },
                responseType: 'arraybuffer', // To handle audio data
            }
        );

        // Return the audio data as a base64 string or save it to a file and return its URL
        return `data:audio/mp3;base64,${response.data.toString('base64')}`;
    } catch (error) {
        console.error('Error generating speech:', error);
        throw new Error('Failed to generate speech.');
    }
}

// Define your routes here
app.post('/api/assistant/thread/message', async (req, res) => {
    try {
        const { thread_id, content, exhibit } = req.body; // Include exhibit in the request body
        console.log(`Received message for thread ${thread_id}: ${content}`);

        // Initialize conversation if it doesn't exist
        if (!conversationContexts[thread_id]) {
            await sendInitialMessage(thread_id, exhibit);
        }

        // Append user message to the context
        conversationContexts[thread_id].push({ role: "user", content });

        // Send the message using OpenAI's chat.completions.create method
        const chatCompletion = await client.chat.completions.create({
            messages: conversationContexts[thread_id],
            model: "gpt-4o-mini",
        });

        // Append assistant's response to the context
        const assistantMessage = chatCompletion.choices[0].message;
        conversationContexts[thread_id].push(assistantMessage);

        // Generate speech from assistant's response
        const speechAudio = await getSpeechFromText(assistantMessage.content);

        res.json({
            choices: [{ message: assistantMessage }],
            audio: speechAudio, // Add audio data to response
        });
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
