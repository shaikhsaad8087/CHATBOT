import os
from flask import Flask, render_template, request, jsonify
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static')
application = app

# Initialize the model lazily to prevent startup crashes if the key is missing
def get_model():
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return None
    return ChatGroq(model="llama-3.1-8b-instant", groq_api_key=api_key)

model = get_model()

# Bot Prompt Templates
PROMPTS = {
    'general': ChatPromptTemplate.from_messages([
        ("system", """You are a helpful and professional AI assistant.
- By default, give short, friendly answers (1-2 sentences).
- If the user asks for explanation, details, or uses words like "explain", "why", "how", "in detail", provide a longer, detailed answer.
- Maintain a conversational tone and occasionally use relevant emojis for friendliness.
- Always match the user's intent."""),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{message}")
    ]),
    'expert': ChatPromptTemplate.from_messages([
        ("system", "You are a world-class {domain} expert. Provide deep insights and technical accuracy."),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "Explain in simple terms: {message}")
    ]),
    'support': ChatPromptTemplate.from_messages([
        ("system", "You are a helpful customer support agent. Be polite, empathetic, and focus on solving the user's problem."),
        MessagesPlaceholder(variable_name="chat_history"),
        ("human", "{message}")
    ])
}

# Directory for persistent history
HISTORY_DIR = 'history'
# Only attempt to create directory if we aren't in a serverless environment
# or use /tmp if we really need a temporary writeable space
IS_VERCEL = "VERCEL" in os.environ

if not IS_VERCEL:
    if not os.path.exists(HISTORY_DIR):
        try:
            os.makedirs(HISTORY_DIR)
        except Exception as e:
            print(f"Warning: Could not create history directory: {e}")

chat_sessions = {}

def load_history(session_id):
    history = []
    file_path = os.path.join(HISTORY_DIR, f"{session_id}.txt")
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                if line.startswith('HumanMessage'):
                    try:
                        content = line.split('content="')[1].rsplit('")', 1)[0]
                        history.append(HumanMessage(content=content))
                    except: continue
                elif line.startswith('AIMessage'):
                    try:
                        content = line.split('content="')[1].rsplit('")', 1)[0]
                        history.append(AIMessage(content=content))
                    except: continue
    return history

def save_message_to_file(session_id, sender, content):
    if IS_VERCEL:
        return # Skip file persistence on Vercel
    
    try:
        file_path = os.path.join(HISTORY_DIR, f"{session_id}.txt")
        with open(file_path, 'a', encoding='utf-8') as f:
            clean_content = content.replace('\n', ' ')
            if sender == 'user':
                f.write(f'HumanMessage(content="{clean_content}")\n')
            else:
                f.write(f'AIMessage(content="{clean_content}")\n')
    except Exception as e:
        print(f"Error saving to file: {e}")

def serialize_message(msg):
    if isinstance(msg, HumanMessage):
        return {'sender': 'user', 'text': msg.content}
    elif isinstance(msg, AIMessage):
        return {'sender': 'bot', 'text': msg.content}
    return {'sender': 'unknown', 'text': str(msg.content)}

@app.route('/')
def index():
    try:
        return render_template('index.html')
    except Exception as e:
        return f"Template Error: {str(e)}", 500

@app.route('/health')
def health():
    return jsonify({
        "status": "healthy",
        "is_vercel": IS_VERCEL,
        "has_api_key": os.getenv("GROQ_API_KEY") is not None
    })

@app.route('/sessions', methods=['GET'])
def list_sessions():
    sessions = []
    if os.path.exists(HISTORY_DIR):
        for filename in sorted(os.listdir(HISTORY_DIR), reverse=True):
            if filename.endswith('.txt'):
                sessions.append(filename.replace('.txt', ''))
    return jsonify(sessions)

@app.route('/delete_session', methods=['POST'])
def delete_session():
    data = request.json
    session_id = data.get('session_id')
    if not session_id:
        return jsonify({'status': 'error', 'message': 'No session ID provided'}), 400
    
    file_path = os.path.join(HISTORY_DIR, f"{session_id}.txt")
    if os.path.exists(file_path):
        os.remove(file_path)
        if session_id in chat_sessions:
            del chat_sessions[session_id]
        return jsonify({'status': 'success'})
    return jsonify({'status': 'error', 'message': 'Session not found'}), 404

@app.route('/history', methods=['POST'])
def history():
    data = request.json
    session_id = data.get('session_id', 'default')
    
    # Reload from file to ensure sync
    chat_sessions[session_id] = load_history(session_id)
    
    serialized = [serialize_message(msg) for msg in chat_sessions[session_id]]
    return jsonify(serialized)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message')
    session_id = data.get('session_id', 'default')
    bot_type = data.get('bot_type', 'general')
    domain = data.get('domain', 'General')

    if session_id not in chat_sessions:
        chat_sessions[session_id] = load_history(session_id)

    prompt_template = PROMPTS.get(bot_type, PROMPTS['general'])

    try:
        current_model = get_model()
        if not current_model:
            return jsonify({
                'status': 'error',
                'message': 'GROQ_API_KEY is missing in Vercel Environment Variables. Please add it in the Vercel Dashboard.'
            }), 500

        chain = prompt_template | current_model
        result = chain.invoke({
            "chat_history": chat_sessions[session_id],
            "message": user_message,
            "domain": domain
        })
        
        ai_message = result.content
        chat_sessions[session_id].append(HumanMessage(content=user_message))
        chat_sessions[session_id].append(AIMessage(content=ai_message))
        
        save_message_to_file(session_id, 'user', user_message)
        save_message_to_file(session_id, 'bot', ai_message)

        return jsonify({
            'status': 'success',
            'message': ai_message
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)
