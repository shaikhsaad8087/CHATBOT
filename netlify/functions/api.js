const https = require('https');

// Helper function to perform HTTPS POST requests to Groq API
function queryGroq(apiKey, messages) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: messages
        });

        const options = {
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    body: data
                });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

exports.handler = async function(event, context) {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'error', message: 'Method Not Allowed' })
        };
    }

    // Check API key inside the handler (safest for hot/cold environments)
    const api_key = process.env.GROQ_API_KEY;
    if (!api_key) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'error',
                message: 'GROQ_API_KEY is missing in Netlify Environment Variables. Please add it in the Netlify Dashboard.'
            })
        };
    }

    let body;
    try {
        body = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'error', message: 'Invalid JSON body' })
        };
    }

    const { message, bot_type, domain, history } = body;

    if (!message) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'error', message: 'Message is required' })
        };
    }

    // Build system prompt based on chatbot mode
    let systemPrompt = "";
    if (bot_type === 'expert') {
        systemPrompt = `You are a world-class ${domain || 'General'} expert. Provide deep insights and technical accuracy. Explain in simple terms.`;
    } else if (bot_type === 'support') {
        systemPrompt = "You are a helpful customer support agent. Be polite, empathetic, and focus on solving the user's problem.";
    } else {
        systemPrompt = `You are a helpful and professional AI assistant.
- By default, give short, friendly answers (1-2 sentences).
- If the user asks for explanation, details, or uses words like "explain", "why", "how", "in detail", provide a longer, detailed answer.
- Maintain a conversational tone and occasionally use relevant emojis for friendliness.
- Always match the user's intent.`;
    }

    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // Map history to OpenAI message format
    if (Array.isArray(history)) {
        // Since the client saves the message to localStorage before making this API request,
        // the last item in the history is the current message. We slice to get only the true past context.
        const pastMessages = history.slice(0, -1);
        pastMessages.forEach(msg => {
            if (msg.sender === 'user') {
                messages.push({ role: 'user', content: msg.text });
            } else if (msg.sender === 'bot') {
                messages.push({ role: 'assistant', content: msg.text });
            }
        });
    }

    // Append current message
    messages.push({ role: 'user', content: message });

    try {
        const response = await queryGroq(api_key, messages);

        if (!response.ok) {
            return {
                statusCode: response.status,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'error',
                    message: `Groq API Error (${response.status}): ${response.body}`
                })
            };
        }

        const data = JSON.parse(response.body);
        const aiMessage = data.choices[0].message.content;

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'success',
                message: aiMessage
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'error',
                message: `Server Error: ${error.message}`
            })
        };
    }
};
